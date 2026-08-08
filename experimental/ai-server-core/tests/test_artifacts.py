"""Проверяет целостность исследовательских артефактов и их изоляцию.

Это локальный контрактный уровень: тест читает схемы, eval-файлы, ссылки и
несколько production build-файлов, ничего не изменяя. Он не валидирует смысл
источников, полноту JSON Schema и отсутствие всех возможных runtime-связей.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unittest
from dataclasses import fields
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sheepfold_ai_core.contracts import (  # noqa: E402
    ActionDraft,
    ActionType,
    Approval,
    Audience,
    Domain,
    EvidenceRecord,
    Interpretation,
    MemoryDraft,
    MemoryTier,
    Outcome,
    PayloadClass,
    PrivacyScope,
    ProcessingPurpose,
    RequestEnvelope,
    ResponsePlan,
    ReviewCheck,
    ReviewDecision,
    ReviewResult,
    ReviewStatus,
    RiskAssessment,
    RiskLevel,
    SignedTask,
)


def camel_case(name):
    parts = name.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ArtifactTest(unittest.TestCase):
    def test_every_schema_is_valid_json_with_closed_root_object(self):
        schema_files = sorted((ROOT / "schemas").glob("*.json"))
        self.assertGreaterEqual(len(schema_files), 7)

        for path in schema_files:
            with self.subTest(path=path.name):
                schema = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(schema["type"], "object")
                self.assertFalse(schema["additionalProperties"])
                self.assertTrue(schema["required"])

                for ref in re.findall(r'"\$ref"\s*:\s*"([^"]+)"', path.read_text(encoding="utf-8")):
                    if "://" not in ref and not ref.startswith("#"):
                        self.assertTrue((path.parent / ref).exists(), ref)

    def test_transport_schemas_are_versioned(self):
        versioned = (
            "request-envelope.schema.json",
            "signed-task.schema.json",
            "interpretation.schema.json",
            "risk-assessment.schema.json",
            "evidence-record.schema.json",
            "response-plan.schema.json",
            "review-result.schema.json",
            "prompt-manifest.schema.json",
        )

        for name in versioned:
            with self.subTest(path=name):
                schema = json.loads((ROOT / "schemas" / name).read_text(encoding="utf-8"))
                self.assertIn("schemaVersion", schema["required"])
                self.assertEqual(schema["properties"]["schemaVersion"], {"const": 1})

    def test_server_request_cannot_claim_local_processing(self):
        schema = json.loads(
            (ROOT / "schemas" / "request-envelope.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(
            schema["properties"]["privacyScope"]["enum"],
            ["oneOff", "longitudinal"],
        )
        self.assertIn("processingPurpose", schema["required"])
        self.assertIn("providerId", schema["required"])
        self.assertNotIn("taskSignature", schema["properties"])
        self.assertNotIn("signingKeyId", schema["properties"])

    def test_schema_required_fields_match_python_contracts(self):
        contracts = (
            (
                SignedTask,
                "signed-task.schema.json",
                {"compact_jws": "compactJws"},
            ),
            (
                RequestEnvelope,
                "request-envelope.schema.json",
                {"allowed_scopes": "allowedMemoryScopes"},
            ),
            (
                Interpretation,
                "interpretation.schema.json",
                {
                    "domain": "primaryDomain",
                    "questions": "clarifyingQuestions",
                },
            ),
            (RiskAssessment, "risk-assessment.schema.json", {}),
            (EvidenceRecord, "evidence-record.schema.json", {"source_url": "url"}),
            (ActionDraft, "action-draft.schema.json", {}),
            (MemoryDraft, "memory-draft.schema.json", {}),
            (ResponsePlan, "response-plan.schema.json", {}),
            (ReviewResult, "review-result.schema.json", {}),
        )

        for model, schema_name, aliases in contracts:
            with self.subTest(model=model.__name__, schema=schema_name):
                model_fields = {
                    aliases.get(item.name, camel_case(item.name)) for item in fields(model)
                }
                schema = json.loads(
                    (ROOT / "schemas" / schema_name).read_text(encoding="utf-8")
                )
                self.assertEqual(model_fields, set(schema["required"]))

    def test_schema_enum_values_match_python_contracts(self):
        contracts = (
            (Audience, "request-envelope.schema.json", "audience"),
            (PrivacyScope, "request-envelope.schema.json", "privacyScope"),
            (PayloadClass, "request-envelope.schema.json", "payloadClass"),
            (
                ProcessingPurpose,
                "request-envelope.schema.json",
                "processingPurpose",
            ),
            (Domain, "interpretation.schema.json", "primaryDomain"),
            (RiskLevel, "risk-assessment.schema.json", "level"),
            (Outcome, "response-plan.schema.json", "outcome"),
            (ReviewStatus, "response-plan.schema.json", "reviewStatus"),
            (ReviewDecision, "review-result.schema.json", "decision"),
            (ActionType, "action-draft.schema.json", "actionType"),
            (Approval, "action-draft.schema.json", "approval"),
            (MemoryTier, "memory-draft.schema.json", "memoryTier"),
        )

        for enum_type, schema_name, property_name in contracts:
            with self.subTest(enum=enum_type.__name__, schema=schema_name):
                schema = json.loads(
                    (ROOT / "schemas" / schema_name).read_text(encoding="utf-8")
                )
                expected_values = {item.value for item in enum_type}
                if enum_type is PrivacyScope:
                    # `local` нужен внутреннему типу роутера, но по контракту
                    # никогда не является допустимым серверным payload.
                    expected_values.remove(PrivacyScope.LOCAL.value)
                self.assertEqual(
                    expected_values,
                    set(schema["properties"][property_name]["enum"]),
                )

    def test_reviewer_check_codes_match_python_contract(self):
        schema = json.loads(
            (ROOT / "schemas" / "review-result.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(
            {item.value for item in ReviewCheck},
            set(schema["properties"]["failedChecks"]["items"]["enum"]),
        )

    def test_reviewer_prompt_names_every_machine_decision(self):
        prompt = (ROOT / "prompts" / "response-reviewer.ru.md").read_text(
            encoding="utf-8"
        )

        for decision in ReviewDecision:
            with self.subTest(decision=decision.value):
                self.assertIn(f"`{decision.value}`", prompt)

    def test_action_argument_variants_are_closed_and_complete(self):
        schema = json.loads(
            (ROOT / "schemas" / "action-draft.schema.json").read_text(encoding="utf-8")
        )
        action_types = set(schema["properties"]["actionType"]["enum"])
        guarded_types = set()

        for definition in schema["$defs"].values():
            self.assertFalse(definition["additionalProperties"])
        for branch in schema["allOf"]:
            guarded_types.add(branch["if"]["properties"]["actionType"]["const"])

        self.assertEqual(guarded_types, action_types)

    def test_prompt_manifest_hashes_match_local_blocks(self):
        manifest = json.loads(
            (ROOT / "prompts" / "manifest.example.json").read_text(encoding="utf-8")
        )
        known_ids = set()

        for block in manifest["blocks"]:
            with self.subTest(block=block["blockId"]):
                self.assertNotIn(block["blockId"], known_ids)
                known_ids.add(block["blockId"])
                path = (ROOT / "prompts" / block["file"]).resolve()
                self.assertEqual(path.parent, (ROOT / "prompts").resolve())
                self.assertTrue(path.is_file())
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                self.assertEqual(digest, block["sha256"])

    def test_eval_cases_have_stable_contract_and_unique_ids(self):
        required = {
            "caseId",
            "module",
            "audience",
            "input",
            "expectedOutcome",
            "mustInclude",
            "mustNot",
            "humanReview",
            "notes",
        }
        known_ids = set()
        case_count = 0

        for path in sorted((ROOT / "evals").glob("*.jsonl")):
            for line_no, line in enumerate(
                path.read_text(encoding="utf-8").splitlines(), start=1
            ):
                if not line.strip():
                    continue
                with self.subTest(path=path.name, line=line_no):
                    case = json.loads(line)
                    self.assertEqual(set(case), required)
                    self.assertNotIn(case["caseId"], known_ids)
                    self.assertTrue(case["mustInclude"])
                    known_ids.add(case["caseId"])
                    case_count += 1

        self.assertGreaterEqual(case_count, 20)

    def test_local_markdown_links_resolve(self):
        link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")

        for path in sorted(ROOT.rglob("*.md")):
            text = path.read_text(encoding="utf-8")
            for raw_target in link_pattern.findall(text):
                target = raw_target.split("#", 1)[0].strip()
                if not target or target.startswith(("http://", "https://", "mailto:")):
                    continue
                with self.subTest(path=path.relative_to(ROOT), target=target):
                    resolved = path.parent / unquote(target)
                    self.assertTrue(resolved.exists(), f"Не найдена ссылка: {resolved}")

    def test_experiment_is_not_wired_into_product_builds(self):
        repo_root = ROOT.parents[1]
        product_files = (
            repo_root / "package.json",
            repo_root / "install.sh",
            repo_root
            / "package"
            / "luci-app-sheepfold-family-internet-control"
            / "Makefile",
            repo_root / "android" / "app" / "build.gradle.kts",
            repo_root / "android-child" / "app" / "build.gradle.kts",
        )

        for path in product_files:
            if not path.exists():
                continue
            with self.subTest(path=path.relative_to(repo_root)):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("experimental/ai-server-core", text)
                self.assertNotIn("sheepfold_ai_core", text)


if __name__ == "__main__":
    unittest.main()
