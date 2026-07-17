#!/usr/bin/env python3
"""Готовит один вариант Sheepfold как локальный feed официального OpenWrt SDK.

Скрипт отделён от workflow намеренно: ту же подготовку можно проверить локально,
а YAML остаётся оркестратором и не содержит скрытой продуктовой логики. §owrtci1
"""

import argparse
from pathlib import Path

from sheepfold_variants import VARIANTS, prepare_sdk_feed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", required=True, choices=sorted(VARIANTS))
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    package_dir = prepare_sdk_feed(args.variant, args.out_dir)
    print(package_dir)


if __name__ == "__main__":
    main()
