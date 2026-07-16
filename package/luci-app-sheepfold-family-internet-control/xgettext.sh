#!/usr/bin/env bash
set -euo pipefail

# Извлекает msgid из _('...') во view-файлах LuCI JS и обновляет po/templates/sheepfold.pot.
# По образцу itdoginfo/podkop (luci-app-podkop/xgettext.sh); см. CODING_RULES.md, раздел 8.2.

VIEW_DIR="htdocs/luci-static/resources/view/sheepfold"
MODULE_DIR="htdocs/luci-static/resources/sheepfold"
OUT_POT="po/templates/sheepfold.pot"
ENCODING="UTF-8"
WIDTH=120

mapfile -d '' FILES < <(
    find "$VIEW_DIR" "$MODULE_DIR" -type f -name '*.js' -print0 | sort -z
)

if [ "${#FILES[@]}" -eq 0 ]; then
    echo "LuCI JS-файлы для извлечения переводов не найдены" >&2
    exit 1
fi

for f in "${FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "Ожидаемый файл не найден: $f" >&2
        exit 1
    fi
done

mkdir -p "$(dirname "$OUT_POT")"

echo "Generating POT template from: ${FILES[*]}"
xgettext --language=JavaScript \
    --keyword=_ \
    --from-code="$ENCODING" \
    --output="$OUT_POT" \
    --width="$WIDTH" \
    --package-name="sheepfold" \
    "${FILES[@]}"

echo "POT template generated: $OUT_POT"
