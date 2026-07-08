'use strict';
'require view.sheepfold.overview-secure as overview';
'require uci';
'require ui';
'require fs';

var renderGroups = overview.renderGroups;
var renderUsers = overview.renderUsers;

function normalizedGroupName(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeMac(value) {
	value = String(value || '').trim().toUpperCase();
	return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value) ? value : '';
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

function evidenceLabel(value) {
	var labels = {
		'name': 'имя устройства',
		'owner_configured': 'статическая DHCP-запись',
		'dhcp': 'DHCP-отпечаток',
		'oui': 'производитель MAC',
		'mdns': 'mDNS/DNS-SD',
		'ports': 'сетевые сервисы'
	};

	return labels[value] || value;
}

function detectionSummary(section) {
	var evidence;
	var score;
	var confidence;
	var denied;
	var parts = [];

	if (section.manual_device_type === '1')
		return 'Тип устройства выбран вручную; автоматическое определение отключено.';

	if (!section.detected_type && !section.detection_confidence && !section.detection_evidence)
		return 'Автоматическое определение ещё не выполнено.';

	evidence = String(section.detection_evidence || '').split(',').filter(Boolean).map(evidenceLabel);
	score = parseInt(section.detection_auto_group_score || '0', 10) || 0;
	confidence = parseInt(section.detection_confidence || '0', 10) || 0;
	denied = section.detection_hard_deny === '1';

	if (confidence)
		parts.push('уверенность типа ' + confidence + '%');

	if (denied)
		parts.push('автоматическое доверие запрещено');
	else
		parts.push('балл автодоверия ' + score + '/100');

	if (evidence.length)
		parts.push('признаки: ' + evidence.join(', '));

	if (section.detection_oui_vendor)
		parts.push('производитель: ' + section.detection_oui_vendor);

	if (section.detection_mdns_services)
		parts.push('mDNS: ' + section.detection_mdns_services);

	return parts.join('; ');
}

function commandErrorText(error, fallback) {
	if (!error)
		return fallback;

	return String(error.stderr || error.stdout || error.message || fallback).trim();
}

function reclassifyDevice(mac, button) {
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

	button.disabled = true;
	ui.showModal('Повторное определение устройства', [
		E('div', { 'class': 'sf-update-progress' }, [spinner, status]),
		output,
		E('div', { 'class': 'right sf-modal-actions' }, [closeButton])
	]);

	fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', ['device-reclassify', mac]).then(function(result) {
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

function decorateDeviceRows(root) {
	root.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function(row) {
		var cells = row.children;
		var mac = normalizeMac(cells[4] && cells[4].textContent);
		var section = deviceSectionByMac(mac);
		var nameCell = cells[1];
		var actions = cells[cells.length - 1];
		var summary;
		var button;

		if (!section || !nameCell || !actions)
			return;

		summary = detectionSummary(section);
		if (summary && !nameCell.querySelector('.sf-detection-evidence'))
			nameCell.appendChild(E('small', { 'class': 'sf-detection-evidence' }, summary));

		if (actions.querySelector('[data-device-reclassify]'))
			return;

		button = E('button', {
			'class': 'sf-action sf-action-neutral sf-device-reclassify',
			'type': 'button',
			'data-device-reclassify': mac,
			'disabled': section.manual_device_type === '1' ? 'disabled' : null,
			'title': section.manual_device_type === '1' ?
				'Тип выбран вручную. Сначала верните тип «Неизвестно».' :
				'Собрать признаки и определить тип заново',
			'click': function(event) {
				event.preventDefault();
				reclassifyDevice(mac, event.currentTarget);
			}
		}, 'Определить заново');
		actions.appendChild(button);
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
	return node;
};

return overview;
