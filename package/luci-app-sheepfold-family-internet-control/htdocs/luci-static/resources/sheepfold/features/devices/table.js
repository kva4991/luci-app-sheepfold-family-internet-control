'use strict';
'require baseclass';

function sort(table, key, rowSelector, buttonSelector) {
	var currentKey = table.getAttribute('data-sort-key');
	var currentDirection = table.getAttribute('data-sort-direction') || 'asc';
	var direction = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
	var rows = Array.prototype.slice.call(table.querySelectorAll(rowSelector));

	rows.sort(function (left, right) {
		var leftValue = left.getAttribute('data-sort-' + key) || '';
		var rightValue = right.getAttribute('data-sort-' + key) || '';
		var result;

		if (key === 'id' || key === 'ip')
			result = Number(leftValue) - Number(rightValue);
		else
			result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });

		return direction === 'asc' ? result : -result;
	});

	table.setAttribute('data-sort-key', key);
	table.setAttribute('data-sort-direction', direction);
	table.querySelectorAll(buttonSelector).forEach(function (button) {
		var active = button.getAttribute('data-sort-key') === key;
		button.classList.toggle('active', active);
		button.setAttribute('data-sort-direction', active ? direction : '');
	});
	rows.forEach(function (row) { table.appendChild(row); });
}

function sortHeader(label, key, options) {
	return E('button', {
		'class': options.className,
		'data-sort-key': key,
		'click': function (event) {
			event.preventDefault();
			sort(event.currentTarget.closest(options.tableSelector), key, options.rowSelector, options.buttonSelector);
		}
	}, [
		E('span', {}, label),
		E('span', { 'class': 'sf-sort-arrow' }, '')
	]);
}

function filter(table, needle) {
	var query = String(needle || '').trim().toLowerCase();

	table.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function (row) {
		var haystack = ['id', 'device', 'type', 'ip', 'group', 'status'].map(function (key) {
			return row.getAttribute('data-sort-' + key) || '';
		}).concat([row.getAttribute('data-search') || '']).join(' ').toLowerCase();

		row.hidden = query && haystack.indexOf(query) === -1;
	});
}

function stylesheet(assetVersion) {
	return E('link', {
		'rel': 'stylesheet',
		'href': L.resource('sheepfold/features/devices/responsive.css') + '?v=' + encodeURIComponent(assetVersion)
	});
}

return baseclass.extend({
	sort: sort,
	sortHeader: sortHeader,
	filter: filter,
	stylesheet: stylesheet
});
