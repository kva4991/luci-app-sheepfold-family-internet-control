'use strict';
'require baseclass';

function render(deps, embedded) {
	var sections = deps.sections();

	function card(section) {
		var enabled = section.enabled !== '0';
		var action = section.action === 'allow' ? 'allow' : 'block';
		var toggle = E('input', {
			'type': 'checkbox',
			'checked': enabled ? 'checked' : null,
			'change': function (event) { deps.setEnabled(section, event.currentTarget.checked); }
		});

		return E('div', { 'class': 'sf-schedule-card sf-schedule-' + action + (enabled ? '' : ' is-disabled') }, [
			E('div', { 'class': 'sf-schedule-head' }, [
				E('div', {}, [
					E('strong', { 'class': 'sf-schedule-name' }, section.name || _('Unnamed schedule')),
					E('span', { 'class': 'sf-rule-badge sf-rule-' + action }, action === 'allow' ? _('Internet allowed') : _('Internet blocked'))
				]),
				E('label', { 'class': 'sf-switch-line', 'title': enabled ? _('Disable without deleting') : _('Enable schedule') }, [
					toggle, E('span', {}, enabled ? _('Enabled') : _('Disabled'))
				])
			]),
			section.description ? E('p', { 'class': 'sf-muted' }, section.description) : '',
			E('div', { 'class': 'sf-schedule-facts' }, [deps.targetText(section), deps.dayText(section), deps.timeText(section)].map(function (text) {
				return E('span', {}, text);
			})),
			E('div', { 'class': 'sf-card-actions' }, [
				E('button', { 'class': 'sf-icon-btn', 'title': _('Edit schedule'), 'click': function (event) { event.preventDefault(); deps.edit(section, false); } }, '⚙'),
				E('button', { 'class': 'sf-icon-btn', 'title': _('Duplicate schedule'), 'click': function (event) { event.preventDefault(); deps.edit(section, true); } }, '⧉'),
				E('button', { 'class': 'sf-icon-btn sf-icon-danger', 'title': _('Delete schedule'), 'click': function (event) { event.preventDefault(); deps.remove(section); } }, '×')
			])
		]);
	}

	return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
		E('div', { 'class': 'sf-panel-head' }, [
			E('div', {}, E('p', {}, _('Create recurring allow or block rules for groups and individual devices. A rule can be disabled without deleting it.'))),
			E('button', { 'class': 'sf-action sf-action-positive', 'click': function (event) { event.preventDefault(); deps.edit(null, false); } }, _('Add schedule'))
		]),
		sections.length ? E('div', { 'class': 'sf-schedule-grid' }, sections.map(card)) :
			E('div', { 'class': 'sf-empty-state' }, [E('strong', {}, _('No schedules yet')), E('p', {}, _('Add the first rule and choose who, on which days, and at what time it applies.'))]),
		deps.bedtime()
	]);
}

return baseclass.extend({ render: render });
