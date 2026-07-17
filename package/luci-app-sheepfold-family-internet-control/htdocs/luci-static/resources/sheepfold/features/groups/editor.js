'use strict';
'require baseclass';
'require ui';

/* §frontmod
 * Модальные окна групп владеют только своими полями и валидацией. Изменение
 * UCI, членства устройств и runtime-правил выполняет переданный координатором
 * callback: визуальный слой не должен самостоятельно менять интернет-доступ.
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

function openSettings(deps, groupName, section, onSave) {
	var nameField = deps.inputControl(_('Group name'), groupName, section && section.protected === '1' ? { 'readonly': 'readonly' } : {});
	var colorField = deps.inputControl(_('Group color'), deps.groupColor(groupName, section), { 'type': 'color' });
	var deviceSelector = deps.createDeviceSelector({ selectedIds: deps.currentDeviceIds(groupName) });
	var scheduleSelector = deps.scheduleCheckboxes(deps.listValues(section && section.schedules));
	var allowlistOnlyField = deps.checkboxControl(
		_('Allow only selected whitelist sources for this group'),
		section && section.allowlist_only === '1',
		_('Devices in this group will be limited to domains from the selected whitelist sources and manually allowed emergency-useful sites.')
	);
	/* SHEEPFOLD_AI_BEGIN */
	var activityLogField = deps.checkboxControl(
		_('Enable activity journal for all devices in this group'),
		section && section.activity_log_enabled === '1',
		_('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
	);
	/* SHEEPFOLD_AI_END */
	var error = errorNote();

	function save() {
		var newName = deps.normalize(nameField.input.value.trim());
		var color = colorField.input.value;
		var payload;

		error.clear();
		if (!newName) {
			error.show(_('Group name is required.'));
			return;
		}
		if (deps.nameExists(newName, groupName)) {
			error.show(_('This group already exists.'));
			return;
		}
		if (!deps.validColor(color))
			color = deps.automaticColor(newName);

		payload = {
			oldName: groupName,
			newName: newName,
			color: color,
			selectedDevices: deviceSelector.selectedDevices(),
			selectedSchedules: scheduleSelector.values(),
			allowlistOnly: allowlistOnlyField.input.checked
		};
		/* SHEEPFOLD_AI_BEGIN */
		payload.activityLogEnabled = activityLogField.input.checked;
		/* SHEEPFOLD_AI_END */
		deps.persistSettings(payload, section, onSave);
	}

	ui.showModal(_('Group settings'), [
		E('div', { 'class': 'sf-device-editor' }, [
			error.node,
			E('div', { 'class': 'sf-grid two' }, [nameField.node, colorField.node]),
			E('strong', {}, _('Group schedules')),
			scheduleSelector.node,
			allowlistOnlyField.node,
			/* SHEEPFOLD_AI_BEGIN */
			activityLogField ? activityLogField.node : '',
			/* SHEEPFOLD_AI_END */
			E('strong', {}, _('Assigned devices')),
			deviceSelector.node
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
			E('button', {
				'class': 'btn cbi-button cbi-button-positive',
				'click': function () {
					if (deps.schedulesConflict(scheduleSelector.values())) {
						deps.showScheduleConflict(save);
						return;
					}
					save();
				}
			}, _('Save'))
		])
	]);
}

function openAdd(deps, existingNames, onSave) {
	var nameField = deps.inputControl(_('Group name'), '');
	var colorField = deps.inputControl(_('Group color'), deps.nextColor(_('Custom')), { 'type': 'color' }, _('Automatic color'));
	var personalField = deps.checkboxControl(_('Personal group'), false, _('Only devices belonging to one person can be added to this group.'));
	var error = errorNote();

	function save() {
		var groupName = deps.normalize(nameField.input.value.trim());
		var color = colorField.input.value;

		error.clear();
		if (!groupName) {
			error.show(_('Group name is required.'));
			return;
		}
		if (existingNames[groupName]) {
			error.show(_('This group already exists.'));
			return;
		}
		if (!deps.validColor(color))
			color = deps.nextColor(groupName);

		deps.persistNew({
			name: groupName,
			color: color,
			personal: personalField.input.checked
		}, onSave);
	}

	ui.showModal(_('Add group'), [
		E('div', { 'class': 'sf-device-editor' }, [
			error.node,
			E('div', { 'class': 'sf-grid two' }, [nameField.node, colorField.node]),
			personalField.node
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
			E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save }, _('Save'))
		])
	]);
}

return baseclass.extend({
	openSettings: openSettings,
	openAdd: openAdd
});
