"""Внутренние контракты экспериментального конвейера.

Transport adapter сначала проверяет compact JWS как точную последовательность
байтов. Только затем его payload проходит строгий JSON-разбор, versioned schema
и преобразование в эти Python-модели. Порты модели получают `ModelContext`, а
не полный конверт с tenant, consent и правами действий.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Mapping


class Audience(StrEnum):
    PARENT = "parent"
    CHILD = "child"
    FAMILY = "family"


class Domain(StrEnum):
    GENERAL = "general"
    EDUCATION = "education"
    FAMILY_SUPPORT = "familySupport"
    HEALTH = "health"
    SAFETY = "safety"
    ROUTER = "router"


class PrivacyScope(StrEnum):
    LOCAL = "local"
    ONE_OFF = "oneOff"
    LONGITUDINAL = "longitudinal"


class PayloadClass(StrEnum):
    GENERAL = "general"
    SENSITIVE = "sensitive"
    CHILD_SENSITIVE = "childSensitive"
    HEALTH_SENSITIVE = "healthSensitive"


class ProcessingPurpose(StrEnum):
    GENERAL_SUPPORT = "generalSupport"
    FAMILY_SUPPORT = "familySupport"
    EDUCATION = "education"
    HEALTH_SCREENING = "healthScreening"
    ROUTER_ASSISTANCE = "routerAssistance"
    SAFETY_SUPPORT = "safetySupport"


class RiskLevel(StrEnum):
    ROUTINE = "routine"
    SENSITIVE = "sensitive"
    HIGH = "high"
    IMMEDIATE = "immediate"


class Outcome(StrEnum):
    ANSWER = "answer"
    CLARIFY = "clarify"
    SAFE_FALLBACK = "safeFallback"
    REFUSE = "refuse"
    HUMAN_REVIEW = "humanReview"


class ReviewStatus(StrEnum):
    UNREVIEWED = "unreviewed"
    PASS = "pass"
    REVISE = "revise"
    SAFE_FALLBACK = "safeFallback"
    NEEDS_CLARIFICATION = "needsClarification"
    NEEDS_HUMAN_REVIEW = "needsHumanReview"


class ReviewDecision(StrEnum):
    PASS = "pass"
    REVISE = "revise"
    SAFE_FALLBACK = "safeFallback"
    NEEDS_CLARIFICATION = "needsClarification"
    HUMAN_REVIEW = "needsHumanReview"


class ReviewCheck(StrEnum):
    UNSUPPORTED_CLAIM = "unsupportedClaim"
    PRIVACY_BOUNDARY = "privacyBoundary"
    AGE_MISMATCH = "ageMismatch"
    UNSAFE_ACTION = "unsafeAction"
    DEPENDENCY_NUDGE = "dependencyNudge"
    DIAGNOSIS_OR_TREATMENT = "diagnosisOrTreatment"
    EDUCATION_SUBSTITUTION = "educationSubstitution"
    MISSING_UNCERTAINTY = "missingUncertainty"
    NEEDS_SPECIALIST = "needsSpecialist"


class ActionType(StrEnum):
    APPLY_SCHEDULE = "applyExistingSchedule"
    ASSIGN_GROUP = "assignOrdinaryGroup"
    DRAFT_MESSAGE = "draftMessage"
    SUGGEST_APPOINTMENT = "suggestAppointment"
    OTHER = "other"


class Approval(StrEnum):
    REQUIRED = "required"
    AUTO_ELIGIBLE = "autoModeEligible"
    FORBIDDEN = "forbidden"


class MemoryTier(StrEnum):
    LIFE_ARCHIVE = "lifeArchive"
    IMPORTANT_MEMORY = "importantMemory"
    CURRENT_TOPIC = "currentTopic"


class PrivacyBoundaryError(ValueError):
    """Вход нельзя безопасно передать ни одному модельному порту."""


class IngressBoundaryError(ValueError):
    """Сервер не подтвердил подлинность, свежесть или право задачи."""


class PipelinePortError(RuntimeError):
    """Ожидаемый операционный отказ model/retrieval-порта без его деталей."""


@dataclass(frozen=True)
class SignedTask:
    """Неразобранный compact JWS из внешнего transport adapter."""

    compact_jws: str
    schema_version: int = 1


@dataclass(frozen=True)
class VerifiedJwsPayload:
    """Payload и protected metadata после успешной JWS-проверки."""

    signing_key_id: str
    algorithm: str
    token_type: str
    content_type: str
    payload_bytes: bytes
    critical_headers: tuple[str, ...] = ()


@dataclass(frozen=True)
class ChatMessage:
    role: str
    text: str


@dataclass(frozen=True)
class RequestEnvelope:
    request_id: str
    tenant_id: str
    session_id: str
    audience: Audience
    age_band: str
    locale: str
    country_profile: str
    message: str
    privacy_scope: PrivacyScope
    payload_class: PayloadClass
    processing_purpose: ProcessingPurpose
    provider_id: str
    consent_proof: str
    privacy_proof: str
    issued_at: str
    expires_at: str
    history: tuple[ChatMessage, ...] = ()
    allowed_scopes: tuple[str, ...] = ("self", "sessionOnly")
    auto_mode: bool = False
    schema_version: int = 1


@dataclass(frozen=True)
class ModelContext:
    audience: Audience
    age_band: str
    locale: str
    country_profile: str
    processing_purpose: ProcessingPurpose
    message: str
    history: tuple[ChatMessage, ...] = ()


@dataclass(frozen=True)
class MeaningHypothesis:
    summary: str
    confidence: float
    basis: tuple[str, ...] = ()
    alternatives: tuple[str, ...] = ()


@dataclass(frozen=True)
class Interpretation:
    normalized_request: str
    domain: Domain
    confidence: float
    hypotheses: tuple[MeaningHypothesis, ...]
    direct_claims: tuple[str, ...] = ()
    assumptions: tuple[str, ...] = ()
    conflicts: tuple[str, ...] = ()
    missing_info: tuple[str, ...] = ()
    questions: tuple[str, ...] = ()
    schema_version: int = 1


@dataclass(frozen=True)
class RiskConcern:
    category: str
    observation: str
    uncertainty: str


@dataclass(frozen=True)
class RiskAssessment:
    level: RiskLevel
    concerns: tuple[RiskConcern, ...] = ()
    normal_flow_allowed: bool = True
    human_review_required: bool = False
    safe_next_steps: tuple[str, ...] = ()
    schema_version: int = 1


@dataclass(frozen=True)
class EvidenceRecord:
    evidence_id: str
    title: str
    publisher: str
    source_url: str
    source_kind: str
    jurisdictions: tuple[str, ...]
    age_bands: tuple[str, ...]
    claims: tuple[str, ...]
    license_note: str
    content_hash: str
    checked_at: str
    valid_until: str
    status: str = "active"
    schema_version: int = 1


@dataclass(frozen=True)
class Citation:
    claim: str
    evidence_ids: tuple[str, ...]


@dataclass(frozen=True)
class ActionDraft:
    action_id: str
    action_type: ActionType
    summary: str
    expires_at: str
    arguments: Mapping[str, Any] = field(default_factory=dict)
    approval: Approval = Approval.REQUIRED


@dataclass(frozen=True)
class MemoryDraft:
    draft_id: str
    subject_ref: str
    memory_tier: MemoryTier
    category: str
    summary: str
    provenance: str
    visibility: str
    retention: str
    source_refs: tuple[str, ...] = ()
    confidence: float | None = None
    counter_evidence: tuple[str, ...] = ()
    review_at: str | None = None
    confirmation_required: bool = True


@dataclass(frozen=True)
class ResponsePlan:
    outcome: Outcome
    answer: str
    facts: tuple[str, ...] = ()
    hypotheses: tuple[str, ...] = ()
    citations: tuple[Citation, ...] = ()
    uncertainty: tuple[str, ...] = ()
    questions: tuple[str, ...] = ()
    next_steps: tuple[str, ...] = ()
    avoid: tuple[str, ...] = ()
    foreseeable_actions: tuple[str, ...] = ()
    action_drafts: tuple[ActionDraft, ...] = ()
    memory_drafts: tuple[MemoryDraft, ...] = ()
    review_status: ReviewStatus = ReviewStatus.UNREVIEWED
    schema_version: int = 1


@dataclass(frozen=True)
class ReviewResult:
    decision: ReviewDecision
    reasons: tuple[str, ...] = ()
    failed_checks: tuple[ReviewCheck, ...] = ()
    clarifying_questions: tuple[str, ...] = ()
    schema_version: int = 1


@dataclass(frozen=True)
class PipelineResult:
    plan: ResponsePlan
    risk: RiskAssessment
    interpretation: Interpretation | None
    trace: tuple[str, ...]
