#!/usr/bin/env bash
set -euo pipefail

# Создаёт или обновляет po/<lang>/sheepfold.po из po/templates/sheepfold.pot.
# По образцу itdoginfo/podkop (luci-app-podkop/msgmerge.sh).
# Английский .po не создаётся: msgid уже написан по-английски и служит фолбэком
# (см. CODING_RULES.md, раздел 8.2).

PODIR="po"
POTFILE="$PODIR/templates/sheepfold.pot"
WIDTH=120

if [ $# -ne 1 ]; then
    echo "Usage: $0 <lang_code> (e.g., ru)"
    exit 1
fi

LANG_CODE="$1"
POFILE="$PODIR/$LANG_CODE/sheepfold.po"

if [ ! -f "$POTFILE" ]; then
    echo "Template $POTFILE not found. Run xgettext.sh first."
    exit 1
fi

if [ -f "$POFILE" ]; then
    echo "Updating $POFILE"
    msgmerge --update --width="$WIDTH" --no-location "$POFILE" "$POTFILE"
else
    echo "Creating new $POFILE using msginit"
    mkdir -p "$PODIR/$LANG_CODE"
    msginit --no-translator --locale="$LANG_CODE" --width="$WIDTH" --input="$POTFILE" --output-file="$POFILE"
fi

echo "Translation file for $LANG_CODE updated."
