'use strict';
'require baseclass';
'require ui';

/* §frontmod §ovfinal1
 * Контроллер групп связывает редактор, представление и сохранение. Имена и
 * псевдонимы делегированы naming.js, применение firewall остаётся в persistence.
 */
function create(deps) {
	function finishMembership(state) {
		(state.membershipChanges || []).forEach(function (change) {
			change.device.group = change.nextGroup || deps.notConfigured;
		});
	}

	function persistedFailure(error, message, onSave) {
		if (!error.persisted)
			return Promise.resolve(false);
		return deps.persistence.reload().then(function () {
			if (error.groupResult)
				finishMembership(error.groupResult);
			if (onSave)
				onSave();
			ui.hideModal();
			deps.notify(message + ' ' + deps.errorText(error, _('Check the router journal.')), 'warning');
			return true;
		}, function (refreshError) {
			error.refreshFailed = true;
			error.refreshError = refreshError;
			if (error.groupResult)
				finishMembership(error.groupResult);
			if (onSave) onSave();
			ui.hideModal();
			deps.notify(message + ' ' + _('The saved group could not be refreshed in LuCI.'), 'warning');
			return true;
		});
	}

	function persistSettings(payload, section, onSave, button) {
		var key = 'group-save:' + String(section && section['.name'] || payload.oldName || 'new');

		return deps.actions.execute({
			key: key,
			button: button,
			silent: true,
			task: function () {
				return deps.persistence.persistSettings(payload, section, deps.devices());
			}
		}).then(function (response) {
			finishMembership(response.data);
			if (onSave)
				onSave();
			ui.hideModal();
			deps.notify(_('Group saved.'), 'info');
			deps.refreshDevices();
		}, function (error) {
			if (error && error.errorCode === 'administrator_device') {
				deps.notify(_('Administrator devices cannot be assigned to ordinary groups.'), 'warning');
				return Promise.resolve();
			}
			return persistedFailure(
				error,
				_('The group was saved, but internet access rules could not be applied.'),
				onSave
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not save group.')), 'warning');
			});
		});
	}

	function persistNew(payload, onSave, button) {
		return deps.actions.execute({
			key: 'group-create:' + deps.naming.normalize(payload.name),
			button: button,
			silent: true,
			task: function () { return deps.persistence.persistNew(payload); }
		}).then(function () {
			deps.notify(_('Group created.'), 'info');
			if (onSave)
				onSave();
			ui.hideModal();
		}, function (error) {
			deps.notify(deps.errorText(error, _('Could not create group.')), 'warning');
		});
	}

	function editorDependencies() {
		return {
			inputControl: deps.forms.inputControl,
			checkboxControl: deps.forms.checkboxControl,
			createDeviceSelector: deps.createDeviceSelector,
			scheduleCheckboxes: function (values) { return deps.schedules().checkboxList(values); },
			listValues: deps.listValues,
			currentDeviceIds: function (name) {
				return deps.naming.currentDeviceIds(name, deps.devices());
			},
			groupColor: deps.naming.color,
			normalize: deps.naming.normalize,
			nameExists: deps.naming.nameExists,
			validColor: deps.naming.validColor,
			automaticColor: deps.naming.automaticColor,
			nextColor: deps.naming.nextAvailableColor,
			schedulesConflict: function (values) { return deps.schedules().hasMultiple(values); },
			showScheduleConflict: function (onContinue) { return deps.schedules().showConflict(onContinue); },
			persistSettings: persistSettings,
			persistNew: persistNew
		};
	}

	function showSettings(name, section, onSave) {
		return deps.editor.openSettings(editorDependencies(), name, section, onSave);
	}

	function showAdd(existingNames, onSave) {
		return deps.editor.openAdd(editorDependencies(), existingNames, onSave);
	}

	function remove(sectionName, button) {
		return deps.actions.execute({
			key: 'group-delete:' + sectionName,
			button: button,
			task: function () { return deps.persistence.remove(sectionName); },
			successMessage: _('Group deleted.'),
			errorMessage: function (error) {
				var code = error && error.errorCode || '';
				if (code === 'group_referenced_by_schedule')
					return _('The group cannot be deleted while a schedule still targets it.');
				if (code === 'group_has_devices')
					return _('This group cannot be deleted while devices are assigned to it.');
				if (code === 'group_protected')
					return _('Protected group cannot be deleted.');
				return _('Could not delete group.');
			},
			refresh: deps.refreshDevices
		});
	}

	function render(embedded) {
		return deps.view.render({
			sections: function () { return deps.sections('sheepfold', 'group'); },
			devices: deps.devices(),
			normalize: deps.naming.normalize,
			ensureDefaults: deps.naming.ensureDefaultSections,
			supplement: function (grouped) { return deps.naming.supplement(grouped, deps.devices()); },
			noRestrictionsName: deps.naming.noRestrictionsName,
			notify: deps.notify,
			remove: remove,
			validColor: deps.naming.validColor,
			palette: deps.naming.palette,
			automaticColor: deps.naming.automaticColor,
			deletionBlockReason: deps.model.deletionBlockReason,
			displayName: deps.naming.display,
			iconButton: deps.iconButton,
			configure: showSettings,
			deviceId: deps.displayDeviceId,
			add: showAdd
		}, embedded);
	}

	return {
		persistSettings: persistSettings,
		persistNew: persistNew,
		showSettings: showSettings,
		showAdd: showAdd,
		remove: remove,
		render: render
	};
}

return baseclass.extend({ create: create });
