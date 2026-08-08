"""Детерминированные входные границы экспериментального server pipeline."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from secrets import compare_digest
from threading import Lock
from typing import Callable, Iterable, Protocol, Sequence

from .contracts import (
    ChatMessage,
    IngressBoundaryError,
    ModelContext,
    PayloadClass,
    PrivacyBoundaryError,
    PrivacyScope,
    RequestEnvelope,
    ResponsePlan,
    RiskAssessment,
    SignedTask,
    VerifiedJwsPayload,
)


class ReplayStore(Protocol):
    def contains(
        self,
        tenant_id: str,
        request_id: str,
        now: datetime,
    ) -> bool: ...

    def consume(
        self,
        tenant_id: str,
        request_id: str,
        expires_at: datetime,
        now: datetime,
    ) -> bool: ...


class MemoryReplayStore:
    """Потокобезопасное хранилище только для unit-тестов и одного процесса.

    Production требует атомарного общего хранилища, переживающего перезапуск
    каждого экземпляра в пределах максимального TTL задачи.
    """

    def __init__(self):
        self._expires: dict[tuple[str, str], datetime] = {}
        self._lock = Lock()

    def contains(
        self,
        tenant_id: str,
        request_id: str,
        now: datetime,
    ) -> bool:
        with self._lock:
            self._purge_expired(now)
            return (tenant_id, request_id) in self._expires

    def consume(
        self,
        tenant_id: str,
        request_id: str,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        # Ротация ключа не превращает прежнюю задачу в новую. Иначе один payload
        # с тем же request ID можно было бы обработать повторно в период, когда
        # сервер одновременно доверяет старому и новому ключу роутера.
        replay_key = (tenant_id, request_id)
        with self._lock:
            self._purge_expired(now)
            if replay_key in self._expires:
                return False
            self._expires[replay_key] = expires_at
            return True

    def _purge_expired(self, now: datetime) -> None:
        self._expires = {
            key: expiry for key, expiry in self._expires.items() if expiry > now
        }


class BoundProviderRouteGuard:
    """Связывает signed provider с фактически подключённым model route.

    В первом прототипе один запрос может иметь только одного внешнего
    получателя. Все внешние model ports этого pipeline должны принадлежать
    `bound_provider_id`; локальные детерминированные проверки не считаются
    отдельным provider.
    """

    _provider_id_pattern = re.compile(r"^[A-Za-z0-9._:-]{2,80}$")

    def __init__(self, bound_provider_id: str):
        if (
            not isinstance(bound_provider_id, str)
            or self._provider_id_pattern.fullmatch(bound_provider_id) is None
        ):
            raise ValueError("Provider route должен быть допустимым ASCII ID.")
        self._bound_provider_id = bound_provider_id

    def allows(self, request: RequestEnvelope) -> bool:
        return (
            isinstance(request.provider_id, str)
            and self._provider_id_pattern.fullmatch(request.provider_id) is not None
            and compare_digest(request.provider_id, self._bound_provider_id)
        )


class SignedIngressGuard:
    """Открывает JWS до разбора подписанного JSON и потребления request ID.

    `verify_jws` обязан проверять compact JWS по protected header и возвращать
    payload только после успешной криптографии. `parse_payload` затем применяет
    строгий JSON parser и полную versioned schema. Такой порядок не позволяет
    разным JSON-парсерам по-разному понять ещё не проверенную задачу.
    """

    _compact_jws_pattern = re.compile(
        r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"
    )

    def __init__(
        self,
        authorize_tenant: Callable[[str, str], bool],
        verify_jws: Callable[[str], VerifiedJwsPayload],
        parse_payload: Callable[[bytes], RequestEnvelope],
        replay_store: ReplayStore,
        allow_request: Callable[[str, str, datetime], bool],
        allowed_algorithms: Iterable[str],
        now: Callable[[], datetime] | None = None,
        max_ttl: timedelta = timedelta(minutes=5),
        max_jws_chars: int = 131_072,
        max_payload_bytes: int = 98_304,
        clock_skew: timedelta = timedelta(seconds=30),
        allowed_critical_headers: Iterable[str] = (),
        expected_token_type: str = "sheepfold-ai-task+jws",
        expected_content_type: str = "application/sheepfold-ai-task+json",
    ):
        algorithm_set = frozenset(allowed_algorithms)
        if not algorithm_set or any(
            not isinstance(algorithm, str) or not algorithm
            for algorithm in algorithm_set
        ):
            raise ValueError("Allowlist алгоритмов подписи не настроен.")
        if max_ttl <= timedelta(0):
            raise ValueError("Максимальный TTL задачи должен быть положительным.")
        if clock_skew < timedelta(0):
            raise ValueError("Допуск часов не может быть отрицательным.")
        if (
            type(max_jws_chars) is not int
            or max_jws_chars < 1
            or type(max_payload_bytes) is not int
            or max_payload_bytes < 1
        ):
            raise ValueError("Лимиты transport должны быть положительными целыми.")
        if not expected_token_type or not expected_content_type:
            raise ValueError("Типы JWS transport должны быть заданы.")
        self._authorize_tenant = authorize_tenant
        self._verify_jws = verify_jws
        self._parse_payload = parse_payload
        self._replay_store = replay_store
        self._allow_request = allow_request
        self._allowed_algorithms = algorithm_set
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._max_ttl = max_ttl
        self._max_jws_chars = max_jws_chars
        self._max_payload_bytes = max_payload_bytes
        self._clock_skew = clock_skew
        self._allowed_critical_headers = frozenset(allowed_critical_headers)
        self._expected_token_type = expected_token_type
        self._expected_content_type = expected_content_type

    def open(self, task: SignedTask) -> RequestEnvelope:
        if not isinstance(task, SignedTask):
            raise IngressBoundaryError("Transport adapter вернул неверный тип задачи.")
        if type(task.schema_version) is not int or task.schema_version != 1:
            raise IngressBoundaryError("Неизвестная версия transport-схемы.")
        if (
            not isinstance(task.compact_jws, str)
            or not task.compact_jws
            or len(task.compact_jws) > self._max_jws_chars
            or self._compact_jws_pattern.fullmatch(task.compact_jws) is None
        ):
            raise IngressBoundaryError("Некорректный формат подписанной задачи.")

        try:
            verified = self._verify_jws(task.compact_jws)
        except (TypeError, ValueError) as error:
            raise IngressBoundaryError("Подпись задачи не подтверждена.") from error

        if not isinstance(verified, VerifiedJwsPayload):
            raise IngressBoundaryError("JWS adapter вернул неверный тип результата.")
        if not isinstance(verified.algorithm, str):
            raise IngressBoundaryError("Некорректный алгоритм подписи.")
        if verified.algorithm not in self._allowed_algorithms:
            raise IngressBoundaryError("Алгоритм подписи не разрешён.")
        if verified.token_type != self._expected_token_type:
            raise IngressBoundaryError("Неверный тип подписанной задачи.")
        if verified.content_type != self._expected_content_type:
            raise IngressBoundaryError("Неверный тип содержимого задачи.")
        if not isinstance(verified.critical_headers, tuple) or any(
            not isinstance(header, str) for header in verified.critical_headers
        ):
            raise IngressBoundaryError("Некорректный список critical headers.")
        if not set(verified.critical_headers) <= self._allowed_critical_headers:
            raise IngressBoundaryError("JWS содержит неподдерживаемый critical header.")
        if (
            not isinstance(verified.signing_key_id, str)
            or not verified.signing_key_id
        ):
            raise IngressBoundaryError("В защищённом заголовке нет key ID.")
        if (
            not isinstance(verified.payload_bytes, bytes)
            or not verified.payload_bytes
            or len(verified.payload_bytes) > self._max_payload_bytes
        ):
            raise IngressBoundaryError("Недопустимый размер payload.")

        try:
            request = self._parse_payload(verified.payload_bytes)
        except (RecursionError, TypeError, ValueError, UnicodeError) as error:
            raise IngressBoundaryError("Подписанный payload не прошёл схему.") from error

        if not isinstance(request, RequestEnvelope):
            raise IngressBoundaryError("Schema adapter вернул неверный тип задачи.")
        if not isinstance(request.privacy_scope, PrivacyScope):
            raise IngressBoundaryError("Некорректная область обработки задачи.")
        for value in (
            request.request_id,
            request.tenant_id,
            request.session_id,
        ):
            if not isinstance(value, str) or not 8 <= len(value) <= 80:
                raise IngressBoundaryError("Некорректный идентификатор задачи.")

        now = self._now()
        if not isinstance(now, datetime) or now.tzinfo is None:
            raise IngressBoundaryError("Серверные часы не содержат часовой пояс.")
        now = now.astimezone(timezone.utc)
        issued_at = self._parse_time(request.issued_at)
        expires_at = self._parse_time(request.expires_at)

        if type(request.schema_version) is not int or request.schema_version != 1:
            raise IngressBoundaryError("Неизвестная версия схемы.")
        if request.privacy_scope is PrivacyScope.LOCAL:
            raise IngressBoundaryError("Локальная задача не должна поступать на сервер.")
        if issued_at > now + self._clock_skew:
            raise IngressBoundaryError("Задача выпущена в недопустимом будущем.")
        if now - issued_at > self._max_ttl + self._clock_skew:
            raise IngressBoundaryError("Задача выпущена слишком давно.")
        if (
            expires_at <= issued_at
            or expires_at <= now
            or expires_at - issued_at > self._max_ttl
        ):
            raise IngressBoundaryError("Недопустимый срок задачи.")
        if (
            not isinstance(request.consent_proof, str)
            or len(request.consent_proof) < 8
            or not isinstance(request.privacy_proof, str)
            or len(request.privacy_proof) < 8
        ):
            raise IngressBoundaryError("Нет обязательного доказательства режима.")
        if not self._authorize_tenant(request.tenant_id, verified.signing_key_id):
            raise IngressBoundaryError("Tenant или ключ не разрешён.")
        # Последовательный replay не должен списывать rate budget повторно.
        # Limiter всё равно получает request ID и обязан дебетовать его
        # идемпотентно, потому что параллельные запросы могут пройти contains
        # до того, как один из них атомарно выполнит consume.
        if self._replay_store.contains(request.tenant_id, request.request_id, now):
            raise IngressBoundaryError("Задача уже использована.")
        if not self._allow_request(request.tenant_id, request.request_id, now):
            raise IngressBoundaryError("Превышена частота запросов.")
        if not self._replay_store.consume(
            request.tenant_id,
            request.request_id,
            expires_at,
            now,
        ):
            raise IngressBoundaryError("Задача уже использована.")
        return request

    @staticmethod
    def _parse_time(value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (AttributeError, TypeError, ValueError) as error:
            raise IngressBoundaryError("Некорректный срок задачи.") from error
        if parsed.tzinfo is None:
            raise IngressBoundaryError("Срок задачи должен содержать часовой пояс.")
        return parsed.astimezone(timezone.utc)


class VerifiedContextGuard:
    """Проверяет локальный privacy proof и удаляет служебные поля из контекста.

    Это второй рубеж. Класс не обещает найти все персональные данные и не
    заменяет Privacy Proxy на роутере. `verify_privacy` обязан связать receipt
    с provider, purpose и payload class, а `find_sensitive_data` возвращает
    только коды нарушений и не должен писать найденные значения в журнал.
    """

    def __init__(
        self,
        verify_privacy: Callable[[RequestEnvelope], bool],
        find_sensitive_data: Callable[
            [str, tuple[ChatMessage, ...], PayloadClass], Sequence[str]
        ],
        max_message_chars: int = 12_000,
        max_history_chars: int = 48_000,
    ):
        self._verify_privacy = verify_privacy
        self._find_sensitive_data = find_sensitive_data
        self._max_message_chars = max_message_chars
        self._max_history_chars = max_history_chars

    def prepare(self, request: RequestEnvelope) -> ModelContext:
        if not self._verify_privacy(request):
            raise PrivacyBoundaryError("Privacy proof не подтверждён.")
        if not request.message or len(request.message) > self._max_message_chars:
            raise PrivacyBoundaryError("Недопустимый размер сообщения.")
        history_size = sum(len(item.text) for item in request.history)
        if len(request.history) > 40 or history_size > self._max_history_chars:
            raise PrivacyBoundaryError("Недопустимый размер истории.")
        violations = tuple(
            self._find_sensitive_data(
                request.message,
                request.history,
                request.payload_class,
            )
        )
        if violations:
            raise PrivacyBoundaryError("Обнаружены неминимизированные данные.")

        return ModelContext(
            audience=request.audience,
            age_band=request.age_band,
            locale=request.locale,
            country_profile=request.country_profile,
            processing_purpose=request.processing_purpose,
            message=request.message,
            history=request.history,
        )


class SensitiveOutputGuard:
    """Не выпускает черновик с признаками запрещённых данных.

    Callback получает весь структурированный plan, включая memory/action drafts,
    и возвращает только коды нарушений. Это не доказывает отсутствие смысловой
    утечки между людьми, поэтому semantic/cross-tenant tests остаются отдельными.
    """

    def __init__(
        self,
        find_sensitive_data: Callable[
            [ModelContext, RiskAssessment, ResponsePlan], Sequence[str]
        ],
    ):
        self._find_sensitive_data = find_sensitive_data

    def inspect(
        self,
        context: ModelContext,
        risk: RiskAssessment,
        plan: ResponsePlan,
    ) -> Sequence[str]:
        return tuple(self._find_sensitive_data(context, risk, plan))
