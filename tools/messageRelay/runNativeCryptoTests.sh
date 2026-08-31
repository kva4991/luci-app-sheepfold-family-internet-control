#!/bin/sh
# Назначение: вручную собрать C helper и проверить SFMR1 против Node без сети и UCI
# Создаёт только .build/relay-crypto; sanitizer gate не доказывает target ABI или router runtime
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
case "${1:-}" in
    '') sanitize=0 ;;
    --sanitize) sanitize=1 ;;
    *) printf '%s\n' 'Usage: sh tools/messageRelay/runNativeCryptoTests.sh [--sanitize]' >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || exit 2
command -v "${CC:-cc}" >/dev/null
command -v node >/dev/null
mkdir -p .build/relay-crypto
binary="$root/.build/relay-crypto/relay-crypto"
set -- -std=c11 -O2 -Wall -Wextra -Werror -D_FORTIFY_SOURCE=2 -fstack-protector-strong
if [ "$sanitize" = 1 ]; then
    binary="$binary-sanitized"
    set -- "$@" -g -fsanitize=address,undefined -fno-omit-frame-pointer
    # Helper обслуживает один stdin и завершает процесс на malformed request; leak report для этого пути не является daemon-leak тестом
    export ASAN_OPTIONS=detect_leaks=0:abort_on_error=1
    export UBSAN_OPTIONS=halt_on_error=1
fi
"${CC:-cc}" "$@" -o "$binary" \
    package/sheepfold-message-relay-crypto/src/sheepfold-message-relay-crypto.c \
    package/sheepfold-message-relay-crypto/src/relayJson.c \
    -Wl,-z,now -Wl,-z,relro -lcrypto -ljansson -lm
SHEEPFOLD_RELAY_CRYPTO="$binary" node --test tools/messageRelay/nativeCrypto.test.mjs
