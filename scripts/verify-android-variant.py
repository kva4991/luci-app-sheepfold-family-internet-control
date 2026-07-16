#!/usr/bin/env python3
"""Проверяет AI-клиент в двух единых Android APK. §prodvar"""

import argparse
import zipfile
from pathlib import Path


TOKENS = {
    "parent": (b"AiAssistantClient", b"/cgi-bin/sheepfold-api/ai-assistant"),
    "child": (b"AiRepository", b"childAiAllowed", b"/cgi-bin/sheepfold-api/ai-assistant"),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("parent", "child"), required=True)
    parser.add_argument("apk", type=Path)
    args = parser.parse_args()

    with zipfile.ZipFile(args.apk) as archive:
        payload = b"\n".join(
            archive.read(name)
            for name in archive.namelist()
            if name.endswith((".dex", ".xml", ".arsc"))
        )

    found = [token.decode("ascii") for token in TOKENS[args.kind] if token in payload]
    if not found:
        raise SystemExit("Unified APK does not contain its server-gated AI implementation")
    print(f"{args.apk}: unified {args.kind} AI client present")


if __name__ == "__main__":
    main()
