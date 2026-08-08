'use strict';
'require baseclass';

/* §frontmod §coordclean1 §ovaudit3 §grpsch1
 * Секции групп и членство подготавливаются внутри одной последовательной UCI-мутации.
 * Создаваемые имена секций защищены от коллизий, а удаление отклоняется, пока на
 * группу ссылается расписание. Связь хранится только в schedule.targets: второе
 * зеркало group.schedules неизбежно расходилось бы с runtime-вычислителем.
 */
function create(deps) {
	function configured(value) { return typeof value === 'function' ? value() : value; }

	function codedError(code, message) {
		var error = new Error(message || code);
		error.errorCode = code;
		return error;
	}

	function baseSectionName(groupName) {
		return 'group_' + deps.groupModel.hash(groupName).toString(16);
	}

	function ensureGroupSection(groupName, section) {
		var normalized = deps.normalizeGroupName(groupName);
		var base;
		var index;
		var candidate;
		var existing;

		if (section && section['.name']) {
			existing = deps.persistence.sections('sheepfold').filter(function (item) {
				return item['.name'] === section['.name'];
			})[0] || null;
			if (!existing)
				throw codedError('group_not_found', 'group_not_found');
			if (existing['.type'] !== 'group')
				throw codedError('group_section_type_conflict', 'group_section_type_conflict');
			return existing['.name'];
		}
		base = baseSectionName(normalized);
		for (index = 1; index <= 999; index++) {
			candidate = index === 1 ? base : base + '_' + index;
			existing = deps.persistence.sections('sheepfold').filter(function (item) {
				return item['.name'] === candidate;
			})[0] || null;
			if (!existing)
				return deps.persistence.ensureSection('sheepfold', 'group', candidate);
			if (existing['.type'] === 'group' && deps.normalizeGroupName(existing.name || '') === normalized)
				return candidate;
		}
		throw codedError('group_section_collision', 'group_section_collision');
	}

	function uniqueValues(values) {
		var seen = Object.create(null);
		return (values || []).map(function (value) { return String(value || ''); }).filter(function (value) {
			if (!value || seen[value])
				return false;
			seen[value] = true;
			return true;
		});
	}

	function groupAliases(sectionName, names) {
		var aliases = [sectionName];
		(names || []).forEach(function (name) {
			aliases.push(name);
			aliases.push(deps.normalizeGroupName(name));
		});
		return uniqueValues(aliases);
	}

	function selectedScheduleIds(sectionName, groupName, legacyIds) {
		var aliases = groupAliases(sectionName, [groupName]);
		var legacy = uniqueValues(legacyIds);
		return deps.persistence.sections('sheepfold', 'schedule').filter(function (schedule) {
			if ((schedule.target_type || 'group') !== 'group')
				return false;
			return legacy.indexOf(schedule['.name']) !== -1 || deps.listValues(schedule.targets).some(function (target) {
				return aliases.indexOf(target) !== -1;
			});
		}).map(function (schedule) { return schedule['.name']; });
	}

	function stageScheduleLinks(sectionName, payload) {
		var schedules = deps.persistence.sections('sheepfold', 'schedule');
		var selectedIds = uniqueValues(payload.selectedSchedules);
		var selected = Object.create(null);
		var aliases = groupAliases(sectionName, [payload.oldName, payload.newName]);

		selectedIds.forEach(function (scheduleId) {
			var schedule = schedules.filter(function (item) { return item['.name'] === scheduleId; })[0] || null;
			if (!schedule)
				throw codedError('schedule_not_found', 'schedule_not_found');
			if ((schedule.target_type || 'group') !== 'group')
				throw codedError('group_schedule_type_forbidden', 'group_schedule_type_forbidden');
			selected[scheduleId] = true;
		});

		schedules.forEach(function (schedule) {
			var currentTargets;
			var nextTargets;
			if ((schedule.target_type || 'group') !== 'group')
				return;
			currentTargets = uniqueValues(deps.listValues(schedule.targets));
			nextTargets = currentTargets.filter(function (target) { return aliases.indexOf(target) === -1; });
			if (selected[schedule['.name']])
				nextTargets.push(sectionName);
			if (currentTargets.join('\n') !== nextTargets.join('\n'))
				deps.persistence.replaceList('sheepfold', schedule['.name'], 'targets', nextTargets);
		});

		// Старое зеркало удаляем в той же транзакции только после подготовки
		// канонических целей расписаний. Так сбой не оставит связь потерянной.
		deps.uci.unset('sheepfold', sectionName, 'schedules');
		return selectedIds;
	}

	function stageSettings(payload, section, devices) {
		var selectedDevices = payload.selectedDevices || [];
		if (selectedDevices.some(function (device) { return deps.isAdminDevice && deps.isAdminDevice(device); }))
			throw codedError('administrator_device', 'administrator_device');
		var membershipChanges = deps.groupModel.membershipChanges(
			devices || [],
			payload.oldName,
			payload.newName,
			selectedDevices.map(function (device) { return device.id; }),
			deps.normalizeGroupName
		);
		var changesByMac = {};
		var sectionName = ensureGroupSection(payload.oldName || payload.newName, section);
		var notConfigured = configured(deps.notConfiguredGroup) || 'Not configured';

		membershipChanges.forEach(function (change) {
			var mac = deps.normalizeMac(change.device.mac);
			if (mac)
				changesByMac[mac] = change;
		});
		deps.uci.set('sheepfold', sectionName, 'name', payload.newName);
		deps.uci.set('sheepfold', sectionName, 'color', payload.color);
		stageScheduleLinks(sectionName, payload);
		deps.uci.set('sheepfold', sectionName, 'allowlist_only', payload.allowlistOnly ? '1' : '0');
		/* SHEEPFOLD_AI_BEGIN */
		deps.uci.set('sheepfold', sectionName, 'activity_log_enabled', payload.activityLogEnabled ? '1' : '0');
		/* SHEEPFOLD_AI_END */
		if (!section)
			deps.uci.set('sheepfold', sectionName, 'protected', '0');

		deps.persistence.sections('sheepfold', 'device').forEach(function (deviceSection) {
			var change = changesByMac[deps.normalizeMac(deviceSection.mac)];
			if (!change)
				return;
			deps.uci.set('sheepfold', deviceSection['.name'], 'group', change.nextGroup || notConfigured);
			if (payload.oldName === configured(deps.noRestrictionsGroupName) && !change.linked)
				deps.markNoRestrictionsExcluded(deviceSection['.name']);
			if (payload.oldName === configured(deps.personalDevicesGroupName) && !change.linked)
				deps.markPersonalDevicesExcluded(deviceSection['.name']);
		});

		selectedDevices.forEach(function (device) {
			var deviceSectionName = deps.devicePersistence.ensureDeviceSection(device);
			deps.uci.set('sheepfold', deviceSectionName, 'mac', deps.normalizeMac(device.mac));
			deps.uci.set('sheepfold', deviceSectionName, 'name', device.name || device.mac);
			deps.uci.set('sheepfold', deviceSectionName, 'ip', device.ip || '');
			deps.uci.set('sheepfold', deviceSectionName, 'group', payload.newName);
			if (payload.oldName === configured(deps.noRestrictionsGroupName) && payload.newName !== configured(deps.noRestrictionsGroupName))
				deps.markNoRestrictionsExcluded(deviceSectionName);
			if (payload.oldName === configured(deps.personalDevicesGroupName) && payload.newName !== configured(deps.personalDevicesGroupName))
				deps.markPersonalDevicesExcluded(deviceSectionName);
		});

		return { sectionName: sectionName, membershipChanges: membershipChanges };
	}

	function persistSettings(payload, section, devices) {
		return deps.persistence.mutate(['sheepfold'], function () {
			return stageSettings(payload, section, devices);
		}).then(function (mutation) {
			var state = mutation.stageResult;
			state.persisted = true;
			state.runtimeApplied = false;
			return deps.devicePersistence.applyRuntime().then(function () {
				state.runtimeApplied = true;
				return state;
			}, function (error) {
				error.groupResult = state;
				error.persisted = true;
				error.runtimeApplied = false;
				throw error;
			});
		});
	}

	function persistNew(payload) {
		return deps.persistence.mutate(['sheepfold'], function () {
			var normalized = deps.normalizeGroupName(payload.name);
			var duplicate = deps.persistence.sections('sheepfold', 'group').some(function (group) {
				return deps.normalizeGroupName(group.name || group['.name']) === normalized;
			});
			var sectionName;
			if (duplicate)
				throw codedError('group_name_exists', 'group_name_exists');
			sectionName = ensureGroupSection(payload.name, null);
			deps.uci.set('sheepfold', sectionName, 'name', payload.name);
			deps.uci.set('sheepfold', sectionName, 'color', payload.color);
			deps.uci.set('sheepfold', sectionName, 'protected', '0');
			deps.uci.set('sheepfold', sectionName, 'auto_assignable', '0');
			deps.uci.set('sheepfold', sectionName, 'allowlist_only', '0');
			/* SHEEPFOLD_AI_BEGIN */
			deps.uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
			/* SHEEPFOLD_AI_END */
			deps.uci.set('sheepfold', sectionName, 'personal', payload.personal ? '1' : '0');
			return { sectionName: sectionName };
		}).then(function (mutation) {
			mutation.stageResult.persisted = true;
			return mutation.stageResult;
		});
	}

	function groupSection(sectionName) {
		return deps.persistence.sections('sheepfold', 'group').filter(function (item) {
			return item['.name'] === sectionName;
		})[0] || null;
	}

	function groupDisplayName(group, sectionName) {
		return deps.normalizeGroupName(group && group.name || sectionName);
	}

	function assignedDeviceSections(sectionName) {
		var group = groupSection(sectionName);
		var displayName = groupDisplayName(group, sectionName);
		return deps.persistence.sections('sheepfold', 'device').filter(function (device) {
			var value = deps.normalizeGroupName(device.group || '');
			return value === displayName || value === deps.normalizeGroupName(sectionName);
		});
	}

	function scheduleReferences(sectionName) {
		var group = groupSection(sectionName);
		var displayName = groupDisplayName(group, sectionName);
		return deps.persistence.sections('sheepfold', 'schedule').filter(function (schedule) {
			var targets;
			if ((schedule.target_type || 'group') !== 'group')
				return false;
			targets = deps.listValues(schedule.targets);
			return targets.indexOf(sectionName) !== -1 || targets.indexOf(displayName) !== -1;
		});
	}

	function deletionError(sectionName) {
		var group = groupSection(sectionName);
		var displayName;
		var devices;
		var references;
		var error;

		if (!group)
			return codedError('group_not_found', 'group_not_found');
		displayName = groupDisplayName(group, sectionName);
		if (group.protected === '1' || displayName === configured(deps.noRestrictionsGroupName))
			return codedError('group_protected', 'group_protected');
		devices = assignedDeviceSections(sectionName);
		if (devices.length) {
			error = codedError('group_has_devices', 'group_has_devices');
			error.deviceSections = devices.map(function (item) { return item['.name']; });
			return error;
		}
		references = scheduleReferences(sectionName);
		if (references.length) {
			error = codedError('group_referenced_by_schedule', 'group_referenced_by_schedule');
			error.scheduleNames = references.map(function (item) { return item.name || item['.name']; });
			return error;
		}
		return null;
	}

	function remove(sectionName) {
		var error = deletionError(sectionName);
		if (error)
			return Promise.reject(error);
		return deps.persistence.mutate(['sheepfold'], function () {
			deps.uci.remove('sheepfold', sectionName);
			return { sectionName: sectionName, removed: true };
		}).then(function (mutation) {
			mutation.stageResult.persisted = true;
			return mutation.stageResult;
		});
	}

	return {
		ensureGroupSection: ensureGroupSection,
		selectedScheduleIds: selectedScheduleIds,
		stageScheduleLinks: stageScheduleLinks,
		stageSettings: stageSettings,
		persistSettings: persistSettings,
		persistNew: persistNew,
		assignedDeviceSections: assignedDeviceSections,
		scheduleReferences: scheduleReferences,
		deletionError: deletionError,
		remove: remove,
		reload: function () { return deps.persistence.reload(['sheepfold']); },
		discard: function () { return deps.persistence.discard(['sheepfold']); }
	};
}

return baseclass.extend({ create: create });
