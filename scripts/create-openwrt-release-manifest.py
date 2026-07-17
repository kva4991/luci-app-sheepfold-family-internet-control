#!/usr/bin/env python3
"""Объединяет метаданные четырёх SDK-сборок и создаёт SHA256SUMS.

Скрипт запускается только после успешного завершения всей матрицы. Поэтому
неполный релиз не маскируется под готовый набор пакетов. §owrtci1
"""

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_COMBINATIONS = {
    ("sheepfold", "ipk"),
    ("sheepfold", "apk"),
    ("sheepfoldAi", "ipk"),
    ("sheepfoldAi", "apk"),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True, type=Path)
    args = parser.parse_args()

    metadata_files = sorted(args.directory.glob("*.build.json"))
    builds = [json.loads(path.read_text(encoding="utf-8")) for path in metadata_files]
    combinations = {(item["variant"], item["packageFormat"]) for item in builds}
    if combinations != EXPECTED_COMBINATIONS:
        raise RuntimeError(
            f"Incomplete OpenWrt release matrix: expected {sorted(EXPECTED_COMBINATIONS)}, "
            f"got {sorted(combinations)}"
        )

    package_files = sorted(
        path for path in args.directory.iterdir()
        if path.is_file() and path.suffix in {".ipk", ".apk"}
    )
    if len(package_files) != 4:
        raise RuntimeError(f"Expected four OpenWrt packages, found {len(package_files)}")

    metadata_by_artifact = {item["artifact"]: item for item in builds}
    if len(metadata_by_artifact) != 4:
        raise RuntimeError("Build metadata contains duplicate artifact names")

    checksum_lines = []
    for path in package_files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        metadata = metadata_by_artifact.get(path.name)
        if metadata is None:
            raise RuntimeError(f"Package has no build metadata: {path.name}")
        if metadata.get("sha256") != digest or metadata.get("size") != path.stat().st_size:
            raise RuntimeError(f"Package differs from matrix build metadata: {path.name}")
        checksum_lines.append(f"{digest}  {path.name}")
    (args.directory / "SHA256SUMS").write_text(
        "\n".join(checksum_lines) + "\n",
        encoding="ascii",
    )
    (args.directory / "openwrt-build-manifest.json").write_text(
        json.dumps({"schemaVersion": 1, "builds": builds}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
