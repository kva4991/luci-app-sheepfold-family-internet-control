'use strict';
'require view.sheepfold.overview as overview';

/*
 * Совместимая обёртка над основным экраном overview.
 *
 * Настройки ИИ раньше находились в общей секции. Теперь ими управляет отдельный
 * экран sheepfold/ai: там находятся включение, квоты, согласие для детского
 * режима и проверка OpenSSL. Два редактора создавали бы конкурирующие пути
 * сохранения и показывали устаревшие значения моделей.
 */
var renderSettingsGeneral = overview.renderSettingsGeneral;

overview.renderSettingsGeneral = function() {
	var node = renderSettingsGeneral.apply(this, arguments);
	var children = Array.prototype.slice.call(node.children || []);

	/*
	 * Порядок элементов legacy-секции:
	 * 0 — язык, 1 — порт, 2 — политика новых устройств,
	 * 3 — автонастройка, 4 — обновления, 5–9 — старые поля ИИ.
	 * После полного удаления legacy-полей из overview этот блок нужно удалить.
	 */
	children.slice(5, 10).forEach(function(child) {
		child.remove();
	});

	return node;
};

return overview;
