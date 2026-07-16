'use strict';
'require baseclass';

function render(deps, embedded) {
	var table = E('div', { 'class': 'sf-admin-table' }, [
		E('div', { 'class': 'sf-admin-row sf-admin-head' }, [
			E('div', {}, deps.sortHeader(_('Admin name'), 'name')),
			E('div', {}, deps.sortHeader(_('Login'), 'login')),
			E('div', {}, _('Admin devices')),
			E('div', {}, _('Actions'))
		])
	].concat(deps.administrators.map(deps.row)));

	return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
		E('div', { 'class': 'sf-panel-head' }, [
			E('div', {}, E('h3', {}, _('Administrator accounts'))),
			E('button', {
				'class': 'sf-action sf-action-positive',
				'click': function (event) {
					event.preventDefault();
					deps.add(function (administrator) { table.appendChild(deps.row(administrator)); });
				}
			}, _('Add administrator'))
		]),
		table
	]);
}

return baseclass.extend({ render: render });
