"""Строгие примитивы разбора уже проверенного transport payload."""

from __future__ import annotations

import json
import math
from typing import Any, Mapping


class DuplicateJsonKeyError(ValueError):
    """JSON содержит неоднозначный объект с повторяющимся именем поля."""


def decode_strict_json_object(
    payload: bytes,
    max_depth: int = 24,
    max_nodes: int = 10_000,
) -> Mapping[str, Any]:
    """Читает UTF-8 JSON без duplicate keys, NaN/Infinity и корня не-object.

    Функция не валидирует предметную JSON Schema и вызывается только после
    криптографической проверки JWS. Schema adapter обязан выполнить второй шаг
    и построить `RequestEnvelope` без терпимого преобразования неизвестных полей.
    """

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise DuplicateJsonKeyError(f"Повторяющееся JSON-поле: {key}")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"Недопустимая JSON-константа: {value}")

    text = payload.decode("utf-8", errors="strict")
    value = json.loads(
        text,
        object_pairs_hook=unique_object,
        parse_constant=reject_constant,
    )
    if not isinstance(value, dict):
        raise ValueError("Корнем подписанного payload должен быть JSON-объект.")
    _validate_json_tree(value, max_depth=max_depth, max_nodes=max_nodes)
    return value


def _validate_json_tree(value: Any, max_depth: int, max_nodes: int) -> None:
    """Ограничивает структуру и отвергает недопустимые Unicode surrogate."""

    if max_depth < 1 or max_nodes < 1:
        raise ValueError("Лимиты JSON должны быть положительными.")

    nodes_seen = 0
    stack = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        nodes_seen += 1
        if nodes_seen > max_nodes:
            raise ValueError("JSON превышает допустимое число элементов.")
        if depth > max_depth:
            raise ValueError("JSON превышает допустимую глубину.")

        if isinstance(current, str):
            _reject_surrogates(current)
        elif isinstance(current, float) and not math.isfinite(current):
            raise ValueError("JSON-число выходит за конечный диапазон.")
        elif isinstance(current, dict):
            for key, item in current.items():
                _reject_surrogates(key)
                stack.append((item, depth + 1))
        elif isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)


def _reject_surrogates(value: str) -> None:
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise ValueError("JSON содержит одиночный Unicode surrogate.")
