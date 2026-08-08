"""Проверяет детерминированные policy действий, памяти и evidence.

Тесты не оценивают полезность текста модели. Они защищают только те инварианты,
которые должны закрываться кодом до reviewer и будущего action/memory gateway.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline_fakes import (  # noqa: E402
    make_evidence,
    make_pipeline,
    make_signed_request,
)
from sheepfold_ai_core import (  # noqa: E402
    ActionDraft,
    ActionType,
    Approval,
    Citation,
    MemoryDraft,
    MemoryTier,
    Outcome,
    ResponsePlan,
    ReviewStatus,
    RiskAssessment,
    RiskLevel,
)


class PipelinePolicyTest(unittest.TestCase):
    def test_only_narrow_actions_are_automatic(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        actions = (
            ActionDraft(
                "action-001",
                ActionType.APPLY_SCHEDULE,
                "Расписание",
                "2026-08-08T20:00:00Z",
            ),
            ActionDraft(
                "action-002",
                ActionType.ASSIGN_GROUP,
                "Группа",
                "2026-08-08T20:00:00Z",
            ),
            ActionDraft(
                "action-003",
                ActionType.DRAFT_MESSAGE,
                "Сообщение",
                "2026-08-08T20:00:00Z",
                approval=Approval.AUTO_ELIGIBLE,
            ),
            ActionDraft(
                "action-004",
                ActionType.OTHER,
                "Неизвестное действие",
                "2026-08-08T20:00:00Z",
                approval=Approval.AUTO_ELIGIBLE,
            ),
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", action_drafts=actions)
        pipeline, *_ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request(auto_mode=True))
        approvals = tuple(item.approval for item in result.plan.action_drafts)

        self.assertEqual(
            approvals,
            (
                Approval.AUTO_ELIGIBLE,
                Approval.AUTO_ELIGIBLE,
                Approval.REQUIRED,
                Approval.FORBIDDEN,
            ),
        )

    def test_manual_mode_requires_confirmation_for_every_action(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        action = ActionDraft(
            "action-001",
            ActionType.APPLY_SCHEDULE,
            "Расписание",
            "2026-08-08T20:00:00Z",
            approval=Approval.AUTO_ELIGIBLE,
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", action_drafts=(action,))
        pipeline, *_ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request(auto_mode=False))

        self.assertEqual(result.plan.action_drafts[0].approval, Approval.REQUIRED)

    def test_duplicate_action_ids_fail_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        actions = (
            ActionDraft(
                "action-duplicate",
                ActionType.APPLY_SCHEDULE,
                "Первое действие",
                "2026-08-08T20:00:00Z",
            ),
            ActionDraft(
                "action-duplicate",
                ActionType.ASSIGN_GROUP,
                "Второе действие",
                "2026-08-08T20:00:00Z",
            ),
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", action_drafts=actions)
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:action-deny", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_expired_action_fails_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        action = ActionDraft(
            "action-expired-001",
            ActionType.APPLY_SCHEDULE,
            "Просроченное действие",
            "2026-08-08T11:59:59Z",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", action_drafts=(action,))
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:action-deny", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_memory_outside_allowed_scope_fails_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-001",
            subject_ref="speaker",
            memory_tier=MemoryTier.IMPORTANT_MEMORY,
            category="general",
            summary="Личная запись.",
            provenance="userReported",
            visibility="familyShared",
            retention="reviewRequired",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertEqual(result.plan.memory_drafts, ())
        self.assertEqual(reviewer.calls, 0)
        self.assertIn("policy:memory-deny", result.trace)

    def test_unsubstantiated_model_hypothesis_is_not_saved(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-hypothesis-001",
            subject_ref="speaker",
            memory_tier=MemoryTier.IMPORTANT_MEMORY,
            category="workingHypothesis",
            summary="Непроверенная догадка.",
            provenance="modelHypothesis",
            visibility="self",
            retention="reviewRequired",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:memory-deny", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_verified_memory_requires_provenance_reference(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-verified-001",
            subject_ref="speaker",
            memory_tier=MemoryTier.IMPORTANT_MEMORY,
            category="event",
            summary="Якобы подтверждённое событие.",
            provenance="verifiedExternal",
            visibility="self",
            retention="reviewRequired",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:memory-deny", result.trace)

    def test_memory_tier_must_match_retention_policy(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-tier-001",
            subject_ref="speaker",
            memory_tier=MemoryTier.CURRENT_TOPIC,
            category="event",
            summary="Текущая тема с неверным бессрочным хранением.",
            provenance="userReported",
            visibility="self",
            retention="lifeArchive",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:memory-deny", result.trace)

    def test_model_hypothesis_must_remain_private_and_future_reviewed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-hypothesis-private-001",
            subject_ref="speaker",
            memory_tier=MemoryTier.IMPORTANT_MEMORY,
            category="workingHypothesis",
            summary="Рабочая догадка.",
            provenance="modelHypothesis",
            visibility="familyShared",
            retention="reviewRequired",
            source_refs=("message-001",),
            confidence=0.5,
            review_at="2026-08-08T11:00:00Z",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:memory-deny", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_model_cannot_choose_another_memory_subject(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        memory = MemoryDraft(
            draft_id="memory-other-subject-001",
            subject_ref="anotherPerson",
            memory_tier=MemoryTier.CURRENT_TOPIC,
            category="general",
            summary="Запись о другом человеке.",
            provenance="userReported",
            visibility="self",
            retention="session",
        )
        plan = ResponsePlan(Outcome.ANSWER, "Ответ.", memory_drafts=(memory,))
        pipeline, *_ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:memory-deny", result.trace)

    def test_unknown_evidence_reference_fails_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ с неподтверждённым фактом.",
            facts=("Факт.",),
            citations=(Citation("Факт.", ("missing-source",)),),
        )
        pipeline, *_, reviewer, _ = make_pipeline(risk, plan=plan)

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-deny", result.trace)
        self.assertEqual(reviewer.calls, 0)

    def test_evidence_id_cannot_support_an_unlisted_claim(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence()
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Другой факт.",),
            citations=(Citation("Другой факт.", (source.evidence_id,)),),
        )
        pipeline, *_ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-deny", result.trace)

    def test_citation_cannot_introduce_an_unlisted_fact(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence()
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Один факт.",),
            citations=(
                Citation("Один факт.", (source.evidence_id,)),
                Citation("Скрытый второй факт.", (source.evidence_id,)),
            ),
        )
        pipeline, *_ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-deny", result.trace)

    def test_duplicate_evidence_ids_fail_closed(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        first = make_evidence()
        second = make_evidence()
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Факт.",),
            citations=(Citation("Факт.", (first.evidence_id,)),),
        )
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(first, second),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-input-deny", result.trace)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_active_retrieved_evidence_reaches_reviewer(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence()
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ с проверяемым фактом.",
            facts=("Факт.",),
            citations=(Citation("Факт.", (source.evidence_id,)),),
        )
        pipeline, *_, reviewer, _ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.ANSWER)
        self.assertEqual(result.plan.review_status, ReviewStatus.PASS)
        self.assertEqual(reviewer.calls, 1)
        self.assertEqual(reviewer.last_evidence, (source,))

    def test_expired_source_is_rejected_even_if_status_is_active(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence(valid_until="2026-08-08T11:00:00Z")
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Факт.",),
            citations=(Citation("Факт.", (source.evidence_id,)),),
        )
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-input-deny", result.trace)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_source_without_valid_until_is_rejected(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence(valid_until=None)
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(
            risk,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-input-deny", result.trace)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_source_for_another_country_or_age_is_rejected(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence(jurisdictions=("cn",), age_bands=("under7",))
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Факт.",),
            citations=(Citation("Факт.", (source.evidence_id,)),),
        )
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-input-deny", result.trace)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)

    def test_source_checked_in_the_future_is_rejected(self):
        risk = RiskAssessment(level=RiskLevel.ROUTINE)
        source = make_evidence(checked_at="2026-08-08T12:00:01Z")
        plan = ResponsePlan(
            Outcome.ANSWER,
            "Ответ.",
            facts=("Факт.",),
            citations=(Citation("Факт.", (source.evidence_id,)),),
        )
        pipeline, _, _, _, planner, _, reviewer, _ = make_pipeline(
            risk,
            plan=plan,
            evidence_records=(source,),
        )

        result = pipeline.run(make_signed_request())

        self.assertEqual(result.plan.outcome, Outcome.SAFE_FALLBACK)
        self.assertIn("policy:evidence-input-deny", result.trace)
        self.assertEqual(planner.calls, 0)
        self.assertEqual(reviewer.calls, 0)


if __name__ == "__main__":
    unittest.main()
