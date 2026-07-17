#!/usr/bin/env python3
"""Проверяет и собирает один релизный пакет из результата OpenWrt SDK.

SDK сам выбирает внутренний формат IPK/APK. Этот скрипт не перекодирует пакет:
он находит ровно один результат, проверяет метаданные, присваивает понятное имя
редакции и сохраняет рядом машинно-читаемое описание с SHA-256. §owrtci1
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import tarfile
from pathlib import Path

from sheepfold_variants import PACKAGE_DIR, SOURCE_PACKAGE_NAME, VARIANTS, artifact_name


def read_make_value(name: str) -> str:
    prefix = f"{name}:="
    for line in (PACKAGE_DIR / "Makefile").read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    raise RuntimeError(f"Cannot find {name} in package Makefile")


def parse_control_fields(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if not line or line[0].isspace() or ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key] = value.strip()
    return fields


def read_ar_members(data: bytes) -> dict[str, bytes]:
    if not data.startswith(b"!<arch>\n"):
        raise ValueError("not an ar archive")
    members: dict[str, bytes] = {}
    offset = 8
    while offset < len(data):
        header = data[offset:offset + 60]
        if len(header) != 60 or header[58:60] != b"`\n":
            raise ValueError("invalid ar member header")
        name = header[:16].decode("ascii").strip().rstrip("/")
        size = int(header[48:58].decode("ascii").strip())
        start = offset + 60
        members[name] = data[start:start + size]
        offset = start + size + (size % 2)
    return members


def read_outer_ipk_members(path: Path) -> dict[str, bytes]:
    data = path.read_bytes()
    if data.startswith(b"!<arch>\n"):
        return read_ar_members(data)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        return {
            member.name.removeprefix("./"): archive.extractfile(member).read()
            for member in archive.getmembers()
            if member.isfile()
        }


def validate_ipk(path: Path, expected_version: str, expected_release: str) -> dict[str, str]:
    members = read_outer_ipk_members(path)
    control_name = next(
        (name for name in members if name.startswith("control.tar")),
        None,
    )
    if control_name is None:
        raise ValueError("IPK has no control archive")
    with tarfile.open(fileobj=io.BytesIO(members[control_name]), mode="r:*") as control_tar:
        control_member = next(
            (member for member in control_tar.getmembers() if member.name.removeprefix("./") == "control"),
            None,
        )
        if control_member is None:
            raise ValueError("IPK control archive has no control file")
        fields = parse_control_fields(control_tar.extractfile(control_member).read().decode("utf-8"))

    if fields.get("Package") != SOURCE_PACKAGE_NAME:
        raise ValueError(f"Unexpected IPK package name: {fields.get('Package')}")
    version = fields.get("Version", "")
    if expected_version not in version or expected_release not in version:
        raise ValueError(f"Unexpected IPK version: {version}")
    if fields.get("Architecture") not in {"all", "noarch"}:
        raise ValueError(f"Unexpected IPK architecture: {fields.get('Architecture')}")
    return {
        "name": fields["Package"],
        "version": version,
        "arch": fields["Architecture"],
    }


def validate_apk_metadata(path: Path, expected_version: str, expected_release: str) -> dict[str, str]:
    metadata = json.loads(path.read_text(encoding="utf-8"))
    info = metadata.get("info", {})
    if info.get("name") != SOURCE_PACKAGE_NAME:
        raise ValueError(f"Unexpected APK package name: {info.get('name')}")
    version = str(info.get("version", ""))
    if expected_version not in version or expected_release not in version:
        raise ValueError(f"Unexpected APK version: {version}")
    arch = str(info.get("arch", ""))
    if arch not in {"all", "noarch"}:
        raise ValueError(f"Unexpected APK architecture: {arch}")
    return {"name": info["name"], "version": version, "arch": arch}


def find_package(search_root: Path, package_format: str) -> Path:
    suffix = f".{package_format}"
    candidates = sorted(
        path for path in search_root.rglob(f"*{suffix}")
        if path.name.startswith(SOURCE_PACKAGE_NAME)
    )
    if len(candidates) != 1:
        rendered = ", ".join(str(path) for path in candidates) or "none"
        raise RuntimeError(f"Expected exactly one {suffix} package, found: {rendered}")
    if candidates[0].stat().st_size < 1024:
        raise RuntimeError(f"Package is implausibly small: {candidates[0]}")
    return candidates[0]


def release_filename(source: Path, variant: str) -> str:
    source_prefix = SOURCE_PACKAGE_NAME
    if not source.name.startswith(source_prefix):
        raise ValueError(f"Unexpected package filename: {source.name}")
    return artifact_name(variant) + source.name[len(source_prefix):]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--search-root", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--variant", required=True, choices=sorted(VARIANTS))
    parser.add_argument("--format", required=True, choices=("ipk", "apk"), dest="package_format")
    parser.add_argument("--openwrt-version", required=True)
    parser.add_argument("--sdk-arch", required=True)
    parser.add_argument("--apk-metadata", type=Path)
    args = parser.parse_args()

    version = read_make_value("PKG_VERSION")
    release = read_make_value("PKG_RELEASE")
    source = find_package(args.search_root, args.package_format)
    if args.package_format == "ipk":
        package_info = validate_ipk(source, version, release)
    else:
        if args.apk_metadata is None or not args.apk_metadata.is_file():
            raise RuntimeError("APK metadata from the SDK apk tool is required")
        package_info = validate_apk_metadata(args.apk_metadata, version, release)

    # Имя SDK-файла тоже проверяем: это ловит случай, когда в output остался пакет
    # от прежнего запуска с корректными внутренними метаданными, но другой версией.
    version_pattern = re.compile(
        rf"{re.escape(version)}(?:[-_.]?r?{re.escape(release)})(?:[-_.]|$)"
    )
    if not version_pattern.search(source.name):
        raise ValueError(f"SDK filename does not contain release {version}-{release}: {source.name}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    destination = args.out_dir / release_filename(source, args.variant)
    shutil.copy2(source, destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    metadata = {
        "artifact": destination.name,
        "sha256": digest,
        "size": destination.stat().st_size,
        "variant": args.variant,
        "internalPackage": package_info["name"],
        "packageVersion": package_info["version"],
        "packageArch": package_info["arch"],
        "packageFormat": args.package_format,
        "openWrtVersion": args.openwrt_version,
        "sdkArch": args.sdk_arch,
    }
    destination.with_suffix(destination.suffix + ".build.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(destination)


if __name__ == "__main__":
    main()
