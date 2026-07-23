'use strict';
'require baseclass';
'require sheepfold.features.wifi.cards as wifiCards';

/* §frontmod §wifitgl1 §ovaudit3
 * The editor owns only local card state. Staging is supplied as a callback to the
 * persistence adapter, so synchronous staging failures cannot leave LuCI dirty or
 * keep Save controls permanently disabled.
 */
function savePlan(editors) {
	var radiosToEnable = {};
	var items = (editors || []).map(function (editor) {
		var snapshot = wifiCards.editorSnapshot(editor);
		if (editor.device && editor.radioDisabled && snapshot.enabled)
			radiosToEnable[editor.device] = true;
		return { editor: editor, snapshot: snapshot };
	});
	return {
		items: items,
		radiosToEnable: radiosToEnable,
		turnsWifiOff: items.some(function (item) {
			return item.editor.original.enabled && !item.snapshot.enabled;
		})
	};
}

function create(deps) {
	var editors = [];
	var saving = false;

	function isDirty() { return editors.some(function (editor) { return wifiCards.editorIsDirty(editor); }); }
	function updateSaveButtons() {
		var dirty = isDirty();
		document.querySelectorAll('[data-wifi-save]').forEach(function (button) {
			button.disabled = saving || !dirty ? true : null;
			button.classList.toggle('sf-action-muted', !dirty);
		});
	}
	function clear() { editors = []; }
	function register(editor) {
		editors.push(editor);
		[[editor.ssidInput, 'input'], [editor.passwordInput, 'input'], [editor.securitySelect, 'change'],
		 [editor.channelSelect, 'change'], [editor.enabledInput, 'change']].forEach(function (binding) {
			binding[0].addEventListener(binding[1], updateSaveButtons);
		});
	}

	function stageItem(item, radiosToEnable) {
		var editor = item.editor;
		var snapshot = item.snapshot;
		if (!editor.sectionName)
			return;
		deps.setOption(editor.sectionName, 'ssid', snapshot.ssid);
		deps.setOption(editor.sectionName, 'encryption', snapshot.encryption);
		if (snapshot.enabled !== editor.original.enabled || radiosToEnable[editor.device]) {
			if (snapshot.enabled)
				deps.unsetOption(editor.sectionName, 'disabled');
			else
				deps.setOption(editor.sectionName, 'disabled', '1');
		}
		if (snapshot.encryption === 'none')
			deps.unsetOption(editor.sectionName, 'key');
		else
			deps.setOption(editor.sectionName, 'key', snapshot.password);
		if (editor.device)
			deps.setOption(editor.device, 'channel', snapshot.channel || 'auto');
	}

	function stagePlan(plan) {
		plan.items.forEach(function (item) { stageItem(item, plan.radiosToEnable); });
		Object.keys(plan.radiosToEnable).forEach(function (device) { deps.unsetOption(device, 'disabled'); });
		return plan;
	}

	function acceptPlan(plan) {
		plan.items.forEach(function (item) {
			item.editor.original = wifiCards.editorSnapshot(item.editor);
			if (item.editor.device && plan.radiosToEnable[item.editor.device])
				item.editor.radioDisabled = false;
		});
	}

	function save() {
		var plan;
		if (saving || !editors.length)
			return Promise.resolve();
		plan = savePlan(editors);
		if (plan.turnsWifiOff && !deps.confirm(_('One or more Wi-Fi networks will be turned off. The current wireless connection may be lost. Continue?')))
			return Promise.resolve();
		saving = true;
		updateSaveButtons();
		return Promise.resolve().then(function () {
			return deps.persist(function () { return stagePlan(plan); });
		}).then(function () {
			acceptPlan(plan);
			deps.notify(_('Wi-Fi settings saved.'), 'info');
		}, function (error) {
			if (error && error.persisted) {
				acceptPlan(plan);
				deps.notify(_('Wi-Fi settings were saved, but Wi-Fi could not be reloaded.') + ' ' + deps.errorText(error, ''), 'warning');
			} else {
				deps.notify(_('Could not save Wi-Fi settings.') + ' ' + deps.errorText(error, ''), 'warning');
			}
			throw error;
		}).finally(function () {
			saving = false;
			updateSaveButtons();
		});
	}

	function saveBar() {
		return E('div', { 'class': 'sf-wifi-save-bar' }, [
			E('button', {
				'class': 'sf-action sf-action-positive sf-action-nowrap sf-action-muted',
				'data-wifi-save': '1',
				'disabled': 'disabled',
				'click': function (event) { event.preventDefault(); save().catch(function () { return null; }); }
			}, _('Save'))
		]);
	}

	return { clear: clear, register: register, isDirty: isDirty, save: save, saveBar: saveBar };
}

return baseclass.extend({ savePlan: savePlan, create: create });
