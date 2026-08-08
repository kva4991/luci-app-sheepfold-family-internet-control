"""Защищает порядок JWS, schema, TTL, replay и privacy-проверок.

Это unit-уровень с фиктивным JWS verifier и памятью одного процесса. Он
доказывает порядок ворот, но не стойкость ключей, реализацию JOSE-библиотеки,
распределённую атомарность replay-store или качество PII-detector.
"""

from __future__ import annotations

import sys
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sheepfold_ai_core import (  # noqa: E402
    Audience,
    BoundProviderRouteGuard,
    IngressBoundaryError,
    MemoryReplayStore,
    ModelContext,
    Outcome,
    PayloadClass,
    PrivacyBoundaryError,
    PrivacyScope,
    ProcessingPurpose,
    RequestEnvelope,
    ResponsePlan,
    RiskAssessment,
    RiskLevel,
    SensitiveOutputGuard,
    SignedIngressGuard,
    SignedTask,
    VerifiedContextGuard,
    VerifiedJwsPayload,
)


NOW = datetime(2026, 8, 8, 12, 0, tzinfo=timezone.utc)
SIGNED_TASK = SignedTask("cHJvdGVjdGVk.cGF5bG9hZA.c2lnbmF0dXJl")


def make_request(
    expires_at=None,
    privacy_scope=PrivacyScope.ONE_OFF,
    issued_at=None,
    tenant_id="tenant-guard-001",
):
    issued_at = issued_at or NOW
    expires_at = expires_at or NOW + timedelta(minutes=2)
    return RequestEnvelope(
        request_id="request-guard-001",
        tenant_id=tenant_id,
        session_id="session-guard-001",
        audience=Audience.PARENT,
        age_band="adult",
        locale="ru-RU",
        country_profile="ru",
        message="Минимизированный тестовый запрос.",
        privacy_scope=privacy_scope,
        payload_class=PayloadClass.GENERAL,
        processing_purpose=ProcessingPurpose.GENERAL_SUPPORT,
        provider_id="provider-test-001",
        consent_proof="consent-guard-001",
        privacy_proof="privacy-guard-001",
        issued_at=issued_at.isoformat(),
        expires_at=expires_at.isoformat(),
    )


def make_verified_payload(
    signing_key_id="router-key-001",
    algorithm="EdDSA",
    token_type="sheepfold-ai-task+jws",
    content_type="application/sheepfold-ai-task+json",
    critical_headers=(),
):
    return VerifiedJwsPayload(
        signing_key_id=signing_key_id,
        algorithm=algorithm,
        token_type=token_type,
        content_type=content_type,
        payload_bytes=b'{"schemaVersion":1}',
        critical_headers=critical_headers,
    )


def make_ingress_guard(
    request,
    replay_store=None,
    verify_jws=None,
    parse_payload=None,
    authorize_tenant=None,
):
    return SignedIngressGuard(
        authorize_tenant=authorize_tenant or (lambda tenant_id, key_id: True),
        verify_jws=verify_jws or (lambda compact_jws: make_verified_payload()),
        parse_payload=parse_payload or (lambda payload: request),
        replay_store=replay_store or MemoryReplayStore(),
        allow_request=lambda tenant_id, request_id, now: True,
        allowed_algorithms=("EdDSA",),
        now=lambda: NOW,
    )


class GuardTest(unittest.TestCase):
    def test_provider_route_rejects_non_ascii_id_without_exception(self):
        guard = BoundProviderRouteGuard("provider-test-001")
        request = replace(make_request(), provider_id="провайдер")

        self.assertFalse(guard.allows(request))
        with self.assertRaises(ValueError):
            BoundProviderRouteGuard("провайдер")

    def test_valid_task_is_consumed_once(self):
        guard = make_ingress_guard(make_request())

        guard.open(SIGNED_TASK)
        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_consumed_replay_does_not_debit_rate_budget_again(self):
        calls = []
        request = make_request()
        guard = SignedIngressGuard(
            authorize_tenant=lambda tenant_id, key_id: True,
            verify_jws=lambda compact_jws: make_verified_payload(),
            parse_payload=lambda payload: request,
            replay_store=MemoryReplayStore(),
            allow_request=lambda tenant_id, request_id, now: calls.append(
                (tenant_id, request_id)
            )
            or True,
            allowed_algorithms=("EdDSA",),
            now=lambda: NOW,
        )

        guard.open(SIGNED_TASK)
        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

        self.assertEqual(calls, [(request.tenant_id, request.request_id)])

    def test_jws_is_verified_before_payload_is_parsed(self):
        calls = []
        request = make_request()
        guard = make_ingress_guard(
            request,
            verify_jws=lambda compact_jws: calls.append("verify")
            or make_verified_payload(),
            parse_payload=lambda payload: calls.append("parse") or request,
        )

        guard.open(SIGNED_TASK)

        self.assertEqual(calls, ["verify", "parse"])

    def test_invalid_signature_does_not_parse_or_poison_replay_store(self):
        replay_store = MemoryReplayStore()
        parse_calls = []
        request = make_request()
        invalid = make_ingress_guard(
            request,
            replay_store=replay_store,
            verify_jws=lambda compact_jws: (_ for _ in ()).throw(
                ValueError("invalid signature")
            ),
            parse_payload=lambda payload: parse_calls.append(payload) or request,
        )
        valid = make_ingress_guard(request, replay_store=replay_store)

        with self.assertRaises(IngressBoundaryError):
            invalid.open(SIGNED_TASK)
        self.assertEqual(parse_calls, [])
        valid.open(SIGNED_TASK)

    def test_expired_and_excessive_ttl_are_rejected(self):
        expired = make_ingress_guard(make_request(NOW - timedelta(seconds=1)))
        excessive = make_ingress_guard(make_request(NOW + timedelta(minutes=6)))

        with self.assertRaises(IngressBoundaryError):
            expired.open(SIGNED_TASK)
        with self.assertRaises(IngressBoundaryError):
            excessive.open(SIGNED_TASK)

    def test_old_or_future_issue_time_is_rejected(self):
        old = make_ingress_guard(
            make_request(
                issued_at=NOW - timedelta(minutes=6),
                expires_at=NOW + timedelta(minutes=1),
            )
        )
        future = make_ingress_guard(
            make_request(
                issued_at=NOW + timedelta(minutes=1),
                expires_at=NOW + timedelta(minutes=2),
            )
        )

        with self.assertRaises(IngressBoundaryError):
            old.open(SIGNED_TASK)
        with self.assertRaises(IngressBoundaryError):
            future.open(SIGNED_TASK)

    def test_expiry_must_be_after_issue_time(self):
        guard = make_ingress_guard(
            make_request(
                issued_at=NOW + timedelta(seconds=10),
                expires_at=NOW + timedelta(seconds=5),
            )
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_replay_id_is_scoped_by_tenant(self):
        replay_store = MemoryReplayStore()
        first = make_ingress_guard(
            make_request(tenant_id="tenant-guard-001"),
            replay_store=replay_store,
        )
        second = make_ingress_guard(
            make_request(tenant_id="tenant-guard-002"),
            replay_store=replay_store,
        )

        first.open(SIGNED_TASK)
        second.open(SIGNED_TASK)

    def test_key_rotation_does_not_make_consumed_request_new(self):
        replay_store = MemoryReplayStore()
        request = make_request()
        old_key = make_ingress_guard(
            request,
            replay_store=replay_store,
            verify_jws=lambda compact_jws: make_verified_payload(
                signing_key_id="router-key-old",
            ),
        )
        new_key = make_ingress_guard(
            request,
            replay_store=replay_store,
            verify_jws=lambda compact_jws: make_verified_payload(
                signing_key_id="router-key-new",
            ),
        )

        old_key.open(SIGNED_TASK)
        with self.assertRaises(IngressBoundaryError):
            new_key.open(SIGNED_TASK)

    def test_local_task_is_rejected_after_verified_payload_is_parsed(self):
        calls = []
        request = make_request(privacy_scope=PrivacyScope.LOCAL)
        guard = make_ingress_guard(
            request,
            verify_jws=lambda compact_jws: calls.append("verify")
            or make_verified_payload(),
            parse_payload=lambda payload: calls.append("parse") or request,
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)
        self.assertEqual(calls, ["verify", "parse"])

    def test_unknown_tenant_key_pair_is_rejected(self):
        guard = make_ingress_guard(
            make_request(),
            authorize_tenant=lambda tenant_id, key_id: False,
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_schema_adapter_must_return_typed_request(self):
        guard = make_ingress_guard(
            make_request(),
            parse_payload=lambda payload: {"schemaVersion": 1},
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_transport_and_jws_adapters_must_return_typed_values(self):
        guard = make_ingress_guard(
            make_request(),
            verify_jws=lambda compact_jws: {"payload": "not-verified"},
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open({"compactJws": SIGNED_TASK.compact_jws})
        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_server_clock_must_be_timezone_aware(self):
        guard = SignedIngressGuard(
            authorize_tenant=lambda tenant_id, key_id: True,
            verify_jws=lambda compact_jws: make_verified_payload(),
            parse_payload=lambda payload: make_request(),
            replay_store=MemoryReplayStore(),
            allow_request=lambda tenant_id, request_id, now: True,
            allowed_algorithms=("EdDSA",),
            now=lambda: NOW.replace(tzinfo=None),
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SIGNED_TASK)

    def test_invalid_transport_configuration_fails_at_startup(self):
        base = {
            "authorize_tenant": lambda tenant_id, key_id: True,
            "verify_jws": lambda compact_jws: make_verified_payload(),
            "parse_payload": lambda payload: make_request(),
            "replay_store": MemoryReplayStore(),
            "allow_request": lambda tenant_id, request_id, now: True,
        }
        variants = (
            {"allowed_algorithms": ()},
            {"allowed_algorithms": ("EdDSA",), "max_jws_chars": 0},
            {"allowed_algorithms": ("EdDSA",), "max_ttl": timedelta(0)},
            {
                "allowed_algorithms": ("EdDSA",),
                "clock_skew": timedelta(seconds=-1),
            },
        )

        for variant in variants:
            with self.subTest(variant=variant), self.assertRaises(ValueError):
                SignedIngressGuard(**base, **variant)

    def test_rate_limit_rejects_before_consuming_replay_id(self):
        replay_store = MemoryReplayStore()
        request = make_request()
        limited = SignedIngressGuard(
            authorize_tenant=lambda tenant_id, key_id: True,
            verify_jws=lambda compact_jws: make_verified_payload(),
            parse_payload=lambda payload: request,
            replay_store=replay_store,
            allow_request=lambda tenant_id, request_id, now: False,
            allowed_algorithms=("EdDSA",),
            now=lambda: NOW,
        )
        allowed = make_ingress_guard(request, replay_store=replay_store)

        with self.assertRaises(IngressBoundaryError):
            limited.open(SIGNED_TASK)
        allowed.open(SIGNED_TASK)

    def test_unapproved_algorithm_and_wrong_protected_types_are_rejected(self):
        variants = (
            make_verified_payload(algorithm="none"),
            make_verified_payload(token_type="other+jws"),
            make_verified_payload(content_type="application/json"),
            make_verified_payload(critical_headers=("b64",)),
        )

        for verified in variants:
            with self.subTest(verified=verified):
                guard = make_ingress_guard(
                    make_request(),
                    verify_jws=lambda compact_jws, value=verified: value,
                )
                with self.assertRaises(IngressBoundaryError):
                    guard.open(SIGNED_TASK)

    def test_malformed_wrapper_is_rejected_before_jws_verifier(self):
        calls = []
        guard = make_ingress_guard(
            make_request(),
            verify_jws=lambda compact_jws: calls.append(compact_jws)
            or make_verified_payload(),
        )

        with self.assertRaises(IngressBoundaryError):
            guard.open(SignedTask("not-a-compact-jws"))
        with self.assertRaises(IngressBoundaryError):
            guard.open(SignedTask("header.pay+load.signature"))
        with self.assertRaises(IngressBoundaryError):
            guard.open(SignedTask(b"header.payload.signature"))
        self.assertEqual(calls, [])

    def test_verified_context_excludes_server_control_fields(self):
        guard = VerifiedContextGuard(
            verify_privacy=lambda request: True,
            find_sensitive_data=lambda message, history, payload_class: (),
        )

        context = guard.prepare(make_request())

        for field in (
            "tenant_id",
            "consent_proof",
            "provider_id",
            "request_id",
        ):
            self.assertFalse(hasattr(context, field), field)
        self.assertEqual(context.message, "Минимизированный тестовый запрос.")
        self.assertEqual(
            context.processing_purpose,
            ProcessingPurpose.GENERAL_SUPPORT,
        )

    def test_invalid_privacy_proof_is_rejected(self):
        guard = VerifiedContextGuard(
            verify_privacy=lambda request: False,
            find_sensitive_data=lambda message, history, payload_class: (),
        )

        with self.assertRaises(PrivacyBoundaryError):
            guard.prepare(make_request())

    def test_secondary_sensitive_data_scan_fails_closed(self):
        guard = VerifiedContextGuard(
            verify_privacy=lambda request: True,
            find_sensitive_data=lambda message, history, payload_class: (
                "rawNetworkAddress",
            ),
        )

        with self.assertRaises(PrivacyBoundaryError):
            guard.prepare(make_request())

    def test_output_guard_returns_only_detector_codes(self):
        received = []
        guard = SensitiveOutputGuard(
            lambda context, risk, plan: received.append((context, risk, plan))
            or ("rawIdentifier",)
        )
        request = make_request()
        context = ModelContext(
            audience=request.audience,
            age_band=request.age_band,
            locale=request.locale,
            country_profile=request.country_profile,
            processing_purpose=request.processing_purpose,
            message=request.message,
        )
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        plan = ResponsePlan(Outcome.ANSWER, "Черновик.")

        errors = tuple(guard.inspect(context, risk, plan))

        self.assertEqual(errors, ("rawIdentifier",))
        self.assertEqual(received, [(context, risk, plan)])


if __name__ == "__main__":
    unittest.main()
