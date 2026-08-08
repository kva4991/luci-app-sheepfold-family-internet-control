"""Проверяет однозначный JSON-разбор после криптографической JWS-проверки.

Тесты защищают от duplicate keys, нестандартных чисел, неверного Unicode и
структурных бомб. Полную предметную JSON Schema обязан отдельно проверить
transport adapter перед созданием `RequestEnvelope`.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sheepfold_ai_core import (  # noqa: E402
    DuplicateJsonKeyError,
    decode_strict_json_object,
)


class StrictJsonTransportTest(unittest.TestCase):
    def test_valid_nested_object_is_decoded(self):
        value = decode_strict_json_object(
            b'{"message":"ok","history":[{"role":"user"}]}'
        )

        self.assertEqual(value["message"], "ok")
        self.assertEqual(value["history"][0]["role"], "user")

    def test_duplicate_key_is_rejected_at_every_depth(self):
        payloads = (
            b'{"message":"first","message":"second"}',
            b'{"history":[{"role":"user","role":"assistant"}]}',
        )

        for payload in payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(DuplicateJsonKeyError):
                    decode_strict_json_object(payload)

    def test_non_standard_numbers_are_rejected(self):
        for constant in (b"NaN", b"Infinity", b"-Infinity", b"1e400"):
            with self.subTest(constant=constant):
                with self.assertRaises(ValueError):
                    decode_strict_json_object(b'{"value":' + constant + b"}")

    def test_invalid_utf8_and_lone_surrogate_are_rejected(self):
        with self.assertRaises(UnicodeError):
            decode_strict_json_object(b'{"message":"\xff"}')
        with self.assertRaises(ValueError):
            decode_strict_json_object(b'{"message":"\\ud800"}')

    def test_root_depth_and_node_limits_are_enforced(self):
        with self.assertRaises(ValueError):
            decode_strict_json_object(b"[]")
        with self.assertRaises(ValueError):
            decode_strict_json_object(
                b'{"a":{"b":{"c":1}}}',
                max_depth=2,
            )
        with self.assertRaises(ValueError):
            decode_strict_json_object(
                b'{"a":1,"b":2}',
                max_nodes=2,
            )


if __name__ == "__main__":
    unittest.main()
