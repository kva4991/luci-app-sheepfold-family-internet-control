'use strict';
'require baseclass';

function matches(device, needle, displayId, formattedId) {
	if (!needle)
		return true;

	return [displayId(device), formattedId(device), device.id, device.name, device.ip, device.mac, device.group]
		.join(' ').toLowerCase().indexOf(needle) !== -1;
}

function create(options) {
	var selected = {};
	var source = options.devices || [];
	var filter = options.filter || function () { return true; };
	var filterInput = E('input', {
		'class': 'cbi-input-text sf-search sf-binding-filter',
		'placeholder': _('Search by name, IP, MAC, or ID')
	});
	var table = E('div', { 'class': 'sf-binding-table' });

	(options.selectedIds || []).forEach(function (id) { selected[id] = true; });

	function sortedRows() {
		return source.filter(filter).slice().sort(function (left, right) {
			var selectedDifference = (selected[right.id] ? 1 : 0) - (selected[left.id] ? 1 : 0);

			if (selectedDifference)
				return selectedDifference;

			return source.indexOf(right) - source.indexOf(left);
		});
	}

	function redraw() {
		var needle = filterInput.value.trim().toLowerCase();
		var rows = sortedRows().filter(function (device) {
			return matches(device, needle, options.displayId, options.formattedId);
		}).map(function (device) {
			var checkbox = E('input', {
				'type': 'checkbox',
				'checked': selected[device.id] ? 'checked' : null,
				'change': function (event) {
					selected[device.id] = event.currentTarget.checked;
					redraw();
				}
			});

			return E('div', { 'class': 'sf-binding-row' + (selected[device.id] ? ' is-selected' : '') }, [
				E('div', { 'class': 'sf-device-index' }, options.formattedId(device)),
				E('div', { 'class': 'sf-device-name' }, [
					E('strong', {}, device.name),
					E('small', {}, options.groupName(device.group))
				]),
				E('div', {}, device.ip || '-'),
				E('div', { 'class': 'sf-mono' }, device.mac || '-'),
				E('label', { 'class': 'sf-binding-check' }, checkbox)
			]);
		});

		table.replaceChildren.apply(table, [
			E('div', { 'class': 'sf-binding-row sf-binding-head' }, [
				E('div', {}, _('ID')), E('div', {}, _('Device')), E('div', {}, _('IP address')),
				E('div', {}, _('MAC address')), E('div', {}, '')
			])
		].concat(rows));
	}

	filterInput.addEventListener('input', redraw);
	redraw();

	return {
		node: E('div', { 'class': 'sf-binding-selector' }, [
			E('div', { 'class': 'sf-panel-head sf-binding-toolbar' }, [
				filterInput,
				E('span', { 'class': 'sf-muted' }, _('Selected devices are shown first.'))
			]),
			table
		]),
		selectedDevices: function () { return sortedRows().filter(function (device) { return selected[device.id]; }); },
		selectedIds: function () { return this.selectedDevices().map(function (device) { return device.id; }); },
		isSelected: function (device) { return !!selected[device.id]; }
	};
}

return baseclass.extend({
	matches: matches,
	create: create
});
