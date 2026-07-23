'use strict';
'require baseclass';

/* §frontmod §coordclean1 §ovaudit3
 * Подготовка UCI расписания и schedule-sync образуют одну последовательную границу
 * сохранения. Создаваемые имена защищены от коллизий, а все ошибки до commit
 * возвращаются через Promise.
 */
function create(deps) {
	function codedError(code) {
		var error = new Error(code);
		error.errorCode = code;
		return error;
	}

	function runtime(sectionName) {
		return deps.run(['schedule-sync'], { key: 'schedule-runtime:' + sectionName }).then(function (result) {
			return deps.ensureOk(result, deps.runtimeError());
		});
	}

	function requireScheduleSection(sectionName) {
		var section = deps.persistence.sections('sheepfold').filter(function (item) {
			return item['.name'] === sectionName;
		})[0] || null;
		if (!section)
			throw codedError('schedule_not_found');
		if (section['.type'] !== 'schedule')
			throw codedError('schedule_section_type_conflict');
		return section;
	}

	function uniqueSectionName() {
		var base = deps.newSectionName();
		var index;
		var candidate;
		var existing;
		for (index = 1; index <= 999; index++) {
			candidate = index === 1 ? base : base + '_' + index;
			existing = deps.persistence.sections('sheepfold').filter(function (item) {
				return item['.name'] === candidate;
			})[0] || null;
			if (!existing)
				return deps.persistence.ensureSection('sheepfold', 'schedule', candidate);
		}
		throw codedError('schedule_section_collision');
	}

	function stageDraft(draft, ownName) {
		var sectionName = ownName ? requireScheduleSection(ownName)['.name'] : uniqueSectionName();
		deps.uci.set('sheepfold', sectionName, 'name', draft.name);
		deps.uci.set('sheepfold', sectionName, 'description', draft.description);
		deps.uci.set('sheepfold', sectionName, 'enabled', draft.enabled ? '1' : '0');
		deps.uci.set('sheepfold', sectionName, 'action', draft.action);
		deps.uci.set('sheepfold', sectionName, 'target_type', draft.targetType);
		deps.persistence.replaceList('sheepfold', sectionName, 'targets', draft.targets);
		deps.persistence.replaceList('sheepfold', sectionName, 'weekdays', draft.weekdays);
		deps.persistence.replaceList('sheepfold', sectionName, 'time_ranges', draft.timeRanges.map(function (range) {
			return range.start + '-' + range.end;
		}));
		return { sectionName: sectionName };
	}

	function persistAndRun(stage) {
		return deps.persistence.mutate(['sheepfold'], stage).then(function (mutation) {
			var state = mutation.stageResult;
			state.persisted = true;
			state.runtimeApplied = false;
			return runtime(state.sectionName).then(function () {
				state.runtimeApplied = true;
				return state;
			}, function (error) {
				error.scheduleResult = state;
				error.persisted = true;
				error.runtimeApplied = false;
				throw error;
			});
		});
	}

	function persistDraft(draft, ownName) {
		return persistAndRun(function () { return stageDraft(draft, ownName); });
	}

	function setEnabled(section, enabled) {
		return persistAndRun(function () {
			var current = requireScheduleSection(section['.name']);
			deps.uci.set('sheepfold', current['.name'], 'enabled', enabled ? '1' : '0');
			return { sectionName: current['.name'], enabled: !!enabled };
		});
	}

	function remove(section) {
		return persistAndRun(function () {
			var current = requireScheduleSection(section['.name']);
			deps.uci.remove('sheepfold', current['.name']);
			return { sectionName: current['.name'], removed: true };
		});
	}

	function saveBedtime(value) {
		return deps.persistence.mutate(['sheepfold'], function () {
			deps.uci.set('sheepfold', 'global', 'bedtime', value);
			return { bedtime: value };
		}).then(function (mutation) {
			mutation.stageResult.persisted = true;
			return mutation.stageResult;
		});
	}

	return {
		requireScheduleSection: requireScheduleSection,
		stageDraft: stageDraft,
		persistDraft: persistDraft,
		setEnabled: setEnabled,
		remove: remove,
		saveBedtime: saveBedtime,
		reload: function () { return deps.persistence.reload(['sheepfold']); },
		discard: function () { return deps.persistence.discard(['sheepfold']); }
	};
}

return baseclass.extend({ create: create });
