"""Проверяет порядок входных, privacy, purpose, risk и review-ворот.

Это быстрый unit-уровень без сети и LLM. Он доказывает только порядок вызовов
и fail-closed поведение каркаса, но не качество классификации или ответа модели.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline_fakes import (  # noqa: E402
    FakeReviewer,
    make_interpretation,
    make_pipeline,
    make_signed_request,
)
from sheepfold_ai_core import (  # noqa: E402
    ActionDraft,
    ActionType,
    Domain,
    Interpretation,
    ModelContext,
    Outcome,
    ProcessingPurpose,
    ResponsePlan,
    ReviewDecision,
    ReviewResult,
    ReviewStatus,
    RiskAssessment,
    RiskLevel,
)


class PipelineFlowTest(unittest.TestCase):
    def test_immediate_risk_skips_ordinary_modules(self):
        risk = RiskAssessment(
            level=RiskLevel.IMMEDIATE,
            normal_flow_allowed=False,
            human_review_required=True,
            safe_next_steps=("Перейти в более безопасное место.",),
        )
        pipeline, _, interpreter, evidence, planner, safety, reviewer, guards = (
            make_pipeline(risk)
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(interpreter.calls, 0)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(safety.calls, 1)
        self.assertEqual(reviewer.calls, 1)
        self.assertEqual(guards.ingress.calls, 1)
        self.assertEqual(guards.privacy.calls, 1)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_HUMAN_REVIEW)
        self.assertEqual(
            result.trace,
            (
                "ingress",
                "provider-route",
                "privacy",
                "risk:pre",
                "plan:safety",
                "privacy:output",
                "review",
                "privacy:final-output",
            ),
        )

    def test_clarification_stops_retrieval_and_domain_planning(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        interpretation = make_interpretation(("Кого вы имеете в виду?",))
        pipeline, _, _, evidence, planner, _, _, _ = make_pipeline(
            risk,
            interpretation,
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.CLARIFY)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_CLARIFICATION)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)

    def test_domain_cannot_expand_signed_processing_purpose(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        base = make_interpretation()
        interpretation = Interpretation(
            normalized_request=base.normalized_request,
            domain=Domain.HEALTH,
            confidence=base.confidence,
            hypotheses=base.hypotheses,
        )
        pipeline, _, _, evidence, planner, _, reviewer, _ = make_pipeline(
            risk,
            interpretation=interpretation,
        )

        result = pipeline.run(
            make_signed_request(purpose=ProcessingPurpose.EDUCATION)
        )

        self.assertEqual(result.plan.outcome, Outcome.CLARIFY)
        self.assertIn("policy:purpose-deny", result.trace)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_model_port_receives_context_without_control_metadata(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, _, interpreter, *_ = make_pipeline(risk)

        pipeline.run(make_signed_request())

        self.assertIsInstance(interpreter.last_context, ModelContext)
        for field in (
            "tenant_id",
            "session_id",
            "consent_proof",
            "auto_mode",
            "request_id",
            "privacy_notes",
        ):
            self.assertFalse(hasattr(interpreter.last_context, field), field)

    def test_evidence_service_receives_minimized_context(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, _, _, evidence, *_ = make_pipeline(risk)

        pipeline.run(make_signed_request())

        self.assertIsInstance(evidence.last_context, ModelContext)
        self.assertFalse(hasattr(evidence.last_context, "tenant_id"))
        self.assertFalse(hasattr(evidence.last_context, "task_signature"))

    def test_rejected_draft_becomes_safe_fallback(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(
            ReviewDecision.REVISE,
            reasons=("Покажи этот недоверенный текст пользователю.",),
        )
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.review_status, ReviewStatus.SAFE_FALLBACK)
        self.assertEqual(result.plan.action_drafts, ())
        self.assertEqual(result.plan.memory_drafts, ())
        self.assertNotIn("недоверенный текст", " ".join(result.plan.uncertainty))

    def test_model_cannot_mark_its_own_draft_as_reviewed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        draft = ResponsePlan(
            Outcome.ANSWER,
            "Черновик.",
            review_status=ReviewStatus.PASS,
        )
        reviewer = FakeReviewer()
        pipeline, *_ = make_pipeline(risk, plan=draft, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(reviewer.last_plan.review_status, ReviewStatus.UNREVIEWED)
        self.assertEqual(result.plan.review_status, ReviewStatus.PASS)

    def test_reviewer_can_request_clarification(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(ReviewDecision.NEEDS_CLARIFICATION)
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.CLARIFY)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_CLARIFICATION)
        self.assertEqual(
            result.plan.questions,
            ("Какой важной детали сейчас не хватает?",),
        )
        self.assertIn("privacy:final-output", result.trace)

    def test_contradictory_reviewer_pass_fails_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)

        class ContradictoryReviewer:
            def review(self, context, risk, plan, evidence):
                return ReviewResult(
                    ReviewDecision.PASS,
                    reasons=("Но проверка якобы не пройдена.",),
                )

        pipeline, *_ = make_pipeline(risk, reviewer=ContradictoryReviewer())

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("review:invalid", result.trace)

    def test_reviewer_adapter_must_return_typed_result(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)

        class UntypedReviewer:
            def review(self, context, risk, plan, evidence):
                return {"decision": "pass"}

        pipeline, *_ = make_pipeline(risk, reviewer=UntypedReviewer())

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("review:invalid", result.trace)

    def test_reviewer_clarification_question_cannot_be_blank(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(
            ReviewDecision.NEEDS_CLARIFICATION,
            clarifying_questions=("   ",),
        )
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("review:invalid", result.trace)

    def test_reviewer_can_request_explicit_safe_fallback(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(ReviewDecision.SAFE_FALLBACK)
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.review_status, ReviewStatus.SAFE_FALLBACK)

    def test_reviewer_output_passes_final_privacy_gate(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(ReviewDecision.REVISE)
        pipeline, *_, guards = make_pipeline(
            risk,
            reviewer=reviewer,
            output_error_batches=((), ("crossTenantMarker",)),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.uncertainty, ("Сработала защита приватности.",))
        self.assertEqual(guards.output.calls, 2)
        self.assertIn("privacy:final-output-deny", result.trace)

    def test_sensitive_output_is_blocked_before_reviewer(self):
        risk = RiskAssessment(
            level=RiskLevel.ROUTINE,
            safe_next_steps=("Нельзя повторно показывать этот модельный текст.",),
        )
        reviewer = FakeReviewer()
        pipeline, *_, guards = make_pipeline(
            risk,
            reviewer=reviewer,
            output_errors=("crossTenantMarker",),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.next_steps, ())
        self.assertNotIn("crossTenantMarker", result.plan.uncertainty)
        self.assertIn("privacy:output-deny", result.trace)
        self.assertEqual(guards.output.calls, 1)
        self.assertEqual(reviewer.calls, 0)

    def test_planner_unavailability_returns_static_fallback(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(risk)
        planner.fail = True

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.action_drafts, ())
        self.assertNotIn("provider details", result.plan.answer)
        self.assertIn("plan:domain:unavailable", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_reviewer_unavailability_discards_prepared_draft(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        reviewer = FakeReviewer(fail=True)
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertNotIn("reviewer details", result.plan.answer)
        self.assertIn("review:unavailable", result.trace)

    def test_non_immediate_human_review_blocks_draft(self):
        risk = RiskAssessment(
            level=RiskLevel.HIGH,
            human_review_required=True,
            safe_next_steps=("Дождаться проверки.",),
        )
        pipeline, *_ = make_pipeline(risk)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.HUMAN_REVIEW)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_HUMAN_REVIEW)
        self.assertEqual(result.plan.next_steps, ())
        self.assertNotIn("Дождаться проверки.", result.plan.uncertainty)

    def test_high_risk_cannot_pass_when_model_omits_review_flag(self):
        risk = RiskAssessment(
            level=RiskLevel.HIGH,
            human_review_required=False,
            safe_next_steps=("Дождаться проверки.",),
        )
        pipeline, *_ = make_pipeline(risk)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.HUMAN_REVIEW)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_HUMAN_REVIEW)

    def test_immediate_risk_does_not_turn_into_questions_after_review(self):
        risk = RiskAssessment(
            level=RiskLevel.IMMEDIATE,
            normal_flow_allowed=False,
            human_review_required=False,
            safe_next_steps=("Перейти в более безопасное место.",),
        )
        reviewer = FakeReviewer(ReviewDecision.NEEDS_CLARIFICATION)
        pipeline, *_ = make_pipeline(risk, reviewer=reviewer)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.review_status, ReviewStatus.NEEDS_HUMAN_REVIEW)
        self.assertNotIn(
            "Перейти в более безопасное место.",
            result.plan.next_steps,
        )
        self.assertEqual(len(result.plan.next_steps), 3)

    def test_immediate_risk_replaces_ordinary_plan_and_drafts(self):
        risk = RiskAssessment(
            level=RiskLevel.IMMEDIATE,
            normal_flow_allowed=False,
            safe_next_steps=("Перейти в более безопасное место.",),
        )
        pipeline, _, _, _, _, safety, reviewer, _ = make_pipeline(risk)
        safety.result = ResponsePlan(
            outcome=Outcome.ANSWER,
            answer="Недопустимый обычный ответ.",
            questions=("Длинный уточняющий опрос?",),
            action_drafts=(
                ActionDraft(
                    "action-immediate-001",
                    ActionType.APPLY_SCHEDULE,
                    "Недопустимое срочное действие.",
                    "2026-08-08T20:00:00Z",
                ),
            ),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertNotEqual(result.plan.answer, "Недопустимый обычный ответ.")
        self.assertEqual(result.plan.action_drafts, ())
        self.assertEqual(result.plan.memory_drafts, ())
        self.assertIn("policy:immediate-plan-replaced", result.trace)
        self.assertEqual(reviewer.calls, 1)

    def test_privacy_failure_stops_every_model_port(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, risk_gate, interpreter, evidence, planner, safety, reviewer, guards = (
            make_pipeline(risk, privacy_error=True)
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(
            result.trace,
            ("ingress", "provider-route", "privacy", "privacy:deny"),
        )
        self.assertEqual(guards.ingress.calls, 1)
        self.assertEqual(guards.privacy.calls, 1)
        self.assertEqual(guards.output.calls, 0)
        self.assertEqual(risk_gate.calls, 0)
        self.assertEqual(interpreter.calls, 0)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(safety.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_naive_policy_clock_stops_before_model_ports(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, risk_gate, interpreter, evidence, planner, _, reviewer, _ = (
            make_pipeline(
                risk,
                clock=lambda: datetime(2026, 8, 8, 12, 0),
            )
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("clock:deny", result.trace)
        self.assertEqual(risk_gate.calls, 0)
        self.assertEqual(interpreter.calls, 0)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_provider_mismatch_stops_before_privacy_and_models(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, risk_gate, interpreter, evidence, planner, safety, reviewer, guards = (
            make_pipeline(risk)
        )

        result = pipeline.run(
            make_signed_request(provider_id="different-provider")
        )

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(
            result.trace,
            ("ingress", "provider-route", "provider-route:deny"),
        )
        self.assertEqual(guards.privacy.calls, 0)
        self.assertEqual(risk_gate.calls, 0)
        self.assertEqual(interpreter.calls, 0)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(safety.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_invalid_ingress_stops_before_privacy_and_models(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        pipeline, risk_gate, interpreter, evidence, planner, safety, reviewer, guards = (
            make_pipeline(risk, ingress_error=True)
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.trace, ("ingress", "ingress:deny"))
        self.assertEqual(guards.ingress.calls, 1)
        self.assertEqual(guards.privacy.calls, 0)
        self.assertEqual(guards.output.calls, 0)
        self.assertEqual(risk_gate.calls, 0)
        self.assertEqual(interpreter.calls, 0)
        self.assertEqual(evidence.calls, 0)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(safety.calls, 0)
        self.assertEqual(reviewer.calls, 0)


if __name__ == "__main__":
    unittest.main()
