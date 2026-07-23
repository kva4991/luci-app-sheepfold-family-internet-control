'use strict';
'require baseclass';
'require ui';

/* §frontmod §ovfinal1
 * Контроллер расписаний отвечает за координацию, показ конфликтов и локальное
 * обновление. Подготовка UCI и schedule-sync остаются в persistence.js.
 */
function create(deps) {
	var days = [
		['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
		['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']
	];

	function sections() {
		return deps.sections('sheepfold', 'schedule');
	}

	function dayText(section) {
		return deps.model.dayText(section, deps.listValues, days);
	}

	function timeText(section) {
		return deps.model.timeText(section, deps.listValues);
	}

	function targetText(section) {
		var targets = deps.listValues(section.targets);
		var mode = section.target_type || 'group';
		var names = [];

		if (mode === 'group') {
			deps.sections('sheepfold', 'group').forEach(function (group) {
				if (targets.indexOf(group['.name']) !== -1)
					names.push(group.name || group['.name']);
			});
		} else {
			targets.forEach(function (id) {
				var device = deps.deviceById(id);
				if (device)
					names.push(deps.displayDeviceId(device) + ' ' + (device.name || device.mac));
			});
		}
		return names.join(', ') || _('No targets selected');
	}

	function targetKeys(mode, targets) {
		var keys = [];
		var groupNames = [];

		if (mode !== 'group')
			return (targets || []).map(function (id) { return 'device:' + id; });
		deps.sections('sheepfold', 'group').forEach(function (group) {
			if ((targets || []).indexOf(group['.name']) === -1)
				return;
			keys.push('group:' + group['.name']);
			groupNames.push(deps.groups.normalize(group.name));
		});
		deps.devices().forEach(function (device) {
			if (groupNames.indexOf(deps.groups.normalize(device.group)) !== -1)
				keys.push('device:' + device.id);
		});
		return keys;
	}

	function findConflict(draft, ownName) {
		var draftKeys = targetKeys(draft.targetType, draft.targets);
		var draftWindows = deps.model.windows(draft.weekdays || [], draft.timeRanges || [], days);
		var match = null;

		sections().some(function (section) {
			var otherKeys;
			var otherWindows;
			var sameTarget;

			if (section['.name'] === ownName || section.enabled === '0' || section.action === draft.action)
				return false;
			otherKeys = targetKeys(section.target_type || 'group', deps.listValues(section.targets));
			sameTarget = otherKeys.some(function (key) { return draftKeys.indexOf(key) !== -1; });
			otherWindows = deps.model.windows(
				deps.listValues(section.weekdays),
				deps.model.ranges(section, deps.listValues),
				days
			);
			if (sameTarget && deps.model.windowsOverlap(draftWindows, otherWindows)) {
				match = section.name || _('Unnamed schedule');
				return true;
			}
			return false;
		});
		return match;
	}

	function conflictResultText() {
		return deps.conflictValue() === 'on' ?
			_('According to the conflict setting, internet will be on.') :
			_('According to the conflict setting, internet will be off.');
	}

	function showConflict(onContinue, details) {
		var seconds = 10;
		var countdown = E('strong', {}, String(seconds));
		var timer;
		var button = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'disabled': 'disabled',
			'click': function () {
				window.clearInterval(timer);
				ui.hideModal();
				onContinue();
			}
		}, _('I understand the risk, continue'));

		timer = window.setInterval(function () {
			seconds--;
			countdown.textContent = String(Math.max(0, seconds));
			if (seconds <= 0) {
				window.clearInterval(timer);
				button.disabled = false;
			}
		}, 1000);
		ui.showModal(_('Schedule conflict'), [
			E('div', { 'class': 'sf-device-editor' }, [
				E('div', { 'class': 'sf-note sf-note-warning' },
					_('Selected schedules may conflict with each other. Saving is allowed, but review the rules carefully.')),
				details ? E('p', {}, details) : '',
				E('p', {}, [_('Confirmation will be available in'), ' ', countdown])
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': function () { window.clearInterval(timer); ui.hideModal(); }
				}, _('Cancel')),
				button
			])
		]);
	}

	function editorTargets(targetType) {
		if (targetType === 'group') {
			return deps.sections('sheepfold', 'group').map(function (group) {
				return [group['.name'], group.name || group['.name']];
			});
		}
		return deps.devices().filter(function (device) {
			return !device.adminDevice && device.status !== 'allow' && device.status !== 'blocked';
		}).map(function (device) {
			return [String(device.id), deps.displayDeviceId(device) + ' ' + (device.name || device.mac)];
		});
	}

	function afterPersistedError(error, partialMessage, refresh) {
		if (!error || !error.persisted)
			return Promise.resolve(false);
		return deps.persistence.reload().then(function () {
			if (refresh) refresh();
			deps.notify(partialMessage + ' ' + deps.errorText(error, _('Check the router journal.')), 'warning');
			return true;
		}, function (refreshError) {
			error.refreshFailed = true;
			error.refreshError = refreshError;
			deps.notify(partialMessage + ' ' + _('The saved schedule could not be refreshed in LuCI.'), 'warning');
			return true;
		});
	}

	function persistDraft(draft, ownName, button) {
		var key = 'schedule-save:' + String(ownName || 'new');
		return deps.actions.execute({
			key: key,
			button: button,
			silent: true,
			task: function () { return deps.persistence.persistDraft(draft, ownName); }
		}).then(function () {
			ui.hideModal();
			deps.notify(_('Schedule saved.'), 'info');
			deps.refresh();
		}, function (error) {
			return afterPersistedError(
				error,
				_('The schedule was saved, but internet access rules could not be applied.'),
				deps.refresh
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not save schedule.')), 'warning');
			});
		});
	}

	function openEditor(section, copyMode) {
		return deps.editor.open({
			listValues: deps.listValues,
			ranges: function (value) { return deps.model.ranges(value, deps.listValues); },
			days: days,
			targets: editorTargets,
			dayText: dayText,
			timeText: timeText,
			timeToMinutes: deps.model.timeToMinutes,
			findConflict: findConflict,
			conflictResultText: conflictResultText,
			showConflict: showConflict,
			persist: persistDraft,
			notify: deps.notify
		}, section, copyMode);
	}

	function setEnabled(section, enabled, button) {
		return deps.actions.execute({
			key: 'schedule-state:' + section['.name'],
			button: button,
			silent: true,
			task: function () { return deps.persistence.setEnabled(section, enabled); }
		}).then(function () {
			deps.notify(enabled ? _('Schedule enabled.') : _('Schedule disabled.'), 'info');
			deps.refresh();
		}, function (error) {
			return afterPersistedError(
				error,
				_('The schedule state was saved, but internet access rules could not be applied.'),
				deps.refresh
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not change schedule state.')), 'warning');
			});
		});
	}

	function remove(section, button) {
		if (!window.confirm(_('Delete schedule?') + ' «' + (section.name || _('Unnamed schedule')) + '»'))
			return Promise.resolve(false);
		return deps.actions.execute({
			key: 'schedule-delete:' + section['.name'],
			button: button,
			silent: true,
			task: function () { return deps.persistence.remove(section); }
		}).then(function () {
			deps.notify(_('Schedule deleted.'), 'info');
			deps.refresh();
			return true;
		}, function (error) {
			return afterPersistedError(
				error,
				_('The schedule was deleted, but internet access rules could not be applied.'),
				deps.refresh
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not delete schedule.')), 'warning');
				return false;
			});
		});
	}

	function bedtime() {
		var saved = deps.get('sheepfold', 'global', 'bedtime', '21:00');
		var input = E('input', { 'type': 'time', 'value': saved });

		return E('div', { 'class': 'sf-bedtime-row' }, [
			E('label', { 'class': 'sf-field' }, [
				E('span', {}, _('Default bedtime')),
				input,
				E('small', {}, _('Used by the "until bedtime" quick action.'))
			]),
			E('button', {
				'class': 'sf-action sf-action-positive',
				'click': function (event) {
					var button = event.currentTarget;
					event.preventDefault();
					if (deps.model.timeToMinutes(input.value) < 0) {
						deps.notify(_('Enter a valid bedtime.'), 'warning');
						return;
					}
					deps.actions.execute({
						key: 'schedule-bedtime',
						button: button,
						task: function () { return deps.persistence.saveBedtime(input.value); },
						successMessage: _('Bedtime saved.'),
						errorMessage: _('Could not save bedtime.')
					}).catch(function () { return null; });
				}
			}, _('Save'))
		]);
	}

	function checkboxList(selectedValues) {
		var selected = Object.create(null);
		var nodes;

		(selectedValues || []).forEach(function (value) { selected[value] = true; });
		nodes = sections().map(function (section) {
			var checkbox = E('input', {
				'type': 'checkbox',
				'checked': selected[section['.name']] ? 'checked' : null,
				'change': function (event) { selected[section['.name']] = event.currentTarget.checked; }
			});
			return E('label', { 'class': 'sf-check-field' }, [
				checkbox,
				E('span', {}, section.name || section['.name'])
			]);
		});
		return {
			node: E('div', { 'class': 'sf-schedule-list' }, nodes),
			values: function () {
				return sections().filter(function (section) { return selected[section['.name']]; })
					.map(function (section) { return section['.name']; });
			}
		};
	}

	function render(embedded) {
		return deps.view.render({
			sections: sections,
			setEnabled: setEnabled,
			targetText: targetText,
			dayText: dayText,
			timeText: timeText,
			edit: openEditor,
			remove: remove,
			bedtime: bedtime
		}, embedded);
	}

	return {
		days: function () { return days.slice(); },
		sections: sections,
		dayText: dayText,
		timeText: timeText,
		targetText: targetText,
		findConflict: findConflict,
		showConflict: showConflict,
		checkboxList: checkboxList,
		hasMultiple: function (values) { return (values || []).length > 1; },
		openEditor: openEditor,
		setEnabled: setEnabled,
		remove: remove,
		render: render
	};
}

return baseclass.extend({ create: create });
