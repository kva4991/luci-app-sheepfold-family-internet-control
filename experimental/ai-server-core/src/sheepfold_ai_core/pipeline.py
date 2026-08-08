"""Оркестратор экспериментального серверного ядра."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Callable, TypeVar

from .contracts import (
    EvidenceRecord,
    IngressBoundaryError,
    Interpretation,
    ModelContext,
    Outcome,
    PipelinePortError,
    PipelineResult,
    PrivacyBoundaryError,
    RequestEnvelope,
    ResponsePlan,
    ReviewDecision,
    ReviewStatus,
    RiskAssessment,
    RiskLevel,
    SignedTask,
)
from .interfaces import (
    EvidenceService,
    IngressGuard,
    Interpreter,
    OutputGuard,
    PrivacyGuard,
    ProviderRouteGuard,
    ResponsePlanner,
    ResponseReviewer,
    RiskGate,
    SafetyPlanner,
)
from .policies import (
    action_policy_errors,
    evidence_policy_errors,
    evidence_record_errors,
    memory_policy_errors,
    normalize_actions,
    purpose_allows_domain,
    review_result_errors,
)


PortResult = TypeVar("PortResult")


@dataclass(frozen=True)
class PipelineDeps:
    ingress_guard: IngressGuard
    provider_route_guard: ProviderRouteGuard
    privacy_guard: PrivacyGuard
    output_guard: OutputGuard
    risk_gate: RiskGate
    interpreter: Interpreter
    evidence: EvidenceService
    planner: ResponsePlanner
    safety_planner: SafetyPlanner
    reviewer: ResponseReviewer
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)


class AiPipeline:
    """Проводит запрос через независимые ворота и ничего не исполняет."""

    def __init__(self, deps: PipelineDeps):
        self._deps = deps

    def run(self, task: SignedTask) -> PipelineResult:
        trace = ["ingress"]
        try:
            request = self._deps.ingress_guard.open(task)
        except IngressBoundaryError:
            trace.append("ingress:deny")
            return self._boundary_failure(
                "Сервер не принял запрос: не удалось подтвердить подлинность или срок задачи.",
                trace,
            )

        trace.append("provider-route")
        if not self._deps.provider_route_guard.allows(request):
            trace.append("provider-route:deny")
            return self._boundary_failure(
                "Сервер не принял запрос: выбранный получатель данных "
                "не совпадает с настроенным маршрутом.",
                trace,
            )

        trace.append("privacy")
        try:
            context = self._deps.privacy_guard.prepare(request)
        except PrivacyBoundaryError:
            trace.append("privacy:deny")
            return self._boundary_failure(
                "Запрос не был отправлен модели: не удалось безопасно подготовить данные.",
                trace,
            )

        policy_now = self._deps.now()
        if not isinstance(policy_now, datetime) or policy_now.tzinfo is None:
            trace.append("clock:deny")
            return self._boundary_failure(
                "Сервис помощника остановил запрос из-за неверного времени сервера.",
                trace,
            )
        policy_now = policy_now.astimezone(timezone.utc)

        trace.append("risk:pre")
        risk, failure = self._call_port(
            "risk:pre",
            trace,
            lambda: self._deps.risk_gate.assess(context, None),
        )
        if failure is not None:
            return failure

        if self._needs_safety_path(risk):
            trace.append("plan:safety")
            plan, failure = self._call_port(
                "plan:safety",
                trace,
                lambda: self._deps.safety_planner.plan(context, risk),
            )
            if failure is not None:
                return failure
            return self._review(
                request,
                context,
                risk,
                None,
                plan,
                (),
                trace,
                policy_now,
            )

        trace.append("interpret")
        interpretation, failure = self._call_port(
            "interpret",
            trace,
            lambda: self._deps.interpreter.interpret(context),
        )
        if failure is not None:
            return failure
        trace.append("risk:post")
        risk, failure = self._call_port(
            "risk:post",
            trace,
            lambda: self._deps.risk_gate.assess(context, interpretation),
        )
        if failure is not None:
            return failure

        if self._needs_safety_path(risk):
            trace.append("plan:safety")
            plan, failure = self._call_port(
                "plan:safety",
                trace,
                lambda: self._deps.safety_planner.plan(context, risk),
            )
            if failure is not None:
                return failure
            return self._review(
                request,
                context,
                risk,
                interpretation,
                plan,
                (),
                trace,
                policy_now,
            )

        if not purpose_allows_domain(
            request.processing_purpose,
            interpretation.domain,
        ):
            trace.append("policy:purpose-deny")
            return PipelineResult(
                plan=ResponsePlan(
                    outcome=Outcome.CLARIFY,
                    answer=(
                        "Этот вопрос относится к другой области. Сначала нужно "
                        "отдельно разрешить подходящий режим обработки."
                    ),
                    questions=("Перейти к подходящему режиму для этого вопроса?",),
                    review_status=ReviewStatus.NEEDS_CLARIFICATION,
                ),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )

        if interpretation.questions:
            trace.append("plan:clarify")
            plan = ResponsePlan(
                outcome=Outcome.CLARIFY,
                answer="Нужно уточнить несколько деталей, чтобы не додумывать за вас.",
                hypotheses=tuple(item.summary for item in interpretation.hypotheses),
                uncertainty=interpretation.missing_info,
                questions=interpretation.questions[:3],
                review_status=ReviewStatus.NEEDS_CLARIFICATION,
            )
            return self._review(
                request,
                context,
                risk,
                interpretation,
                plan,
                (),
                trace,
                policy_now,
            )

        trace.append("evidence")
        evidence, failure = self._call_port(
            "evidence",
            trace,
            lambda: tuple(self._deps.evidence.retrieve(context, interpretation)),
        )
        if failure is not None:
            return failure
        evidence_input_errors = evidence_record_errors(
            evidence,
            policy_now,
            context.country_profile,
            context.age_band,
        )
        if evidence_input_errors:
            trace.append("policy:evidence-input-deny")
            return PipelineResult(
                plan=self._policy_fallback(evidence_input_errors),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )
        trace.append("plan:domain")
        plan, failure = self._call_port(
            "plan:domain",
            trace,
            lambda: self._deps.planner.plan(
                context,
                interpretation,
                risk,
                evidence,
            ),
        )
        if failure is not None:
            return failure
        return self._review(
            request,
            context,
            risk,
            interpretation,
            plan,
            evidence,
            trace,
            policy_now,
        )

    @staticmethod
    def _boundary_failure(answer: str, trace: list[str]) -> PipelineResult:
        risk = RiskAssessment(
            level=RiskLevel.SENSITIVE,
            normal_flow_allowed=False,
        )
        return PipelineResult(
            plan=ResponsePlan(
                outcome=Outcome.SAFE_FALLBACK,
                answer=answer,
                review_status=ReviewStatus.SAFE_FALLBACK,
            ),
            risk=risk,
            interpretation=None,
            trace=tuple(trace),
        )

    @staticmethod
    def _needs_safety_path(risk: RiskAssessment) -> bool:
        return risk.level is RiskLevel.IMMEDIATE or not risk.normal_flow_allowed

    def _review(
        self,
        request: RequestEnvelope,
        context: ModelContext,
        risk: RiskAssessment,
        interpretation: Interpretation | None,
        plan: ResponsePlan,
        evidence: tuple[EvidenceRecord, ...],
        trace: list[str],
        policy_now: datetime,
    ) -> PipelineResult:
        # Модель не вправе сама объявлять действие автоматическим: решение
        # пересчитывается из типа действия и режима, выбранного пользователем.
        plan = replace(
            plan,
            action_drafts=normalize_actions(plan.action_drafts, request.auto_mode),
            review_status=ReviewStatus.UNREVIEWED,
        )
        if risk.level is RiskLevel.IMMEDIATE and (
            plan.outcome is not Outcome.SAFE_FALLBACK
            or plan.facts
            or plan.hypotheses
            or plan.citations
            or plan.questions
            or plan.action_drafts
            or plan.memory_drafts
        ):
            trace.append("policy:immediate-plan-replaced")
            plan = self._immediate_fallback()
        action_errors = action_policy_errors(plan.action_drafts, policy_now)
        if action_errors:
            trace.append("policy:action-deny")
            return PipelineResult(
                plan=self._policy_fallback(action_errors),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )
        trace.append("privacy:output")
        output_errors = tuple(self._deps.output_guard.inspect(context, risk, plan))
        if output_errors:
            trace.append("privacy:output-deny")
            return PipelineResult(
                plan=self._privacy_fallback(),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )
        evidence_errors = evidence_policy_errors(
            plan,
            evidence,
            policy_now,
            context.country_profile,
            context.age_band,
        )
        if evidence_errors:
            trace.append("policy:evidence-deny")
            return PipelineResult(
                plan=self._policy_fallback(evidence_errors),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )
        memory_errors = memory_policy_errors(
            plan.memory_drafts,
            request.allowed_scopes,
            policy_now,
        )
        if memory_errors:
            trace.append("policy:memory-deny")
            return PipelineResult(
                plan=self._policy_fallback(memory_errors),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )
        trace.append("review")
        review, failure = self._call_port(
            "review",
            trace,
            lambda: self._deps.reviewer.review(context, risk, plan, evidence),
        )
        if failure is not None:
            return failure
        review_errors = review_result_errors(review)
        if review_errors:
            trace.append("review:invalid")
            return PipelineResult(
                plan=self._policy_fallback(review_errors),
                risk=risk,
                interpretation=interpretation,
                trace=tuple(trace),
            )

        if review.decision is ReviewDecision.PASS:
            if risk.level is RiskLevel.HIGH or (
                risk.human_review_required and risk.level is not RiskLevel.IMMEDIATE
            ):
                plan = self._fallback(human_review=True)
            else:
                # Короткая заранее ограниченная помощь при непосредственной
                # опасности не ждёт человека, но случай остаётся на проверке.
                status = self._passed_review_status(risk, plan)
                plan = replace(plan, review_status=status)
        elif risk.level is RiskLevel.IMMEDIATE:
            # Неудачный review не должен превращать срочную помощь в длинный
            # опрос. Показываем только статический fallback и заранее
            # проверенные общие шаги, сохраняя отметку проверки человеком.
            plan = self._immediate_fallback()
        elif (
            review.decision is ReviewDecision.NEEDS_CLARIFICATION
        ):
            plan = ResponsePlan(
                outcome=Outcome.CLARIFY,
                answer=(
                    "Перед ответом нужно уточнить ситуацию. "
                    "Я не буду додумывать недостающие сведения."
                ),
                uncertainty=review.reasons,
                questions=review.clarifying_questions[:3],
                review_status=ReviewStatus.NEEDS_CLARIFICATION,
            )
        elif (
            review.decision is ReviewDecision.HUMAN_REVIEW
            or risk.level is RiskLevel.HIGH
        ):
            plan = self._fallback(human_review=True)
        else:
            plan = self._fallback(human_review=False)

        # Reviewer тоже считается недоверенным model port. Его причины либо
        # созданный после review fallback проходят тот же последний DLP-рубеж.
        trace.append("privacy:final-output")
        final_output_errors = tuple(
            self._deps.output_guard.inspect(context, risk, plan)
        )
        if final_output_errors:
            trace.append("privacy:final-output-deny")
            plan = self._privacy_fallback()

        return PipelineResult(
            plan=plan,
            risk=risk,
            interpretation=interpretation,
            trace=tuple(trace),
        )

    @staticmethod
    def _call_port(
        stage: str,
        trace: list[str],
        operation: Callable[[], PortResult],
    ) -> tuple[PortResult | None, PipelineResult | None]:
        try:
            return operation(), None
        except PipelinePortError:
            trace.append(f"{stage}:unavailable")
            return None, AiPipeline._port_failure(trace)

    @staticmethod
    def _port_failure(trace: list[str]) -> PipelineResult:
        risk = RiskAssessment(
            level=RiskLevel.SENSITIVE,
            normal_flow_allowed=False,
        )
        return PipelineResult(
            plan=ResponsePlan(
                outcome=Outcome.SAFE_FALLBACK,
                answer=(
                    "Сервис помощника временно не смог подготовить надёжный ответ. "
                    "Ни одно действие и изменение памяти не выполнено."
                ),
                review_status=ReviewStatus.SAFE_FALLBACK,
            ),
            risk=risk,
            interpretation=None,
            trace=tuple(trace),
        )

    @staticmethod
    def _passed_review_status(
        risk: RiskAssessment,
        plan: ResponsePlan,
    ) -> ReviewStatus:
        if risk.human_review_required:
            return ReviewStatus.NEEDS_HUMAN_REVIEW
        if risk.level is RiskLevel.IMMEDIATE:
            return ReviewStatus.NEEDS_HUMAN_REVIEW
        if plan.outcome is Outcome.CLARIFY:
            return ReviewStatus.NEEDS_CLARIFICATION
        return ReviewStatus.PASS

    @staticmethod
    def _privacy_fallback() -> ResponsePlan:
        # После privacy-deny нельзя повторно использовать ни одно модельное поле,
        # включая якобы безопасные шаги из оценки риска.
        return ResponsePlan(
            outcome=Outcome.SAFE_FALLBACK,
            answer=(
                "Я не могу безопасно показать подготовленный ответ. "
                "Личные данные не были добавлены в сообщение."
            ),
            uncertainty=("Сработала защита приватности.",),
            review_status=ReviewStatus.SAFE_FALLBACK,
        )

    @staticmethod
    def _immediate_fallback() -> ResponsePlan:
        # После провала review не переносим даже поля, названные моделью
        # "безопасными": причины и safeNextSteps тоже являются её текстом.
        return ResponsePlan(
            outcome=Outcome.SAFE_FALLBACK,
            answer=(
                "Сейчас важнее короткие безопасные действия. "
                "Не ждите полного разбора ситуации, если опасность непосредственная."
            ),
            uncertainty=("Срочный ответ не прошёл обязательную проверку.",),
            next_steps=(
                "Если это не увеличивает риск, отойдите от непосредственной опасности.",
                (
                    "Свяжитесь с безопасным взрослым или другим человеком, "
                    "который может помочь сейчас."
                ),
                (
                    "При угрозе жизни используйте доступный в вашем регионе "
                    "экстренный способ помощи."
                ),
            ),
            review_status=ReviewStatus.NEEDS_HUMAN_REVIEW,
        )

    @staticmethod
    def _policy_fallback(reasons: tuple[str, ...]) -> ResponsePlan:
        # Причины приходят только из детерминированных policy-функций. Ни
        # исходный draft, ни модельные safe steps в этот ответ не переносятся.
        return ResponsePlan(
            outcome=Outcome.SAFE_FALLBACK,
            answer=(
                "Подготовленный ответ не прошёл обязательные проверки. "
                "Ни одно предложенное действие или изменение памяти не выполнено."
            ),
            uncertainty=reasons,
            review_status=ReviewStatus.SAFE_FALLBACK,
        )

    @staticmethod
    def _fallback(human_review: bool) -> ResponsePlan:
        # При сбое проверки не показываем ни черновик, ни причины reviewer,
        # ни модельные safeNextSteps. Здесь остаётся только утверждённый текст.
        outcome = Outcome.HUMAN_REVIEW if human_review else Outcome.SAFE_FALLBACK
        status = (
            ReviewStatus.NEEDS_HUMAN_REVIEW
            if human_review
            else ReviewStatus.SAFE_FALLBACK
        )
        answer = (
            "Ответ требует проверки человеком. Непроверенный черновик не показан."
            if human_review
            else (
                "Я не могу надёжно проверить подготовленный ответ. "
                "Лучше уточнить вопрос или обратиться к подходящему специалисту."
            )
        )
        uncertainty = (
            ("Ответ остановлен до проверки человеком.",)
            if human_review
            else ("Ответ не прошёл обязательную проверку.",)
        )
        return ResponsePlan(
            outcome=outcome,
            answer=answer,
            uncertainty=uncertainty,
            review_status=status,
        )
