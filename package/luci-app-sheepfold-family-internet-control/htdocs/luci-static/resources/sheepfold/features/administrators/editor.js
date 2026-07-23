'use strict';
'require baseclass';
'require ui';

/* §frontmod §pairsec §persist1 §ovaudit3
 * Modal fields are presentation-only. Duplicate top/bottom Save controls share one
 * local guard, so a fast double click cannot create or bind an administrator twice.
 */
function errorNote() {
	var node = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });
	return {
		node: node,
		show: function (message) { node.textContent = message; node.hidden = false; },
		clear: function () { node.textContent = ''; node.hidden = true; }
	};
}

function saveState() {
	return {
		saving: false,
		buttons: [],
		setSaving: function (value) {
			this.saving = !!value;
			this.buttons.forEach(function (button) {
				button.disabled = !!value;
				button.setAttribute('aria-busy', value ? 'true' : 'false');
			});
		}
	};
}

function modalActions(onSave, state, label) {
	var button = E('button', {
		'class': 'btn cbi-button cbi-button-positive',
		'click': function (event) {
			var result;
			event.preventDefault();
			if (state.saving)
				return;
			try { result = onSave(event.currentTarget); } catch (error) { result = Promise.reject(error); }
			if (!result || typeof result.then !== 'function')
				return;
			state.setSaving(true);
			Promise.resolve(result).catch(function () { return null; }).finally(function () { state.setSaving(false); });
		}
	}, label || _('Save'));
	state.buttons.push(button);
	return E('div', { 'class': 'right sf-modal-actions' }, [
		E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
		button
	]);
}

function openAdd(deps, onSave) {
	var nameField = deps.inputControl(_('Admin name'), '');
	var loginField = deps.inputControl(_('Login'), '', { 'autocomplete': 'username' });
	var selector = deps.createDeviceSelector();
	var error = errorNote();
	var state = saveState();

	function save(button) {
		var name = nameField.input.value.trim();
		var login = loginField.input.value.trim();
		error.clear();
		if (!name || !login) { error.show(_('Name and login are required.')); return null; }
		if (!deps.validateLogin(login)) {
			error.show(_('Login may contain only Latin letters, digits, and . _ - @ + symbols.'));
			return null;
		}
		if (deps.loginExists(login)) { error.show(_('This login is already used.')); return null; }
		return onSave({
			name: name,
			login: login,
			selectedDevices: selector.selectedDevices(),
			selectedIds: selector.selectedIds()
		}, button);
	}

	ui.showModal(_('Add administrator'), [
		E('div', { 'class': 'sf-device-editor' }, [
			error.node,
			E('div', { 'class': 'sf-grid two' }, [nameField.node, loginField.node]),
			modalActions(save, state),
			E('strong', {}, _('Assigned devices')),
			selector.node
		]),
		modalActions(save, state)
	]);
}

function openBinding(deps, admin, onSave) {
	var selector = deps.createDeviceSelector(admin.deviceIds || []);
	var state = saveState();
	function save(button) {
		return onSave({ selectedDevices: selector.selectedDevices(), selectedIds: selector.selectedIds() }, button);
	}
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
			modalActions(save, state),
			selector.node
		]),
		modalActions(save, state)
	]);
}

function openSettings(deps, admin, pairing, callbacks) {
	var accessRequests = deps.checkboxControl(
		_('May child devices send this administrator requests for 30 more minutes of internet?'),
		!!admin.allowChildAccessRequests,
		_('Disabled by default. A request only notifies the parent and never grants internet automatically.')
	);
	var state = saveState();
	function save(button) {
		return callbacks.save({ allowChildAccessRequests: accessRequests.input.checked }, button);
	}
	var actions = E('div', { 'class': 'right sf-modal-actions' }, [
		E('button', { 'class': 'btn cbi-button', 'click': callbacks.close }, _('Close')),
		(function () {
			var button = E('button', {
				'class': 'btn cbi-button cbi-button-positive',
				'click': function (event) {
					var result;
					event.preventDefault();
					if (state.saving) return;
					try { result = save(event.currentTarget); } catch (error) { result = Promise.reject(error); }
					state.setSaving(true);
					Promise.resolve(result).catch(function () { return null; }).finally(function () { state.setSaving(false); });
				}
			}, _('Save'));
			state.buttons.push(button);
			return button;
		})()
	]);
	ui.showModal(_('Administrator settings'), [
		E('div', { 'class': 'sf-modal-pairing' }, [
			E('div', { 'class': 'sf-qr-wrap' }, [pairing.qrNode, E('p', {}, _('Scan this QR code in the Android app for quick setup.'))]),
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
		actions
	]);
}

return baseclass.extend({ openAdd: openAdd, openBinding: openBinding, openSettings: openSettings });
