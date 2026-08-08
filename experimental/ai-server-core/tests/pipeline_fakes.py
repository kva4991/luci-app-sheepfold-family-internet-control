"""Общие фиктивные порты для unit-тестов экспериментального pipeline.

Файл намеренно не начинается с `test_`: он только собирает один предсказуемый
конвейер без сети и LLM, чтобы тесты потока и предметных policy не дублировали
сотни строк подготовки.
"""

from __future__ import annotations

import base64
import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

TEST_NOW = datetime(2026, 8, 8, 12, 0, tzinfo=timezone.utc)

from sheepfold_ai_core import (  # noqa: E402
    AiPipeline,
    Audience,
    BoundProviderRouteGuard,
    ChatMessage,
    Domain,
    EvidenceRecord,
    IngressBoundaryError,
    Interpretation,
    MeaningHypothesis,
    ModelContext,
    Outcome,
    PayloadClass,
    PipelineDeps,
    PipelinePortError,
    PrivacyBoundaryError,
    PrivacyScope,
    ProcessingPurpose,
    RequestEnvelope,
    ResponsePlan,
    ReviewDecision,
    ReviewResult,
    SignedTask,
)


class FakeIngressGuard:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = 0

    def open(self, task):
        self.calls += 1
        if self.fail:
            raise IngressBoundaryError("Тестовая блокировка входа.")
        encoded_payload = task.compact_jws.split(".")[1]
        padding = "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode(encoded_payload + padding)
        data = json.loads(payload.decode("utf-8"))
        data["audience"] = Audience(data["audience"])
        data["privacy_scope"] = PrivacyScope(data["privacy_scope"])
        data["payload_class"] = PayloadClass(data["payload_class"])
        data["processing_purpose"] = ProcessingPurpose(
            data["processing_purpose"]
        )
        data["history"] = tuple(ChatMessage(**item) for item in data["history"])
        data["allowed_scopes"] = tuple(data["allowed_scopes"])
        return RequestEnvelope(**data)


class FakePrivacyGuard:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = 0

    def prepare(self, request):
        self.calls += 1
        if self.fail:
            raise PrivacyBoundaryError("Тестовая блокировка.")
        return ModelContext(
            audience=request.audience,
            age_band=request.age_band,
            locale=request.locale,
            country_profile=request.country_profile,
            processing_purpose=request.processing_purpose,
            message=request.message,
            history=request.history,
        )


class FakeOutputGuard:
    def __init__(self, errors=(), error_batches=()):
        self.errors = tuple(errors)
        self.error_batches = tuple(tuple(batch) for batch in error_batches)
        self.calls = 0
        self.last_plan = None

    def inspect(self, context, risk, plan):
        self.calls += 1
        self.last_plan = plan
        if self.error_batches:
            index = min(self.calls - 1, len(self.error_batches) - 1)
            return self.error_batches[index]
        return self.errors


class FakeRiskGate:
    def __init__(self, pre_risk, post_risk=None):
        self.pre_risk = pre_risk
        self.post_risk = post_risk or pre_risk
        self.calls = 0

    def assess(self, context, interpretation):
        self.calls += 1
        return self.pre_risk if interpretation is None else self.post_risk


class FakeInterpreter:
    def __init__(self, result):
        self.result = result
        self.calls = 0
        self.last_context = None

    def interpret(self, context):
        self.calls += 1
        self.last_context = context
        return self.result


class FakeEvidence:
    def __init__(self, records=()):
        self.calls = 0
        self.records = records
        self.last_context = None

    def retrieve(self, context, interpretation):
        self.calls += 1
        self.last_context = context
        return self.records


class FakePlanner:
    def __init__(self, result, fail=False):
        self.result = result
        self.fail = fail
        self.calls = 0

    def plan(self, context, interpretation, risk, evidence):
        self.calls += 1
        if self.fail:
            raise PipelinePortError("provider details must not reach the response")
        return self.result


class FakeSafetyPlanner:
    def __init__(self, result=None):
        self.result = result
        self.calls = 0

    def plan(self, context, risk):
        self.calls += 1
        return self.result or ResponsePlan(
            outcome=Outcome.SAFE_FALLBACK,
            answer="Используйте короткие безопасные шаги.",
            next_steps=risk.safe_next_steps,
        )


class FakeReviewer:
    def __init__(
        self,
        decision=ReviewDecision.PASS,
        fail=False,
        reasons=None,
        clarifying_questions=None,
    ):
        self.decision = decision
        self.fail = fail
        self.reasons = (
            tuple(reasons)
            if reasons is not None
            else (() if decision is ReviewDecision.PASS else ("Нужна проверка.",))
        )
        self.clarifying_questions = (
            tuple(clarifying_questions)
            if clarifying_questions is not None
            else (
                ("Какой важной детали сейчас не хватает?",)
                if decision is ReviewDecision.NEEDS_CLARIFICATION
                else ()
            )
        )
        self.calls = 0
        self.last_evidence = None
        self.last_plan = None

    def review(self, context, risk, plan, evidence):
        self.calls += 1
        if self.fail:
            raise PipelinePortError("reviewer details must not reach the response")
        self.last_plan = plan
        self.last_evidence = tuple(evidence)
        return ReviewResult(
            self.decision,
            reasons=self.reasons,
            clarifying_questions=self.clarifying_questions,
        )


def make_signed_request(
    auto_mode=False,
    purpose=ProcessingPurpose.GENERAL_SUPPORT,
    provider_id="provider-test-001",
):
    request = RequestEnvelope(
        request_id="request-001",
        tenant_id="tenant-001",
        session_id="session-001",
        audience=Audience.PARENT,
        age_band="adult",
        locale="ru-RU",
        country_profile="ru",
        message="Тестовый вопрос",
        privacy_scope=PrivacyScope.ONE_OFF,
        payload_class=PayloadClass.GENERAL,
        processing_purpose=purpose,
        provider_id=provider_id,
        consent_proof="consent-001",
        privacy_proof="privacy-001",
        issued_at="2026-08-08T19:55:00Z",
        expires_at="2026-08-08T20:00:00Z",
        auto_mode=auto_mode,
    )
    payload = json.dumps(
        asdict(request),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return SignedTask(f"e30.{encoded_payload}.c2ln")


def make_interpretation(questions=()):
    return Interpretation(
        normalized_request="Тестовый вопрос",
        domain=Domain.GENERAL,
        confidence=0.8,
        hypotheses=(
            MeaningHypothesis(
                summary="Пользователь просит общий ответ.",
                confidence=0.8,
                basis=("Текст запроса.",),
            ),
        ),
        questions=questions,
        missing_info=("Не хватает контекста.",) if questions else (),
    )


def make_evidence(
    evidence_id="source-001",
    status="active",
    valid_until="2026-09-08T12:00:00Z",
    checked_at="2026-08-08T12:00:00Z",
    jurisdictions=("all",),
    age_bands=("all",),
):
    return EvidenceRecord(
        evidence_id=evidence_id,
        title="Тестовый источник",
        publisher="Тестовый издатель",
        source_url="https://example.test/source",
        source_kind="projectPolicy",
        jurisdictions=jurisdictions,
        age_bands=age_bands,
        claims=("Факт.",),
        license_note="Тестовые данные.",
        content_hash="a" * 64,
        checked_at=checked_at,
        valid_until=valid_until,
        status=status,
    )


def make_pipeline(
    pre_risk,
    interpretation=None,
    plan=None,
    reviewer=None,
    evidence_records=(),
    privacy_error=False,
    ingress_error=False,
    output_errors=(),
    output_error_batches=(),
    clock=None,
):
    ingress = FakeIngressGuard(ingress_error)
    privacy = FakePrivacyGuard(privacy_error)
    output = FakeOutputGuard(output_errors, output_error_batches)
    risk_gate = FakeRiskGate(pre_risk)
    interpreter = FakeInterpreter(interpretation or make_interpretation())
    evidence = FakeEvidence(evidence_records)
    planner = FakePlanner(plan or ResponsePlan(Outcome.ANSWER, "Проверенный ответ."))
    safety = FakeSafetyPlanner()
    review = reviewer or FakeReviewer()
    pipeline = AiPipeline(
        PipelineDeps(
            ingress_guard=ingress,
            provider_route_guard=BoundProviderRouteGuard("provider-test-001"),
            privacy_guard=privacy,
            output_guard=output,
            risk_gate=risk_gate,
            interpreter=interpreter,
            evidence=evidence,
            planner=planner,
            safety_planner=safety,
            reviewer=review,
            now=clock or (lambda: TEST_NOW),
        )
    )
    guards = SimpleNamespace(ingress=ingress, privacy=privacy, output=output)
    return pipeline, risk_gate, interpreter, evidence, planner, safety, review, guards
