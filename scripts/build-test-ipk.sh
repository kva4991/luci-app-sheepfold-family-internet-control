#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PYTHON="${PYTHON:-}"

if [ -z "$PYTHON" ]; then
        if command -v python3 >/dev/null 2>&1; then
                PYTHON=python3
        elif command -v python >/dev/null 2>&1; then
                PYTHON=python
        else
                echo "Python 3 is required to build Sheepfold test IPKs." >&2
                exit 1
        fi
fi

# Единый Python-сборщик сохраняет одинаковую структуру IPK и правила вариантов
# на Windows, Linux и в CI; отдельная shell-копия postinst быстро рассинхронизируется.
exec "$PYTHON" "$ROOT_DIR/scripts/build-test-ipk.py" "$@"
