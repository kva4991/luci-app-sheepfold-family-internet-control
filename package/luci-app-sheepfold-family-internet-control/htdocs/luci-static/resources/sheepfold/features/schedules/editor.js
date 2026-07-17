'use strict';
'require baseclass';
'require ui';

/* §frontmod
 * Редактор изолирует DOM-состояние одного расписания. Он не читает UCI и общий
 * компоновщик страницы напрямую: список целей, проверка конфликтов и сохранение передаются
 * явными callbacks, поэтому окно нельзя случайно связать с чужим черновиком.
 */
function open(deps, section, copyMode) {
	var ownName = !copyMode && section ? section['.name'] : '';
	var draft = {
		name: copyMode ? (section.name || '') + ' ' + _('copy') : section && section.name || '',
		description: section && section.description || '',
		enabled: section ? section.enabled !== '0' : true,
		action: section && section.action === 'allow' ? 'allow' : 'block',
		targetType: section && section.target_type === 'device' ? 'device' : 'group',
		targets: section ? deps.listValues(section.targets) : [],
		weekdays: section ? deps.listValues(section.weekdays) : ['mon', 'tue', 'wed', 'thu', 'fri'],
		timeRanges: section ? deps.ranges(section) : [{ start: '21:00', end: '07:00' }]
	};
	var nameInput = E('input', { 'class': 'cbi-input-text', 'value': draft.name, 'maxlength': '80' });
	var descInput = E('textarea', { 'class': 'cbi-input-textarea', 'rows': '2', 'maxlength': '240' }, draft.description);
	var enabledBox = E('input', { 'type': 'checkbox', 'checked': draft.enabled ? 'checked' : null });
	var targetBox = E('div', { 'class': 'sf-schedule-targets' });
	var rangeBox = E('div', { 'class': 'sf-time-ranges' });
	var dayBox = E('div', { 'class': 'sf-day-row' });
	var preview = E('div', { 'class': 'sf-note sf-schedule-preview' });
	var modeSelect;

	function selectedDays() {
		return Array.prototype.slice.call(dayBox.querySelectorAll('[data-schedule-day]:checked')).map(function (node) {
			return node.value;
		});
	}

	function updatePreview() {
		draft.name = nameInput.value.trim();
		draft.description = descInput.value.trim();
		draft.enabled = enabledBox.checked;
		draft.targetType = modeSelect.value;
		draft.weekdays = selectedDays();
		preview.textContent = (draft.action === 'allow' ? _('Allow internet') : _('Block internet')) +
			' · ' + (draft.enabled ? _('Enabled') : _('Disabled')) +
			' · ' + deps.dayText({ weekdays: draft.weekdays }) +
			' · ' + deps.timeText({ time_ranges: draft.timeRanges.map(function (run) { return run.start + '-' + run.end; }) });
	}

	function renderTargets() {
		var entries = deps.targets(draft.targetType);

		targetBox.replaceChildren.apply(targetBox, entries.map(function (item) {
			return E('label', { 'class': 'sf-check-field' }, [
				E('input', {
					'type': 'checkbox',
					'value': item[0],
					'checked': draft.targets.indexOf(item[0]) !== -1 ? 'checked' : null,
					'change': function () {
						draft.targets = Array.prototype.slice.call(targetBox.querySelectorAll('input:checked')).map(function (node) {
							return node.value;
						});
						updatePreview();
					}
				}),
				E('span', {}, item[1])
			]);
		}));
		if (!entries.length)
			targetBox.appendChild(E('p', { 'class': 'sf-muted' }, _('No suitable devices or groups.')));
	}

	function renderRanges() {
		rangeBox.replaceChildren.apply(rangeBox, draft.timeRanges.map(function (run, index) {
			var startInput = E('input', { 'type': 'time', 'value': run.start });
			var endInput = E('input', { 'type': 'time', 'value': run.end });

			startInput.addEventListener('change', function () { run.start = startInput.value; updatePreview(); });
			endInput.addEventListener('change', function () { run.end = endInput.value; updatePreview(); });
			return E('div', { 'class': 'sf-time-row' }, [
				startInput,
				E('span', {}, '—'),
				endInput,
				E('button', {
					'class': 'sf-icon-btn sf-icon-danger',
					'title': _('Remove time interval'),
					'disabled': draft.timeRanges.length === 1 ? 'disabled' : null,
					'click': function (event) {
						event.preventDefault();
						draft.timeRanges.splice(index, 1);
						renderRanges();
						updatePreview();
					}
				}, '×')
			]);
		}));
	}

	function validateAndSave() {
		var conflict;

		updatePreview();
		if (!draft.name || !draft.targets.length || !draft.weekdays.length || draft.timeRanges.some(function (run) {
			return deps.timeToMinutes(run.start) < 0 || deps.timeToMinutes(run.end) < 0 || run.start === run.end;
		})) {
			deps.notify(_('Enter a name, select targets and days, and set a valid time interval.'), 'warning');
			return;
		}
		conflict = deps.findConflict(draft, ownName);
		if (conflict) {
			deps.showConflict(function () { deps.persist(draft, ownName); },
				_('This rule overlaps the opposite rule:') + ' «' + conflict + '». ' + deps.conflictResultText());
			return;
		}
		deps.persist(draft, ownName);
	}

	modeSelect = E('select', {
		'class': 'cbi-input-select',
		'change': function (event) {
			draft.targetType = event.currentTarget.value;
			draft.targets = [];
			renderTargets();
			updatePreview();
		}
	}, [
		E('option', { 'value': 'group', 'selected': draft.targetType === 'group' ? 'selected' : null }, _('Groups')),
		E('option', { 'value': 'device', 'selected': draft.targetType === 'device' ? 'selected' : null }, _('Individual devices'))
	]);

	var actionNodes = ['allow', 'block'].map(function (action) {
		return E('label', { 'class': 'sf-action-choice sf-action-choice-' + action }, [
			E('input', {
				'type': 'radio',
				'name': 'schedule_action',
				'value': action,
				'checked': draft.action === action ? 'checked' : null,
				'change': function () { draft.action = action; updatePreview(); }
			}),
			E('span', {}, action === 'allow' ? _('Allow internet') : _('Block internet'))
		]);
	});
	var dayNodes = deps.days.map(function (item) {
		return E('label', { 'class': 'sf-day-chip' }, [
			E('input', {
				'type': 'checkbox',
				'data-schedule-day': '1',
				'value': item[0],
				'checked': draft.weekdays.indexOf(item[0]) !== -1 ? 'checked' : null,
				'change': updatePreview
			}),
			E('span', {}, _(item[1]))
		]);
	});
	dayBox.replaceChildren.apply(dayBox, dayNodes);

	nameInput.addEventListener('input', updatePreview);
	descInput.addEventListener('input', updatePreview);
	enabledBox.addEventListener('change', updatePreview);
	renderTargets();
	renderRanges();
	updatePreview();

	ui.showModal(ownName ? _('Edit schedule') : _('Add schedule'), [
		E('div', { 'class': 'sf-schedule-editor' }, [
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Schedule name')), nameInput]),
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Description')), descInput]),
			E('label', { 'class': 'sf-toggle-line' }, [enabledBox, E('span', {}, _('Schedule enabled'))]),
			E('div', { 'class': 'sf-action-choices' }, actionNodes),
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Apply to')), modeSelect]),
			targetBox,
			E('strong', {}, _('Days of week')),
			dayBox,
			E('strong', {}, _('Time intervals')),
			rangeBox,
			E('button', {
				'class': 'sf-action sf-action-neutral',
				'click': function (event) {
					event.preventDefault();
					draft.timeRanges.push({ start: '15:00', end: '16:00' });
					renderRanges();
					updatePreview();
				}
			}, _('Add time interval')),
			preview
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
			E('button', { 'class': 'btn cbi-button-positive', 'click': validateAndSave }, _('Save'))
		])
	]);
}

return baseclass.extend({ open: open });
