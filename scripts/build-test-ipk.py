#!/usr/bin/env python3
import argparse
import io
import os
import shutil
import tarfile
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
PKG_NAME = "luci-app-sheepfold-family-internet-control"
PKG_DIR = ROOT_DIR / "package" / PKG_NAME


def read_make_value(name: str) -> str:
    prefix = f"{name}:="
    for line in (PKG_DIR / "Makefile").read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    raise RuntimeError(f"Cannot find {name} in package Makefile.")


def add_bytes(tar: tarfile.TarFile, name: str, data: bytes, mode: int = 0o644) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(time.time())
    tar.addfile(info, io.BytesIO(data))


def add_directory(tar: tarfile.TarFile, name: str) -> None:
    info = tarfile.TarInfo(name.rstrip("/") + "/")
    info.type = tarfile.DIRTYPE
    info.mode = 0o755
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(time.time())
    tar.addfile(info)


def add_tree(tar: tarfile.TarFile, source: Path, target_prefix: str) -> None:
    executable_paths = {
        "./etc/init.d/sheepfold",
        "./usr/libexec/sheepfold/sheepfold-service",
    }

    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source).as_posix()
        target = f"./{target_prefix.rstrip('/')}/{rel}" if target_prefix else f"./{rel}"
        target = target.replace("//", "/")

        if path.is_dir():
            add_directory(tar, target)
            continue

        mode = 0o755 if target in executable_paths else 0o644
        add_bytes(tar, target, path.read_bytes(), mode)


def write_control_tar(path: Path, version: str, release: str) -> None:
    control = f"""Package: {PKG_NAME}
Version: {version}-{release}
Architecture: all
Maintainer: kva4991
Depends: firewall4, rpcd, uci, uclient-fetch, ca-bundle, jsonfilter
Section: luci
Priority: optional
Installed-Size: 10240
Description: Visual test build of Sheepfold Family Internet Control LuCI app.
""".encode("ascii")

    postinst = f"""#!/bin/sh
[ -n "${{IPKG_INSTROOT}}" ] && exit 0
uci -q set sheepfold.global.ui_asset_version='{version}-{release}'
uci -q commit sheepfold
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
exit 0
""".encode("ascii")

    with tarfile.open(path, "w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_bytes(tar, "./control", control, 0o644)
        add_bytes(tar, "./postinst", postinst, 0o755)


def write_data_tar(path: Path) -> None:
    with tarfile.open(path, "w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_tree(tar, PKG_DIR / "root", "")
        add_tree(tar, PKG_DIR / "htdocs", "www")


def resolve_downloads_dir(value: str | None) -> Path | None:
    if value:
        return Path(value)
    if os.environ.get("USERPROFILE"):
        return Path(os.environ["USERPROFILE"]) / "Downloads"
    if os.environ.get("HOME"):
        return Path(os.environ["HOME"]) / "Downloads"
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default=str(ROOT_DIR / "dist"))
    parser.add_argument("--downloads-dir")
    parser.add_argument("--no-downloads-copy", action="store_true")
    args = parser.parse_args()

    version = read_make_value("PKG_VERSION")
    release = read_make_value("PKG_RELEASE")
    out_dir = Path(args.out_dir)
    build_dir = ROOT_DIR / ".build" / "test-ipk-python"
    ipk = out_dir / f"{PKG_NAME}_{version}-{release}_all.ipk"

    shutil.rmtree(build_dir, ignore_errors=True)
    build_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    debian_binary = build_dir / "debian-binary"
    data_tar = build_dir / "data.tar.gz"
    control_tar = build_dir / "control.tar.gz"

    debian_binary.write_bytes(b"2.0\n")
    write_data_tar(data_tar)
    write_control_tar(control_tar, version, release)

    with tarfile.open(ipk, "w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_bytes(tar, "./debian-binary", debian_binary.read_bytes(), 0o644)
        add_bytes(tar, "./data.tar.gz", data_tar.read_bytes(), 0o644)
        add_bytes(tar, "./control.tar.gz", control_tar.read_bytes(), 0o644)

    print(ipk)

    if not args.no_downloads_copy:
        downloads_dir = resolve_downloads_dir(args.downloads_dir)
        if downloads_dir and downloads_dir.is_dir():
            target = downloads_dir / ipk.name
            shutil.copy2(ipk, target)
            print(target)


if __name__ == "__main__":
    main()
