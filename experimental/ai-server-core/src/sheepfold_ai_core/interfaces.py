"""Порты модулей; конкретный LLM-провайдер остаётся сменным адаптером."""

from __future__ import annotations

from typing import Protocol, Sequence

from .contracts import (
    EvidenceRecord,
    Interpretation,
    ModelContext,
    RequestEnvelope,
    ResponsePlan,
    ReviewResult,
    RiskAssessment,
    SignedTask,
)


class IngressGuard(Protocol):
    def open(self, task: SignedTask) -> RequestEnvelope: ...


class ProviderRouteGuard(Protocol):
    def allows(self, request: RequestEnvelope) -> bool: ...


class PrivacyGuard(Protocol):
    def prepare(self, request: RequestEnvelope) -> ModelContext: ...


class OutputGuard(Protocol):
    def inspect(
        self,
        context: ModelContext,
        risk: RiskAssessment,
        plan: ResponsePlan,
    ) -> Sequence[str]: ...


class RiskGate(Protocol):
    def assess(
        self,
        context: ModelContext,
        interpretation: Interpretation | None,
    ) -> RiskAssessment: ...


class Interpreter(Protocol):
    def interpret(self, context: ModelContext) -> Interpretation: ...


class EvidenceService(Protocol):
    def retrieve(
        self,
        context: ModelContext,
        interpretation: Interpretation,
    ) -> Sequence[EvidenceRecord]: ...


class ResponsePlanner(Protocol):
    def plan(
        self,
        context: ModelContext,
        interpretation: Interpretation,
        risk: RiskAssessment,
        evidence: Sequence[EvidenceRecord],
    ) -> ResponsePlan: ...


class SafetyPlanner(Protocol):
    def plan(
        self,
        context: ModelContext,
        risk: RiskAssessment,
    ) -> ResponsePlan: ...


class ResponseReviewer(Protocol):
    def review(
        self,
        context: ModelContext,
        risk: RiskAssessment,
        plan: ResponsePlan,
        evidence: Sequence[EvidenceRecord],
    ) -> ReviewResult: ...
