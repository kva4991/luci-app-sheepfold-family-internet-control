#!/usr/bin/env bash
set -euo pipefail

# Извлекает msgid из _('...') во view-файлах LuCI JS и обновляет po/templates/sheepfold.pot.
# По образцу itdoginfo/podkop (luci-app-podkop/xgettext.sh).
#
# Пока покрывает только модули, переведённые на стандартный _() (см. CODING_RULES.md,
# раздел 8.2). overview.js и его обёртки (overview-secure.js, overview-personal.js)
# всё ещё используют переходный словарь T() и не участвуют в извлечении, пока не
# будут перенесены на _() по одному модулю за раз.

SRC_DIR="htdocs/luci-static/resources/view/sheepfold"
OUT_POT="po/templates/sheepfold.pot"
ENCODING="UTF-8"
WIDTH=120

FILES=(
    "$SRC_DIR/ai.js"
)

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
