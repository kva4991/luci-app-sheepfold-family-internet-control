import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import uuid

import ydb

# §feedback
MAX_FEEDBACK_PER_HOUR = 5
INSTALL_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
ALLOWED_CATEGORIES = {"bug", "idea", "question", "other"}
ALLOWED_SOURCES = {"luci", "android"}
ALLOWED_DIAGNOSTICS = {
    "kernelVersion", "uptime", "loadAverage", "memory", "storageSpace",
    "internetStatus", "internetReason", "pingYandexMs", "lanPortsCount",
    "wifiCount", "wifiSummary", "podkopInstalled", "podkopVersion",
    "adguardInstalled", "adguardVersion", "language", "integrationMode",
    "detectionMode", "autoConfigure", "newDevicePolicy", "globalBlock",
    "activeMessenger", "updateMode", "logging", "logLevel", "logStorage",
    "domainAllowlistEnabled", "siteBlocklistMode", "wifiAutoEnableMode",
    "wifiAutoDisableMode", "aiEnabled", "aiProvider", "accessPriority",
    "scheduleConflictInternet", "deviceCount", "groupCount", "scheduleCount",
    "administratorCount", "allowlistCount", "blocklistCount",
}
driver = None


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"},
        "isBase64Encoded": False,
        "body": json.dumps(payload, ensure_ascii=False),
    }


def text_field(payload, name, minimum, maximum):
    value = payload.get(name, "")
    if not isinstance(value, str):
        raise ValueError(name)
    value = value.strip()
    if len(value) < minimum or len(value) > maximum:
        raise ValueError(name)
    return value


def diagnostics_field(payload):
    include_diagnostics = payload.get("includeDiagnostics")
    if not isinstance(include_diagnostics, bool):
        raise ValueError("includeDiagnostics")
    diagnostics = payload.get("diagnostics", {})
    if not isinstance(diagnostics, dict):
        raise ValueError("diagnostics")
    if not include_diagnostics and diagnostics:
        raise ValueError("diagnosticsWithoutConsent")
    if set(diagnostics) - ALLOWED_DIAGNOSTICS:
        raise ValueError("unknownDiagnostics")

    # Облако повторно применяет белый список: одного ограничения на роутере
    # недостаточно, потому что публичный endpoint могут вызвать напрямую.
    clean = {}
    for key, value in diagnostics.items():
        if not isinstance(value, str) or len(value) > 500:
            raise ValueError(key)
        clean[key] = value.strip()
    encoded = json.dumps(clean, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 8_192:
        raise ValueError("diagnosticsSize")
    return encoded


def request_payload(event):
    body = event.get("body", "") if isinstance(event, dict) else ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body, validate=True).decode("utf-8")
    if isinstance(body, dict):
        return body
    if not isinstance(body, str) or len(body.encode("utf-8")) > 32_768:
        raise ValueError("body")
    return json.loads(body)


def ydb_driver():
    global driver
    if driver is None:
        endpoint = os.environ["YDB_ENDPOINT"]
        database = os.environ["YDB_DATABASE"]
        # Cloud Function получает короткоживущие IAM-токены через metadata service.
        # Постоянный ключ сервисного аккаунта для этого не нужен.
        driver = ydb.Driver(
            endpoint=endpoint,
            database=database,
            credentials=ydb.iam.MetadataUrlCredentials(),
        )
        driver.wait(fail_fast=True, timeout=8)
    return driver


def typed_text(value):
    return ydb.TypedValue(value, ydb.PrimitiveType.Utf8)


def recent_count(session, install_hash):
    query = """
        DECLARE $install_hash AS Utf8;
        SELECT COUNT(*) AS feedback_count
        FROM feedback
        WHERE install_hash = $install_hash
          AND created_at >= CurrentUtcTimestamp() - Interval("PT1H");
    """
    result_sets = session.transaction().execute(
        query,
        {"$install_hash": typed_text(install_hash)},
        commit_tx=True,
    )
    return int(result_sets[0].rows[0].feedback_count)


def insert_feedback(session, values):
    query = """
        DECLARE $install_hash AS Utf8;
        DECLARE $id AS Utf8;
        DECLARE $source AS Utf8;
        DECLARE $category AS Utf8;
        DECLARE $subject AS Utf8;
        DECLARE $message AS Utf8;
        DECLARE $contact AS Utf8;
        DECLARE $app_version AS Utf8;
        DECLARE $product_variant AS Utf8;
        DECLARE $router_model AS Utf8;
        DECLARE $firmware_version AS Utf8;
        DECLARE $diagnostics_json AS Utf8;

        UPSERT INTO feedback (
            install_hash, created_at, id, source, category, subject, message,
            contact, app_version, product_variant, router_model, firmware_version,
            diagnostics_json
        ) VALUES (
            $install_hash, CurrentUtcTimestamp(), $id, $source, $category, $subject, $message,
            $contact, $app_version, $product_variant, $router_model, $firmware_version,
            $diagnostics_json
        );
    """
    parameters = {f"${key}": typed_text(value) for key, value in values.items()}
    session.transaction().execute(query, parameters, commit_tx=True)


def handler(event, _context):
    if isinstance(event, dict) and event.get("httpMethod", "POST") != "POST":
        return response(405, {"ok": False, "error": "method_not_allowed"})

    try:
        payload = request_payload(event)
        if not isinstance(payload, dict) or payload.get("schemaVersion") not in {"1", "2"}:
            raise ValueError("schemaVersion")
        install_id = text_field(payload, "installId", 32, 32)
        if not INSTALL_ID_PATTERN.fullmatch(install_id):
            raise ValueError("installId")
        source = text_field(payload, "source", 1, 16)
        category = text_field(payload, "category", 1, 16)
        if source not in ALLOWED_SOURCES or category not in ALLOWED_CATEGORIES:
            raise ValueError("category")
        values = {
            "source": source,
            "category": category,
            "subject": text_field(payload, "subject", 1, 120),
            "message": text_field(payload, "message", 10, 4000),
            "contact": text_field(payload, "contact", 0, 200),
            "app_version": text_field(payload, "appVersion", 1, 64),
            "product_variant": text_field(payload, "productVariant", 1, 32),
            "router_model": text_field(payload, "routerModel", 0, 160),
            "firmware_version": text_field(payload, "firmwareVersion", 0, 160),
            "diagnostics_json": diagnostics_field(payload) if payload.get("schemaVersion") == "2" else "{}",
        }
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
        return response(400, {"ok": False, "error": "invalid_feedback"})

    salt = os.environ.get("INSTALL_ID_SALT", "")
    if len(salt) < 32:
        return response(500, {"ok": False, "error": "server_not_configured"})
    install_hash = hmac.new(salt.encode(), install_id.encode(), hashlib.sha256).hexdigest()
    values["install_hash"] = install_hash
    values["id"] = str(uuid.uuid4())

    try:
        database = ydb_driver()

        def operation(session):
            if recent_count(session, install_hash) >= MAX_FEEDBACK_PER_HOUR:
                return False
            insert_feedback(session, values)
            return True

        saved = database.table_client.retry_operation_sync(operation)
        if not saved:
            return response(429, {"ok": False, "error": "rate_limited"})
        return response(201, {"ok": True, "id": values["id"]})
    except Exception as error:
        # Текст сообщения и контакты нельзя печатать в Cloud Logging.
        # Для диагностики достаточно класса ошибки, содержимое запроса не нужно.
        print(f"feedback storage error: {type(error).__name__}")
        return response(503, {"ok": False, "error": "storage_unavailable"})
