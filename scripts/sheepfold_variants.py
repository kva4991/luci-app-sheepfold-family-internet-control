#!/usr/bin/env python3
"""Единые правила подготовки редакций Sheepfold для всех сборщиков. §prodvar

Модуль не собирает пакет сам. Он определяет внутреннее имя пакета, имена
релизных файлов и физическую границу Standard/AI Support. Его используют и
быстрый тестовый IPK-сборщик, и официальный OpenWrt SDK workflow, чтобы две
сборочные цепочки не расходились незаметно.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PACKAGE_NAME = "luci-app-sheepfold-family-internet-control"
PACKAGE_DIR = ROOT_DIR / "package" / SOURCE_PACKAGE_NAME

VARIANTS = {
    "sheepfold": {
        "artifact": SOURCE_PACKAGE_NAME,
        "description": "Sheepfold family internet control without AI components.",
    },
    "sheepfoldAi": {
        "artifact": "luci-app-sheepfold-ai-support",
        "description": "Sheepfold family internet control with AI Support.",
    },
}

AI_ONLY_PATHS = {
    "root/usr/libexec/sheepfold/sheepfold-activity-log",
    "root/usr/libexec/sheepfold/sheepfold-ai-gate",
    "root/usr/libexec/sheepfold/sheepfold-ai-handler",
    "root/usr/libexec/sheepfold/sheepfold-openssl-ensure",
    "htdocs/luci-static/resources/view/sheepfold/ai.js",
}
AI_ONLY_PREFIXES = (
    "root/usr/share/sheepfold/prompts/",
)
AI_TRANSLATION_PATTERN = re.compile(
    r"(?:\bai\b|xai|deepseek|gemini|grok|ии[- ]?помощ|провайдер ии|"
    r"журнал(?:ы|ов)? для ии|protected (?:per-device )?logs|individual logs|"
    r"per-device logs|openssl)",
    re.IGNORECASE,
)


def validate_variant(variant: str) -> None:
    if variant not in VARIANTS:
        raise ValueError(f"Unknown Sheepfold variant: {variant}")


def package_name(variant: str) -> str:
    validate_variant(variant)
    # Одинаковое внутреннее имя превращает смену редакции в обновление одного
    # пакета. Разные имена остаются только у release-артефактов. §prodvar
    return SOURCE_PACKAGE_NAME


def artifact_name(variant: str) -> str:
    validate_variant(variant)
    return str(VARIANTS[variant]["artifact"])


def normalize_package_path(path: str) -> str:
    return path.replace("\\", "/").removeprefix("./")


def is_ai_only_path(package_relative_path: str) -> bool:
    normalized = normalize_package_path(package_relative_path)
    return normalized in AI_ONLY_PATHS or any(
        normalized == prefix.rstrip("/") or normalized.startswith(prefix)
        for prefix in AI_ONLY_PREFIXES
    )


def strip_variant_blocks(text: str, marker: str) -> str:
    """Удаляет помеченные блоки до упаковки противоположной редакции."""
    pattern = re.compile(
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_BEGIN[ \t]*(?:\*/)?[ \t]*\r?\n"
        r".*?"
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_END[ \t]*(?:\*/)?[ \t]*(?:\r?\n|$)",
        re.MULTILINE | re.DOTALL,
    )
    previous = None
    while previous != text:
        previous = text
        text = pattern.sub("", text)
    return text


def unwrap_variant_blocks(text: str, marker: str) -> str:
    marker_line = re.compile(
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_(?:BEGIN|END)[ \t]*(?:\*/)?[ \t]*(?:\r?\n|$)",
        re.MULTILINE,
    )
    return marker_line.sub("", text)


def filter_standard_po(source: str) -> str:
    blocks = re.split(r"(?:\r?\n){2,}", source)
    kept = [block for block in blocks if not AI_TRANSLATION_PATTERN.search(block.lower())]
    return "\n\n".join(kept).rstrip() + "\n"


def filter_standard_json(source: str) -> str:
    translations = json.loads(source)
    if not isinstance(translations, dict):
        raise ValueError("Sheepfold translation JSON must contain an object")
    filtered = {
        key: value
        for key, value in translations.items()
        if not AI_TRANSLATION_PATTERN.search(f"{key} {value}")
    }
    return json.dumps(filtered, ensure_ascii=False, indent=2) + "\n"


def rewrite_makefile_variant(text: str, variant: str) -> str:
    expected = f"SHEEPFOLD_PRODUCT_VARIANT:={variant}"
    rewritten, count = re.subn(
        r"^SHEEPFOLD_PRODUCT_VARIANT:=.*$",
        expected,
        text,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise ValueError("Package Makefile has no SHEEPFOLD_PRODUCT_VARIANT assignment")
    description = str(VARIANTS[variant]["description"])
    rewritten, count = re.subn(
        r"^LUCI_DESCRIPTION:=.*$",
        f"LUCI_DESCRIPTION:={description}",
        rewritten,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise ValueError("Package Makefile has no LUCI_DESCRIPTION assignment")
    return rewritten


def transform_standard_payload(package_relative_path: str, data: bytes) -> bytes:
    normalized = normalize_package_path(package_relative_path)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data

    text = strip_variant_blocks(text, "AI")
    text = unwrap_variant_blocks(text, "STANDARD")
    if normalized == "Makefile":
        text = rewrite_makefile_variant(text, "sheepfold")
    if normalized.endswith("acl.d/luci-app-sheepfold-family-internet-control.json"):
        acl = json.loads(text)
        write_files = acl[SOURCE_PACKAGE_NAME]["write"]["file"]
        write_files.pop("/usr/libexec/sheepfold/sheepfold-openssl-ensure", None)
        text = json.dumps(acl, ensure_ascii=False, indent=2) + "\n"
    if normalized.endswith("PRIVACY_NOTICE.md"):
        text = """# Sheepfold local storage privacy notice

This storage belongs to the self-hosted Sheepfold installation. The standard
product does not include an AI assistant or per-device activity collection.
Configuration backups and administrative logs remain under the router owner's
control unless the owner deliberately exports them.

Never store passwords, access tokens, session cookies, or unmasked exports in
publicly accessible directories. Remove the storage device only after Sheepfold
has finished writing data.
"""
    if normalized.endswith("sheepfold.css"):
        text = re.sub(r"(?ms)^\.sf-ai[^\{]*\{.*?^\}\s*", "", text)
    if normalized.endswith(".po") or normalized.endswith(".pot"):
        text = filter_standard_po(text)
    if "/i18n/" in normalized and normalized.endswith(".json"):
        text = filter_standard_json(text)
    return text.encode("utf-8")


def transform_ai_payload(package_relative_path: str, data: bytes) -> bytes:
    normalized = normalize_package_path(package_relative_path)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    text = strip_variant_blocks(text, "STANDARD")
    text = unwrap_variant_blocks(text, "AI")
    if normalized == "Makefile":
        text = rewrite_makefile_variant(text, "sheepfoldAi")
    return text.encode("utf-8")


def transform_payload(package_relative_path: str, data: bytes, variant: str) -> bytes:
    validate_variant(variant)
    if variant == "sheepfold":
        return transform_standard_payload(package_relative_path, data)
    return transform_ai_payload(package_relative_path, data)


def prepare_sdk_feed(variant: str, output_dir: Path) -> Path:
    """Создаёт feed с одним подготовленным package-каталогом для OpenWrt SDK."""
    validate_variant(variant)
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    target_package = output_dir / SOURCE_PACKAGE_NAME
    if target_package.exists():
        shutil.rmtree(target_package)
    shutil.copytree(PACKAGE_DIR, target_package)

    # Китайский каталог пока хранится в корневом po; SDK должен получить его в
    # package feed вместе с русским переводом.
    root_po = ROOT_DIR / "po"
    if root_po.is_dir():
        shutil.copytree(root_po, target_package / "po", dirs_exist_ok=True)

    for path in sorted(target_package.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(target_package).as_posix()
        if variant == "sheepfold" and is_ai_only_path(relative):
            path.unlink()
            continue
        path.write_bytes(transform_payload(relative, path.read_bytes(), variant))

    remaining_markers = []
    for path in target_package.rglob("*"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if re.search(r"SHEEPFOLD_(?:AI|STANDARD)_(?:BEGIN|END)", text):
            remaining_markers.append(path.relative_to(target_package).as_posix())
    if remaining_markers:
        raise RuntimeError(f"Variant markers remain in prepared feed: {remaining_markers}")

    metadata = {
        "variant": variant,
        "internalPackage": package_name(variant),
        "artifactPrefix": artifact_name(variant),
    }
    (output_dir / "sheepfold-variant.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return target_package
