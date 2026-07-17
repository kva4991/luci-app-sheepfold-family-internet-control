'use strict';
'require baseclass';
'require ui';

/* §frontmod §pairsec
 * Этот модуль отвечает только за поля и локальное состояние модальных окон.
 * Одноразовый пароль, QR payload, UCI и права устройств создаёт и применяет
 * координатор: визуальный слой не должен уметь самостоятельно выдать админский доступ.
 */
function errorNote() {
	var node = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

	return {
		node: node,
		show: function (message) {
			node.textContent = message;
			node.hidden = false;
		},
		clear: function () {
			node.textContent = '';
			node.hidden = true;
		}
	};
}

function modalActions(onSave) {
	return E('div', { 'class': 'right sf-modal-actions' }, [
		E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
		E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': onSave }, _('Save'))
	]);
}

function openAdd(deps, onSave) {
	var nameField = deps.inputControl(_('Admin name'), '');
	var loginField = deps.inputControl(_('Login'), '', { 'autocomplete': 'username' });
	var selector = deps.createDeviceSelector();
	var error = errorNote();

	function save() {
		var name = nameField.input.value.trim();
		var login = loginField.input.value.trim();

		error.clear();
		if (!name || !login) {
			error.show(_('Name and login are required.'));
			return;
		}
		if (deps.loginExists(login)) {
			error.show(_('This login is already used.'));
			return;
		}

		onSave({
			name: name,
			login: login,
			selectedDevices: selector.selectedDevices(),
			selectedIds: selector.selectedIds()
		});
	}

	ui.showModal(_('Add administrator'), [
		E('div', { 'class': 'sf-device-editor' }, [
			error.node,
			E('div', { 'class': 'sf-grid two' }, [nameField.node, loginField.node]),
			modalActions(save),
			E('strong', {}, _('Assigned devices')),
			selector.node
		]),
		modalActions(save)
	]);
}

function openBinding(deps, admin, onSave) {
	var selector = deps.createDeviceSelector(admin.deviceIds || []);
	var save = function () {
		onSave({
			selectedDevices: selector.selectedDevices(),
			selectedIds: selector.selectedIds()
		});
	};

	ui.showModal(_('Assign devices to administrator') + ' ' + admin.name, [
		E('div', { 'class': 'sf-binding-modal' }, [
			E('div', { 'class': 'sf-section-intro' }, [
				E('p', {}, _('Select administrator devices') + ' ' + admin.name + '. ' + _('Selected administrator devices can manage Sheepfold.')),
				E('p', {}, _('Blocklisted devices are not available for binding.')),
				/* SHEEPFOLD_AI_BEGIN */
				E('p', {}, _('When a device is assigned to an administrator, Sheepfold removes it from ordinary groups and schedules, disables activity logging for it, and adds it to the allowlist.')),
				/* SHEEPFOLD_AI_END */
				E('p', {}, _('Administrator devices are removed from ordinary groups and schedules and added to the allowlist.'))
			]),
			modalActions(save),
			selector.node
		]),
		modalActions(save)
	]);
}

function openSettings(deps, admin, pairing, callbacks) {
	var accessRequests = deps.checkboxControl(
		_('May child devices send this administrator requests for 30 more minutes of internet?'),
		!!admin.allowChildAccessRequests,
		_('Disabled by default. A request only notifies the parent and never grants internet automatically.')
	);

	function close() {
		callbacks.close();
	}

	function save() {
		callbacks.save({ allowChildAccessRequests: accessRequests.input.checked });
	}

	ui.showModal(_('Administrator settings'), [
		E('div', { 'class': 'sf-modal-pairing' }, [
			E('div', { 'class': 'sf-qr-wrap' }, [
				pairing.qrNode,
				E('p', {}, _('Scan this QR code in the Android app for quick setup.'))
			]),
			E('div', { 'class': 'sf-manual-settings' }, [
				deps.inputControl(_('Admin name'), admin.name, { 'readonly': 'readonly' }).node,
				deps.inputControl(_('Login'), admin.login, { 'readonly': 'readonly' }).node,
				deps.passwordRevealField(_('Temporary password'), pairing.temporaryPassword),
				deps.settingLine(_('Sheepfold API URL'), pairing.apiUrl),
				deps.settingLine(_('Server IP address'), pairing.routerAddress),
				deps.settingLine(_('Port'), pairing.port),
				accessRequests.node
			])
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': close }, _('Close')),
			E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save }, _('Save'))
		])
	]);
}

return baseclass.extend({
	openAdd: openAdd,
	openBinding: openBinding,
	openSettings: openSettings
});
