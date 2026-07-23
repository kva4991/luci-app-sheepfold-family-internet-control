'use strict';
'require baseclass';

/* §frontmod §ovfinal1 §cfgbak1
 * Контроллер резервных копий связывает построение снимка, транзакционный импорт
 * и панель файлов/диалогов. В общем черновике Settings он не участвует.
 */
function create(deps) {
	function sectionsByConfig() {
		return {
			sheepfold: deps.sections('sheepfold'),
			dhcp: deps.sections('dhcp', 'host'),
			wireless: deps.sections('wireless').filter(function (section) {
				return section['.type'] === 'wifi-device' || section['.type'] === 'wifi-iface';
			})
		};
	}

	function payload(includeSecrets) {
		return deps.model.build(sectionsByConfig(), includeSecrets, new Date().toISOString());
	}

	function apply(imported) {
		return deps.persistence.apply(imported, payload(true));
	}

	var panel = deps.panel.create({
		payload: payload,
		apply: apply,
		exportMode: deps.exportMode,
		resetDraft: deps.resetDraft,
		notify: deps.notify,
		notifyCentered: deps.notifyCentered
	});

	return {
		sectionsByConfig: sectionsByConfig,
		payload: payload,
		apply: apply,
		panel: function () { return panel; }
	};
}

return baseclass.extend({ create: create });
