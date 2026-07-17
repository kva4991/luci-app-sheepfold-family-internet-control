'use strict';
'require baseclass';
'require ui';

/* §frontmod §devmut
 * Редактор владеет только полями одной карточки устройства. Конфликты списков,
 * права администратора, UCI, DHCP и применение firewall проверяет координатор.
 */
function open(deps, device) {
	var knownGroupValues = deps.groups.map(function (item) { return item[0]; });
	var initialGroup = device.adminDevice ? deps.notConfiguredGroup : device.group;
	var groupIsCustom = initialGroup && knownGroupValues.indexOf(initialGroup) === -1;
	var nameField = deps.inputControl(_('Device name'), device.name);
	var ipField = deps.inputControl(_('IP address'), device.ip);
	var groupField = deps.selectControl(_('Group'), groupIsCustom ? '__custom' : initialGroup, deps.groups.concat([
		['__custom', _('Custom')]
	]));
	var customGroupField = deps.inputControl(_('Use custom group'), groupIsCustom ? initialGroup : '');
	var typeField = deps.deviceTypeControl(_('Device type'), deps.displayDeviceType(device));
	var statusField = deps.selectControl(_('Access mode'), device.adminDevice ? 'allow' : device.status, [
		['new', _('Not configured')],
		['allow', _('Allowlist')],
		['blocked', _('Blocklist')],
		['scheduled', _('Scheduled')],
		['restricted', _('Restricted')]
	]);
	var staticLeaseField = deps.checkboxControl(
		device.staticLease ? _('Permanent DHCP lease') : _('Create permanent DHCP lease'),
		device.staticLease,
		device.staticLease ? _('Existing permanent DHCP lease will be updated, not removed.') : '',
		device.staticLease ? { 'disabled': 'disabled' } : null
	);
	/* SHEEPFOLD_AI_BEGIN */
	var activityLogField = deps.checkboxControl(
		_('Enable activity journal for this device'),
		device.activityLogEnabled,
		_('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
	);
	/* SHEEPFOLD_AI_END */
	var errorNode = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

	function updateCustomGroupVisibility() {
		customGroupField.node.hidden = groupField.input.value === '__custom' ? null : 'hidden';
	}

	function save() {
		var group = groupField.input.value === '__custom' ? customGroupField.input.value.trim() : groupField.input.value;
		var payload = {
			name: nameField.input.value.trim() || device.name,
			ip: ipField.input.value.trim(),
			group: group || deps.notConfiguredGroup,
			deviceType: typeField.input.value,
			status: statusField.input.value,
			staticLease: staticLeaseField.input.checked
		};
		var error;

		/* SHEEPFOLD_AI_BEGIN */
		payload.activityLogEnabled = activityLogField.input.checked;
		/* SHEEPFOLD_AI_END */
		errorNode.hidden = true;
		errorNode.textContent = '';
		error = deps.validate(payload);
		if (error) {
			errorNode.textContent = error;
			errorNode.hidden = false;
			return;
		}
		deps.persist(payload);
	}

	groupField.input.addEventListener('change', updateCustomGroupVisibility);
	if (device.adminDevice) {
		// Админская карточка остаётся информативной, но обычная форма не может
		// вернуть устройство в детскую группу или под ограничивающий статус.
		groupField.input.disabled = true;
		customGroupField.input.disabled = true;
		statusField.input.disabled = true;
	}
	updateCustomGroupVisibility();

	ui.showModal(_('Device settings'), [
		E('div', { 'class': 'sf-device-editor' }, [
			E('div', { 'class': 'sf-device-info-lines' }, [
				deps.settingLine(_('ID'), deps.displayId(device)),
				deps.settingLine(_('MAC address'), device.mac),
				deps.settingLine(_('Hostname'), device.hostname || '-'),
				deps.settingLine(_('Detection source'), device.sourceLabel || '-')
			]),
			errorNode,
			E('div', { 'class': 'sf-grid two' }, [
				nameField.node,
				ipField.node,
				typeField.node,
				groupField.node,
				customGroupField.node,
				statusField.node,
				staticLeaseField.node,
				/* SHEEPFOLD_AI_BEGIN */
				activityLogField ? activityLogField.node : ''
				/* SHEEPFOLD_AI_END */
			])
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
			E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save }, _('Save'))
		])
	]);
}

return baseclass.extend({ open: open });
