#!/usr/bin/env python3
"""Compile LuCI .po catalogs into JSON maps for client-side Sheepfold i18n."""

from __future__ import annotations

import json
import ast
import sys
from pathlib import Path


def decode_po_literal(raw: str) -> str:
    """Decode one PO quoted literal without confusing escaped quotes with its end."""
    value = ast.literal_eval(raw)
    if not isinstance(value, str):
        raise ValueError(f'PO literal is not a string: {raw!r}')
    return value


def parse_po_entries(source: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    msgid_parts: list[str] = []
    msgstr_parts: list[str] = []
    active_field: str | None = None
    fuzzy = False

    def flush() -> None:
        nonlocal msgid_parts, msgstr_parts, active_field, fuzzy
        msgid = ''.join(msgid_parts)
        msgstr = ''.join(msgstr_parts)
        if msgid and msgstr:
            if fuzzy:
                pass
            elif msgid in entries and entries[msgid] != msgstr:
                raise ValueError(f'Conflicting translations for exact msgid: {msgid!r}')
            else:
                # Ключи переводов чувствительны к регистру: Clear log и clear log
                # обозначают разные строки интерфейса и обязаны сохраниться обе.
                entries[msgid] = msgstr
        msgid_parts = []
        msgstr_parts = []
        active_field = None
        fuzzy = False

    for source_line in source.splitlines():
        line = source_line.strip()
        if not line:
            flush()
            continue
        if line.startswith('#,') and 'fuzzy' in {flag.strip() for flag in line[2:].split(',')}:
            fuzzy = True
            continue
        if line.startswith('#'):
            continue
        if line.startswith('msgid '):
            if msgid_parts or msgstr_parts:
                flush()
            active_field = 'msgid'
            msgid_parts.append(decode_po_literal(line[6:].strip()))
            continue
        if line.startswith('msgstr '):
            active_field = 'msgstr'
            msgstr_parts.append(decode_po_literal(line[7:].strip()))
            continue
        if line.startswith('msgid_plural ') or line.startswith('msgstr['):
            # Sheepfold client catalog currently uses singular UI messages only.
            active_field = None
            continue
        if line.startswith('"'):
            if active_field == 'msgid':
                msgid_parts.append(decode_po_literal(line))
            elif active_field == 'msgstr':
                msgstr_parts.append(decode_po_literal(line))

    flush()
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
