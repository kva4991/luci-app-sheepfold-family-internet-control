'use strict';
'require view';
'require view.sheepfold.overview-secure as secureOverview';
'require view.sheepfold.overview as overview';
'require uci';
'require ui';
'require fs';
'require sheepfold.features.devices.inventory as deviceInventory';

/*
 * secureOverview нужен как зависимость: он патчит базовый overview до того,
 * как personal-wrapper добавит водяные знаки и presence-декор.
 */
var renderGroups = overview.renderGroups;
var renderUsers = overview.renderUsers;
var presenceByMac = {};
var presencePromise = null;

function normalizedGroupName(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeMac(value) {
	value = String(value || '').trim().toUpperCase();
	return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value) ? value : '';
}

function macFromDeviceRow(row) {
	var match = String(row && row.textContent || '').toUpperCase().match(/(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/);

	return match ? normalizeMac(match[0]) : '';
}

function ensurePersonalGroupStylesheet() {
	var stylesheetId = 'sheepfold-personal-groups-css';
	var assetVersion;
	var link;

	if (document.getElementById(stylesheetId))
		return;

	assetVersion = uci.get('sheepfold', 'global', 'ui_asset_version') || '0';
	link = E('link', {
		'id': stylesheetId,
		'rel': 'stylesheet',
		'href': L.resource('sheepfold/sheepfold-personal-groups.css') + '?v=' + encodeURIComponent(assetVersion)
	});
	document.head.appendChild(link);
}

function personalGroupNames() {
	var names = {
		'ребёнок номер 1': true,
		'ребенок номер 1': true,
		'первый ребёнок': true,
		'первый ребенок': true,
		'child number 1': true
	};

	uci.sections('sheepfold', 'group', function(section) {
		if (section.personal === '1')
			names[normalizedGroupName(section.name || section['.name'])] = true;
	});

	return names;
}

function personalGroupWatermark() {
	return E('span', {
		'class': 'sf-group-person-watermark',
		'aria-hidden': 'true'
	}, [
		E('span', { 'class': 'sf-group-person-watermark-head' }),
		E('span', { 'class': 'sf-group-person-watermark-body' })
	]);
}

function deviceSectionByMac(mac) {
	var wanted = normalizeMac(mac);
	var found = null;

	if (!wanted)
		return null;

	uci.sections('sheepfold', 'device', function(section) {
		if (!found && normalizeMac(section.mac) === wanted)
			found = section;
	});

	return found;
}

function listValues(value) {
	return Array.isArray(value) ? value : String(value || '').split(/\s+/).filter(Boolean);
}

function deviceIsBlocklisted(section, mac) {
	var blocked = false;

	if (section && /^(?:blocked|block)$/.test(String(section.status || '')))
		return true;
	uci.sections('sheepfold', 'list', function(list) {
		if (list['.name'] !== 'blocklist')
			return;
		blocked = listValues(list.mac).concat(listValues(list.macs)).some(function(value) {
			return normalizeMac(value) === normalizeMac(mac);
		});
	});
	return blocked;
}

function evidenceLabel(value) {
	var labels = {
		'name': 'имя устройства',
		'owner_configured': 'статическая DHCP-запись',
		'dhcp': 'DHCP-отпечаток',
		'oui': 'производитель MAC',
		'mdns': 'mDNS/DNS-SD',
		'upnp': 'SSDP/UPnP',
		'wsd': 'WS-Discovery',
		'ports': 'сетевые сервисы'
	};

	return labels[value] || value;
}

function evidenceText(section) {
	var evidence = String(section && section.detection_evidence || '')
		.split(',')
		.map(function(value) { return value.trim(); })
		.filter(Boolean)
		.map(evidenceLabel);

	return evidence.length ? evidence.join(', ') : 'нет данных';
}

function commaList(value) {
	var items = String(value || '')
		.split(',')
		.map(function(item) { return item.trim(); })
		.filter(Boolean);

	return items.length ? items.join(', ') : 'нет данных';
}

function competingEvidenceText(value) {
	var typeLabels = {
		computer: 'компьютер', phone: 'телефон', tablet: 'планшет', printer: 'принтер',
		camera: 'камера', server: 'сервер', network: 'сетевое устройство',
		speaker: 'умная колонка', smart_home: 'умный дом'
	};

	return String(value || '').split(',').map(function(marker) {
		var parts = marker.trim().split(':');
		if (parts.length < 2)
			return '';
		return evidenceLabel(parts[0]) + ': ' + (typeLabels[parts[1]] || parts[1]);
	}).filter(Boolean).join('; ') || 'нет противоречий';
}

function detectionLine(label, value) {
	return E('div', { 'class': 'sf-device-detection-row' }, [
		E('span', {}, label),
		E('code', {}, String(value == null || value === '' ? 'нет данных' : value))
	]);
}

function detectionDetails(section) {
	var confidence = parseInt(section && section.detection_confidence || '0', 10) || 0;
	var manual = section && section.manual_device_type === '1';
	var intro;

	if (!section) {
		intro = 'Данные автоопределения появятся после первого сканирования устройства.';
	} else if (section.identity_quarantine_mode) {
		intro = _('The current connection strongly differs from the trusted fingerprint. The device saved rights are preserved, while this connection is temporarily isolated.');
	} else if (manual) {
		intro = 'Тип устройства выбран вручную. Кнопка «Определить заново» снимет ручную фиксацию и снова запустит автоопределение.';
	} else if (!section.detected_type && !section.detection_confidence && !section.detection_evidence) {
		intro = 'Автоматическое определение ещё не выполнено.';
	} else {
		intro = 'Здесь показан результат определения. Положительные технические баллы скрыты; родителю показываются только противоречия, требующие внимания.';
	}

	return E('section', { 'class': 'sf-device-detection-modal' }, [
		E('h4', {}, 'Данные автоопределения'),
		E('p', { 'class': 'sf-device-detection-intro' }, intro),
		E('div', { 'class': 'sf-device-detection-grid' }, [
			detectionLine('IP-адрес', section && section.ip || 'нет данных'),
			detectionLine('Определённый тип', section ? deviceInventory.effectiveDeviceType(section) : 'нет данных'),
			detectionLine('Уверенность типа', confidence ? confidence + '%' : 'нет данных'),
			detectionLine('Противоречащие признаки', competingEvidenceText(section && section.detection_competing_evidence)),
			detectionLine(_('Connection identity check'), section && section.identity_quarantine_mode ?
				(section.identity_quarantine_mode === 'block' ? _('Quarantine: blocked') : _('Quarantine: restricted')) : _('Matched or not enough stable evidence'))
		])
	]);
}

function commandErrorText(error, fallback) {
	if (!error)
		return fallback;

	return String(error.stderr || error.stdout || error.message || fallback).trim();
}

function parsePresenceOutput(text) {
	var result = {};

	String(text || '').split(/\r?\n/).forEach(function(line) {
		var fields = line.split('\t');
		var mac = normalizeMac(fields[0]);
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

function loadDevicePresence(force) {
	if (force)
		presencePromise = null;

	if (presencePromise)
		return presencePromise;

	presencePromise = fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', ['--luci', 'device-presence', 'list']).then(function(result) {
		var code = Number(result && result.code || 0);

		if (code !== 0)
			throw new Error(String(result && (result.stderr || result.stdout) || 'Не удалось получить статус устройств.'));

		presenceByMac = parsePresenceOutput(result && result.stdout || '');
		return presenceByMac;
	}).catch(function() {
		presenceByMac = {};
		return presenceByMac;
	});

	return presencePromise;
}

function presenceForMac(mac) {
	mac = normalizeMac(mac);
	return presenceByMac[mac] || {
		mac: mac,
		lastSeen: 0,
		online: false,
		ip: ''
	};
}

function padDatePart(value) {
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
		padDatePart(date.getDate()),
		padDatePart(date.getMonth() + 1),
		date.getFullYear()
	].join('.') + ' ' + padDatePart(date.getHours()) + ':' + padDatePart(date.getMinutes());
}

function presenceStatusText(presence) {
	var lastSeenText;

	if (presence.online)
		return _('Online: now (seen in the last 15 minutes)');

	lastSeenText = formatLastSeen(presence.lastSeen);
	return lastSeenText ?
		_('Online: last seen %s').replace('%s', lastSeenText) :
		_('Online: no presence data yet');
}

function onlineBadge() {
	return E('span', { 'class': 'sf-online-badge' }, _('Online'));
}

function statusCellForRow(row, actions) {
	return actions && actions.previousElementSibling ? actions.previousElementSibling : null;
}

function decoratePresenceForRow(row, mac, actions) {
	var presence = presenceForMac(mac);
	var statusCell = statusCellForRow(row, actions);
	var oldRow = row.querySelector('.sf-online-badge-row');

	row.setAttribute('data-sort-online', presence.online ? '1' : '0');
	if (oldRow)
		oldRow.remove();

	if (presence.online && statusCell)
		statusCell.appendChild(E('div', { 'class': 'sf-online-badge-row' }, onlineBadge()));
}

function rowIpSortValue(row) {
	var value = Number(row.getAttribute('data-sort-ip'));

	return isNaN(value) || value < 0 ? Number.MAX_SAFE_INTEGER : value;
}

function sortDeviceRowsByPresence(root) {
	root.querySelectorAll('.sf-device-table').forEach(function(table) {
		var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-device-row:not(.sf-device-head)'));

		rows = rows.map(function(row, index) {
			return { row: row, index: index };
		}).sort(function(left, right) {
			var leftOnline = left.row.getAttribute('data-sort-online') === '1' ? 1 : 0;
			var rightOnline = right.row.getAttribute('data-sort-online') === '1' ? 1 : 0;
			var ipDifference;

			if (leftOnline !== rightOnline)
				return rightOnline - leftOnline;

			ipDifference = rowIpSortValue(left.row) - rowIpSortValue(right.row);
			return ipDifference || left.index - right.index;
		});

		rows.forEach(function(item) {
			table.appendChild(item.row);
		});
	});
}

function reclassifyDevice(mac, button, trustCurrent) {
	var spinner = E('span', { 'class': 'sf-spinner' });
	var status = E('p', {}, 'Собираются актуальные признаки устройства…');
	var output = E('pre', { 'class': 'sf-pre' }, 'Подготовка повторного определения.');
	var closeButton = E('button', {
		'class': 'btn cbi-button',
		'hidden': 'hidden',
		'click': function(event) {
			event.preventDefault();
			ui.hideModal();
		}
	}, 'Закрыть');

	if (trustCurrent && !window.confirm(_('The current identifiers do not match the trusted fingerprint. Continue only if you recognize this device. The current fingerprint will become trusted and the quarantine will be removed.')))
		return;

	button.disabled = true;
	ui.showModal('Повторное определение устройства', [
		E('div', { 'class': 'sf-update-progress' }, [spinner, status]),
		output,
		E('div', { 'class': 'right sf-modal-actions' }, [closeButton])
	]);

	fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', ['--luci', 'device-reclassify', mac]).then(function(result) {
		var code = Number(result && result.code || 0);
		var text = String(result && (result.stdout || result.stderr) || '').trim();

		if (code !== 0)
			throw new Error(text || 'Команда завершилась с ошибкой.');

		spinner.className = 'sf-spinner sf-spinner-done';
		status.textContent = 'Устройство определено заново.';
		output.textContent = text || mac;
		window.setTimeout(function() {
			ui.hideModal();
			window.location.reload();
		}, 900);
	}).catch(function(error) {
		spinner.className = 'sf-spinner sf-spinner-failed';
		status.textContent = 'Не удалось определить устройство заново.';
		output.textContent = commandErrorText(error, 'Неизвестная ошибка.');
		closeButton.hidden = false;
		button.disabled = false;
	});
}

function decorateDeviceSettingsModal(mac, attempt) {
	var actionRows;
	var actions;
	var modal;
	var editor;
	var text;
	var section;
	var oldDetails;
	var oldLeft;
	var reclassifyButton;
	var leftPanel;
	var isBlocklisted;
	var trustCurrent;

	attempt = attempt || 0;
	actionRows = document.querySelectorAll('.sf-modal-actions');
	actions = actionRows.length ? actionRows[actionRows.length - 1] : null;
	modal = document.getElementById('modal_overlay') || (actions && actions.closest('.modal, .cbi-modal'));
	text = String(modal && modal.textContent || '');

	if (!actions || !modal || !/(Настройки устройства|Device settings)/i.test(text)) {
		if (attempt < 20)
			window.setTimeout(function() { decorateDeviceSettingsModal(mac, attempt + 1); }, 50);
		return;
	}

	editor = modal.querySelector('.sf-device-editor');
	section = deviceSectionByMac(mac);
	isBlocklisted = deviceIsBlocklisted(section, mac);
	trustCurrent = !!(section && section.identity_quarantine_mode);
	oldDetails = modal.querySelector('.sf-device-detection-modal');
	oldLeft = actions.querySelector('.sf-device-settings-left');

	if (oldDetails)
		oldDetails.remove();
	if (oldLeft)
		oldLeft.remove();
	if (editor)
		editor.appendChild(detectionDetails(section));

	reclassifyButton = isBlocklisted ? null : E('button', {
		'class': 'sf-action sf-action-neutral sf-device-reclassify',
		'type': 'button',
		'data-device-reclassify': mac,
		'disabled': section ? null : 'disabled',
		'title': section ? (trustCurrent ?
			_('Trust this connection, remove quarantine, and detect the device type again') :
			'Снять ручную фиксацию, собрать признаки и определить тип заново') :
			'Сначала сохраните настройки устройства',
		'click': function(event) {
			event.preventDefault();
			reclassifyDevice(mac, event.currentTarget, trustCurrent);
		}
	}, trustCurrent ? _('Trust current connection') : 'Определить заново');

	leftPanel = E('div', { 'class': 'sf-device-settings-left' }, [
		E('div', { 'class': 'sf-device-presence-modal-status' }, presenceStatusText(presenceForMac(mac))),
		reclassifyButton || ''
	]);
	actions.classList.add('sf-device-settings-actions');
	actions.insertBefore(leftPanel, actions.firstChild);
}

function bindSettingsModal(mac, actions) {
	var button = actions && actions.querySelector('.sf-icon-action-neutral');

	if (!button || button.getAttribute('data-presence-bound') === '1')
		return;

	button.setAttribute('data-presence-bound', '1');
	button.addEventListener('click', function() {
		loadDevicePresence(true).then(function() {
			decorateDeviceSettingsModal(mac, 0);
		});
	});
}

function decorateDeviceRows(root) {
	root.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function(row) {
		var cells = row.children;
		var mac = macFromDeviceRow(row);
		var actions = row.querySelector('.sf-row-actions') || cells[cells.length - 1];
		var oldEvidence = row.querySelector('.sf-detection-evidence');
		var oldReclassify = actions && actions.querySelector('[data-device-reclassify]');

		if (!mac || !actions)
			return;

		// Диагностика и повторное определение больше не занимают место возле устройства:
		// они показываются внизу окна «Настройки устройства».
		if (oldEvidence)
			oldEvidence.remove();
		if (oldReclassify)
			oldReclassify.remove();

		decoratePresenceForRow(row, mac, actions);
		bindSettingsModal(mac, actions);
	});
}

overview.renderGroups = function() {
	var node = renderGroups.apply(this, arguments);
	var personalNames = personalGroupNames();

	ensurePersonalGroupStylesheet();
	node.querySelectorAll('.sf-group-box').forEach(function(card) {
		var title = card.querySelector('.sf-group-title');
		var groupName = normalizedGroupName(title && title.textContent);

		if (!personalNames[groupName])
			return;

		card.classList.add('sf-group-box-personal');
		card.appendChild(personalGroupWatermark());
	});

	return node;
};

overview.renderUsers = function() {
	var node = renderUsers.apply(this, arguments);

	ensurePersonalGroupStylesheet();
	decorateDeviceRows(node);
	loadDevicePresence(false).then(function() {
		decorateDeviceRows(node);
		sortDeviceRowsByPresence(node);
	});
	return node;
};

return view.extend({
	load: function() {
		return overview.load ? overview.load.apply(overview, arguments) : null;
	},

	render: function() {
		return overview.render.apply(overview, arguments);
	}
});
