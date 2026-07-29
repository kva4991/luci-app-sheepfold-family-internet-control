'use strict';
'require baseclass';

/* Read-only online state used by the personal overview decorator. The module
 * owns its cache and ordering so wrappers do not grow a second inventory model.
 * §frontmod §devpas1
 */
function create(deps) {
	var byMac = {};
	var pending = null;

	function parse(text) {
		var result = {};

		String(text || '').split(/\r?\n/).forEach(function (line) {
			var fields = line.split('\t');
			var mac = deps.normalizeMac(fields[0]);
			var lastSeen;

			if (!mac || fields.length < 3)
				return;
			lastSeen = parseInt(fields[1] || '0', 10) || 0;
			result[mac] = {
				mac: mac,
				lastSeen: lastSeen,
				online: fields[2] === '1',
				ip: fields[3] || ''
			};
		});
		return result;
	}

	function load(force) {
		if (force)
			pending = null;
		if (pending)
			return pending;

		pending = deps.actions.execute({
			key: 'device-presence:list',
			args: ['device-presence', 'list'],
			silent: true,
			errorMessage: _('Could not obtain device status.')
		}).then(function (response) {
			byMac = parse(response.stdout);
			return byMac;
		}).catch(function () {
			// Presence is optional decoration. A failed read must not hide devices.
			byMac = {};
			return byMac;
		});
		return pending;
	}

	function get(mac) {
		mac = deps.normalizeMac(mac);
		return byMac[mac] || { mac: mac, lastSeen: 0, online: false, ip: '' };
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function formatLastSeen(timestamp) {
		var date;

		if (!timestamp)
			return '';
		date = new Date(timestamp * 1000);
		if (isNaN(date.getTime()))
			return '';
		return [
			pad(date.getDate()),
			pad(date.getMonth() + 1),
			date.getFullYear()
		].join('.') + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
	}

	function statusText(presence) {
		var lastSeen;

		if (presence.online)
			return _('Online: now (seen in the last 15 minutes)');
		lastSeen = formatLastSeen(presence.lastSeen);
		return lastSeen ?
			_('Online: last seen %s').replace('%s', lastSeen) :
			_('Online: no presence data yet');
	}

	function statusCell(row, actions) {
		return actions && actions.previousElementSibling ? actions.previousElementSibling : null;
	}

	function decorateRow(row, mac, actions) {
		var current = get(mac);
		var cell = statusCell(row, actions);
		var oldBadge = row.querySelector('.sf-online-badge-row');

		row.setAttribute('data-sort-online', current.online ? '1' : '0');
		if (oldBadge)
			oldBadge.remove();
		if (current.online && cell) {
			cell.appendChild(E('div', { 'class': 'sf-online-badge-row' }, [
				E('span', { 'class': 'sf-online-badge' }, _('Online'))
			]));
		}
	}

	function rowIpSortValue(row) {
		var value = Number(row.getAttribute('data-sort-ip'));
		return isNaN(value) || value < 0 ? Number.MAX_SAFE_INTEGER : value;
	}

	function sortRows(root) {
		root.querySelectorAll('.sf-device-table').forEach(function (table) {
			var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-device-row:not(.sf-device-head)'));

			rows = rows.map(function (row, index) {
				return { row: row, index: index };
			}).sort(function (left, right) {
				var leftOnline = left.row.getAttribute('data-sort-online') === '1' ? 1 : 0;
				var rightOnline = right.row.getAttribute('data-sort-online') === '1' ? 1 : 0;
				var ipDifference;

				if (leftOnline !== rightOnline)
					return rightOnline - leftOnline;
				ipDifference = rowIpSortValue(left.row) - rowIpSortValue(right.row);
				return ipDifference || left.index - right.index;
			});
			rows.forEach(function (item) { table.appendChild(item.row); });
		});
	}

	return {
		parse: parse,
		load: load,
		get: get,
		statusText: statusText,
		decorateRow: decorateRow,
		sortRows: sortRows
	};
}

return baseclass.extend({ create: create });
