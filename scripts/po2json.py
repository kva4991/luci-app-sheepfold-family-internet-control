#!/usr/bin/env python3
"""Compile LuCI .po catalogs into JSON maps for client-side Sheepfold i18n."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def decode_po_string(raw: str) -> str:
    return (
        ''.join(
            line.strip()[1:-1]
            for line in raw.split('\n')
            if line.strip().startswith('"')
        )
        .replace('\\n', '\n')
        .replace('\\"', '"')
        .replace('\\\\', '\\')
    )


def parse_po_entries(source: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    for block in re.split(r'\n\n+', source):
        msgid_match = re.search(
            r'^msgid\s+((?:"[^"]*"|""(?:\n"[^"]*")*)+)',
            block,
            re.MULTILINE,
        )
        msgstr_match = re.search(
            r'^msgstr\s+((?:"[^"]*"|""(?:\n"[^"]*")*)+)',
            block,
            re.MULTILINE,
        )
        if not msgid_match or not msgstr_match:
            continue
        msgid = decode_po_string(msgid_match.group(1))
        msgstr = decode_po_string(msgstr_match.group(1))
        if msgid and msgstr:
            entries[msgid] = msgstr
    return entries


def compile_po(po_path: Path) -> dict[str, str]:
    return parse_po_entries(po_path.read_text(encoding='utf-8'))


def main() -> None:
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} input.po output.json', file=sys.stderr)
        sys.exit(1)
    data = compile_po(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(
        json.dumps(data, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    print(sys.argv[2])


if __name__ == '__main__':
    main()