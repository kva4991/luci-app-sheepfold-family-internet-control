#!/usr/bin/env python3
"""Compile LuCI .po catalogs into binary .lmo files (OpenWrt po2lmo compatible)."""

from __future__ import annotations

import sys
from pathlib import Path


class u32_t(int):
    def __rshift__(self, other):
        return u32_t(int.__rshift__(self, other) & 0xFFFFFFFF)

    def __lshift__(self, other):
        return u32_t(int.__lshift__(self, other) & 0xFFFFFFFF)

    def __add__(self, other):
        return u32_t(int.__add__(self, other) & 0xFFFFFFFF)

    def __xor__(self, other):
        return u32_t(int.__xor__(self, other) & 0xFFFFFFFF)


def sfh_int8(data, offset=0):
    return int.from_bytes(data[offset:offset + 1], byteorder='little', signed=True)


def sfh_uint16(data, offset=0):
    return int.from_bytes(data[offset:offset + 2], byteorder='little')


def sfh_hash(data):
    if data is None:
        return 0
    if isinstance(data, str):
        data = data.encode('utf-8')
    size = len(data)
    if size <= 0:
        return 0
    hash_value = u32_t(size)
    rem = size & 3
    length = size // 4
    for i in range(length):
        hash_value += sfh_uint16(data, i * 4)
        tmp = sfh_uint16(data, i * 4 + 2) << 11
        tmp ^= hash_value
        hash_value = (hash_value << 16) ^ tmp
        hash_value += hash_value >> 11
    i = length * 4
    if rem == 3:
        hash_value += sfh_uint16(data, i)
        hash_value ^= hash_value << 16
        hash_value ^= sfh_int8(data, i + 2) << 18
        hash_value += hash_value >> 11
    if rem == 2:
        hash_value += sfh_uint16(data, i)
        hash_value ^= hash_value << 11
        hash_value += hash_value >> 17
    if rem == 1:
        hash_value += sfh_int8(data, i)
        hash_value ^= hash_value << 10
        hash_value += hash_value >> 1
    hash_value ^= hash_value << 3
    hash_value += hash_value >> 5
    hash_value ^= hash_value << 4
    hash_value += hash_value >> 17
    hash_value ^= hash_value << 25
    hash_value += hash_value >> 6
    return hash_value & 0xFFFFFFFF


MSG_UNSPEC = 0
MSG_CTXT = 1
MSG_ID = 2
MSG_ID_PLURAL = 3
MSG_STR = 4


class Msg:
    def __init__(self):
        self.init()

    def init(self, plural_num=0):
        self.plural_num = plural_num
        self.ctxt = None
        self.id = None
        self.id_plural = None
        self.val = [None] * 10
        self.cur = MSG_UNSPEC
        self.key = None


class LmoEntry:
    def __init__(self, key_id=0, plural=0, offset=0, length=0, val=None):
        self.key_id = key_id
        self.plural = plural
        self.offset = offset
        self.length = length
        self.val = val
        self.dup = 0


class Lmo:
    def __init__(self):
        self.entries = []
        self.msg = Msg()

    def add_entry(self, key_id, plural, val):
        entry = LmoEntry(key_id=key_id, plural=plural, offset=len(self.entries), length=len(val), val=val)
        existing = next((item for item in self.entries if item.key_id == key_id), None)
        if existing:
            entry.dup = 1
            existing.dup = 1
        self.entries.append(entry)
        return entry

    def print_msg(self):
        msg = self.msg
        if not msg.id and not msg.val[0]:
            return
        if not msg.val[0]:
            self.msg.init()
            return
        if msg.key is not None:
            self.add_entry(msg.key, 0, msg.val[0])
        elif msg.id and msg.plural_num >= 0:
            for i, val in enumerate(msg.val):
                if val is None:
                    continue
                if msg.ctxt and msg.id_plural:
                    key = f'{msg.ctxt}\1{msg.id}\2{i}'
                elif msg.ctxt:
                    key = f'{msg.ctxt}\1{msg.id}'
                elif msg.id_plural:
                    key = f'{msg.id}\2{i}'
                else:
                    key = msg.id
                key_id = sfh_hash(key)
                val_id = sfh_hash(val)
                if key_id != val_id:
                    self.add_entry(key_id, msg.plural_num, val)
        else:
            val = msg.val[0]
            prefix = b'\\nPlural-Forms: '
            x = val.find(prefix)
            if x > 0:
                x += len(prefix)
                x2 = val.find(b'\\n', x)
                if x2 > 0:
                    self.add_entry(0, -1, val[x:x2])
        self.msg.init()

    def extract_string(self, line):
        if line.startswith('#'):
            return None
        x = line.find('"')
        if x < 0:
            return None
        line = line[x + 1:]
        line = line.replace(r'\\', '\x02')
        line = line.replace(r'\"', '\x01')
        x = line.find('"')
        if x >= 0:
            line = line[:x]
        line = line.replace('\x01', '"')
        line = line.replace('\x02', '\\')
        return line

    def process_line(self, line):
        msg = self.msg
        if line.startswith('msgctxt "'):
            self.print_msg()
            msg.ctxt = ''
            msg.cur = MSG_CTXT
        elif line.startswith('msgid "'):
            self.print_msg()
            msg.id = ''
            msg.cur = MSG_ID
        elif line.startswith('msgid_plural "'):
            msg.id_plural = ''
            msg.cur = MSG_ID_PLURAL
        elif line.startswith('msgstr "') or line.startswith('msgstr['):
            msg.plural_num = 0
            if line.startswith('msgstr['):
                x1 = line.find('[')
                x2 = line.find(']')
                msg.plural_num = int(line[x1 + 1:x2])
            if msg.plural_num >= 10:
                raise RuntimeError('Too many plural forms')
            msg.val[msg.plural_num] = b''
            msg.cur = MSG_STR
        if msg.cur != MSG_UNSPEC:
            tmp = self.extract_string(line)
            if tmp:
                if msg.cur == MSG_CTXT:
                    msg.ctxt += tmp
                if msg.cur == MSG_ID:
                    msg.id += tmp
                if msg.cur == MSG_ID_PLURAL:
                    msg.id_plural += tmp
                if msg.cur == MSG_STR:
                    msg.val[msg.plural_num] += tmp.encode('utf-8')

    def load_from_text(self, filename):
        self.entries = []
        self.msg.init(-1)
        with open(filename, 'r', encoding='utf-8') as file:
            for line in file:
                self.process_line(line.rstrip())
            self.print_msg()

    def save_to_bin(self):
        buf = bytearray(b'\x00' * 0x400000)
        offset = 0
        entries = []
        for ent in self.entries:
            val = ent.val.encode('utf-8') if isinstance(ent.val, str) else ent.val
            length = len(val)
            buf[offset:offset + length] = val
            entries.append(LmoEntry(ent.key_id, ent.plural, offset, length, val))
            offset += length
            if offset & 3 != 0:
                offset += 4 - (offset & 3)
        entries = sorted(entries, key=lambda item: item.key_id)
        table_offset = offset
        for ent in entries:
            buf[offset:offset + 4] = ent.key_id.to_bytes(4, byteorder='big')
            buf[offset + 4:offset + 8] = (ent.plural + 1).to_bytes(4, byteorder='big')
            buf[offset + 8:offset + 12] = ent.offset.to_bytes(4, byteorder='big')
            buf[offset + 12:offset + 16] = ent.length.to_bytes(4, byteorder='big')
            offset += 16
        if offset > 0:
            buf[offset:offset + 4] = table_offset.to_bytes(4, byteorder='big')
            offset += 4
        return bytes(buf[:offset])


def compile_po(po_path: Path) -> bytes:
    lmo = Lmo()
    lmo.load_from_text(po_path)
    return lmo.save_to_bin()


def main() -> None:
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} input.po output.lmo', file=sys.stderr)
        sys.exit(1)
    data = compile_po(Path(sys.argv[1]))
    Path(sys.argv[2]).write_bytes(data)
    print(sys.argv[2])


if __name__ == '__main__':
    main()