"""Детерминированные ограничения, которые нельзя делегировать LLM."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import math
from typing import Iterable

from .contracts import (
    ActionDraft,
    ActionType,
    Approval,
    Domain,
    EvidenceRecord,
    MemoryDraft,
    MemoryTier,
    ProcessingPurpose,
    ResponsePlan,
    ReviewCheck,
    ReviewDecision,
    ReviewResult,
)


AUTO_ACTIONS = frozenset(
    {
        ActionType.APPLY_SCHEDULE,
        ActionType.ASSIGN_GROUP,
    }
)

PURPOSE_DOMAINS = {
    ProcessingPurpose.GENERAL_SUPPORT: frozenset({Domain.GENERAL, Domain.SAFETY}),
    ProcessingPurpose.FAMILY_SUPPORT: frozenset(
        {Domain.GENERAL, Domain.FAMILY_SUPPORT, Domain.SAFETY}
    ),
    ProcessingPurpose.EDUCATION: frozenset(
        {Domain.GENERAL, Domain.EDUCATION, Domain.SAFETY}
    ),
    ProcessingPurpose.HEALTH_SCREENING: frozenset(
        {Domain.GENERAL, Domain.HEALTH, Domain.SAFETY}
    ),
    ProcessingPurpose.ROUTER_ASSISTANCE: frozenset(
        {Domain.GENERAL, Domain.ROUTER, Domain.SAFETY}
    ),
    ProcessingPurpose.SAFETY_SUPPORT: frozenset({Domain.GENERAL, Domain.SAFETY}),
}

def purpose_allows_domain(
    purpose: ProcessingPurpose,
    domain: Domain,
) -> bool:
    """Не разрешает предметному маршрутизатору расширить подписанную цель."""

    return domain in PURPOSE_DOMAINS[purpose]


def normalize_actions(
    drafts: Iterable[ActionDraft],
    auto_mode: bool,
) -> tuple[ActionDraft, ...]:
    """Назначает подтверждение по политике, не доверяя полю от модели."""

    normalized = []
    for draft in drafts:
        if draft.action_type is ActionType.OTHER:
            approval = Approval.FORBIDDEN
        elif auto_mode and draft.action_type in AUTO_ACTIONS:
            approval = Approval.AUTO_ELIGIBLE
        else:
            approval = Approval.REQUIRED
        normalized.append(replace(draft, approval=approval))
    return tuple(normalized)


def action_policy_errors(
    drafts: Iterable[ActionDraft],
    now: datetime,
) -> tuple[str, ...]:
    """Отклоняет неоднозначный набор предложений до будущего executor."""

    current_time = _as_utc(now)
    known_ids = set()
    errors = []
    for draft in drafts:
        if draft.action_id in known_ids:
            errors.append("Несколько действий используют один action ID.")
        known_ids.add(draft.action_id)
        expires_at = _parse_aware_time(draft.expires_at)
        if expires_at is None:
            errors.append("Действие имеет некорректный срок.")
        elif current_time is None or expires_at <= current_time:
            errors.append("Срок предложенного действия уже истёк.")
    return tuple(dict.fromkeys(errors))


def review_result_errors(review: ReviewResult) -> tuple[str, ...]:
    """Не доверяет внутренней согласованности reviewer structured output."""

    if not isinstance(review, ReviewResult):
        return ("Reviewer вернул результат неверного типа.",)

    errors = []
    if type(review.schema_version) is not int or review.schema_version != 1:
        errors.append("Reviewer вернул неизвестную версию схемы.")
    if not isinstance(review.decision, ReviewDecision):
        errors.append("Reviewer вернул неизвестный вердикт.")
    if not _valid_text_tuple(review.reasons, max_items=12, max_length=1000):
        errors.append("Reviewer вернул некорректные причины решения.")
    if (
        not isinstance(review.failed_checks, tuple)
        or len(set(review.failed_checks)) != len(review.failed_checks)
        or any(not isinstance(check, ReviewCheck) for check in review.failed_checks)
    ):
        errors.append("Reviewer вернул некорректный список проваленных проверок.")
    if (
        not _valid_text_tuple(
            review.clarifying_questions,
            max_items=3,
            max_length=500,
        )
        or len(set(review.clarifying_questions)) != len(review.clarifying_questions)
    ):
        errors.append("Reviewer вернул некорректные уточняющие вопросы.")

    if errors:
        return tuple(dict.fromkeys(errors))

    if review.decision is ReviewDecision.PASS:
        if review.reasons or review.failed_checks or review.clarifying_questions:
            errors.append("Reviewer вернул противоречивый успешный вердикт.")
    else:
        if not review.reasons:
            errors.append("Reviewer не объяснил отклонение ответа.")
    if review.decision is ReviewDecision.NEEDS_CLARIFICATION:
        if not review.clarifying_questions:
            errors.append("Reviewer не сформулировал уточняющий вопрос.")
    elif review.clarifying_questions:
        errors.append("Уточняющие вопросы не соответствуют вердикту reviewer.")
    return tuple(dict.fromkeys(errors))


def memory_policy_errors(
    drafts: Iterable[MemoryDraft],
    allowed_scopes: Iterable[str],
    now: datetime,
) -> tuple[str, ...]:
    """Проверяет область памяти независимо от текста и решения модели."""

    current_time = _as_utc(now)
    allowed = frozenset(allowed_scopes)
    errors = []
    known_ids = set()
    for draft in drafts:
        if draft.draft_id in known_ids:
            errors.append("Несколько записей памяти используют один draft ID.")
        known_ids.add(draft.draft_id)
        if not draft.confirmation_required:
            errors.append("Запись памяти предложена без подтверждения.")
        if draft.subject_ref != "speaker":
            errors.append("Модель попыталась выбрать другого владельца памяти.")
        if draft.visibility not in allowed:
            errors.append("Запись памяти выходит за разрешённую область видимости.")
        valid_retentions = {
            MemoryTier.LIFE_ARCHIVE: frozenset({"lifeArchive"}),
            MemoryTier.IMPORTANT_MEMORY: frozenset({"reviewRequired"}),
            MemoryTier.CURRENT_TOPIC: frozenset({"session", "twoYearsInactive"}),
        }
        if draft.retention not in valid_retentions.get(draft.memory_tier, ()):
            errors.append("Слой памяти не соответствует политике хранения.")
        if draft.provenance == "verifiedExternal" and not draft.source_refs:
            errors.append("Подтверждённая извне запись не имеет источника.")
        if draft.provenance == "modelHypothesis":
            if draft.confidence is None or not draft.source_refs or not draft.review_at:
                errors.append(
                    "Модельная гипотеза не содержит оснований, уверенности или срока пересмотра."
                )
            if (
                draft.confidence is not None
                and (
                    not math.isfinite(draft.confidence)
                    or not 0 <= draft.confidence <= 1
                )
            ):
                errors.append("Уверенность модельной гипотезы выходит за допустимый диапазон.")
            review_at = _parse_aware_time(draft.review_at)
            if review_at is None:
                errors.append("Модельная гипотеза имеет некорректный срок пересмотра.")
            elif current_time is None or review_at <= current_time:
                errors.append("Срок пересмотра модельной гипотезы уже наступил.")
        if draft.category == "workingHypothesis" and draft.provenance != "modelHypothesis":
            errors.append("Рабочая гипотеза имеет неверный тип происхождения.")
        if draft.provenance == "modelHypothesis" and draft.visibility != "self":
            errors.append("Модельная гипотеза не может стать общей семейной памятью.")
        if draft.category == "secret" and draft.visibility != "self":
            errors.append("Секрет нельзя предложить как общую семейную память.")
        if (
            draft.category == "workingHypothesis"
            and draft.memory_tier is MemoryTier.LIFE_ARCHIVE
        ):
            errors.append("Рабочая гипотеза не может попасть в жизненный архив.")
        if draft.category == "healthReport" and draft.provenance == "modelHypothesis":
            errors.append("Модельная гипотеза не может называться записью о здоровье.")
    return tuple(dict.fromkeys(errors))


def evidence_policy_errors(
    plan: ResponsePlan,
    records: Iterable[EvidenceRecord],
    now: datetime,
    country_profile: str,
    age_band: str,
) -> tuple[str, ...]:
    """Не допускает выдуманную, отозванную или несвязанную ссылку."""

    record_list = tuple(records)
    available = {record.evidence_id: record for record in record_list}
    cited_claims = {citation.claim for citation in plan.citations}
    fact_set = set(plan.facts)
    errors = list(
        evidence_record_errors(
            record_list,
            now,
            country_profile,
            age_band,
        )
    )

    if plan.facts and not plan.citations:
        errors.append("Фактические утверждения не связаны с источниками.")
    if any(fact not in cited_claims for fact in plan.facts):
        errors.append("Не каждое фактическое утверждение имеет отдельную ссылку.")
    if any(claim not in fact_set for claim in cited_claims):
        errors.append("Ссылка относится к утверждению, отсутствующему в списке фактов.")

    for citation in plan.citations:
        if not citation.claim.strip() or not citation.evidence_ids:
            errors.append("Ссылка на источник имеет неполный контракт.")
            continue
        supporting_records = []
        for evidence_id in citation.evidence_ids:
            record = available.get(evidence_id)
            if record is None:
                errors.append("Ответ ссылается на источник, которого не было в выдаче.")
            elif not _evidence_is_current(record, now):
                errors.append("Ответ ссылается на неактивный источник.")
            elif not _evidence_applies(record, country_profile, age_band):
                errors.append("Источник не относится к стране или возрасту собеседника.")
            else:
                supporting_records.append(record)
        if supporting_records and not any(
            citation.claim in record.claims for record in supporting_records
        ):
            errors.append("Ни один указанный источник не содержит заявленный факт.")

    return tuple(dict.fromkeys(errors))


def evidence_record_errors(
    records: Iterable[EvidenceRecord],
    now: datetime,
    country_profile: str,
    age_band: str,
) -> tuple[str, ...]:
    """Не выпускает неподходящий record к planner, даже если тот его не цитирует."""

    record_list = tuple(records)
    errors = []
    if len({record.evidence_id for record in record_list}) != len(record_list):
        errors.append("Выдача источников содержит повторяющийся evidence ID.")
    for record in record_list:
        if not _evidence_is_current(record, now):
            errors.append("Выдача содержит неактивный источник.")
        elif not _evidence_applies(record, country_profile, age_band):
            errors.append("Выдача содержит источник для другой страны или возраста.")
    return tuple(dict.fromkeys(errors))


def _evidence_is_current(record: EvidenceRecord, now: datetime) -> bool:
    if record.status != "active":
        return False
    current_time = _as_utc(now)
    checked_at = _parse_aware_time(record.checked_at)
    if current_time is None or checked_at is None or checked_at > current_time:
        return False
    valid_until = _parse_aware_time(record.valid_until)
    if valid_until is None or valid_until <= checked_at:
        return False
    return valid_until > current_time


def _evidence_applies(
    record: EvidenceRecord,
    country_profile: str,
    age_band: str,
) -> bool:
    return (
        "all" in record.jurisdictions or country_profile in record.jurisdictions
    ) and ("all" in record.age_bands or age_band in record.age_bands)


def _parse_aware_time(value: str | None) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _as_utc(value: datetime) -> datetime | None:
    if not isinstance(value, datetime) or value.tzinfo is None:
        return None
    return value.astimezone(timezone.utc)


def _valid_text_tuple(
    values: object,
    max_items: int,
    max_length: int,
) -> bool:
    if not isinstance(values, tuple) or len(values) > max_items:
        return False
    return all(
        isinstance(value, str) and value.strip() and len(value) <= max_length
        for value in values
    )
