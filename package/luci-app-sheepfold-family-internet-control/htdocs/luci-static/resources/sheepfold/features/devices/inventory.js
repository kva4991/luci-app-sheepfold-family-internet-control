'use strict';
'require baseclass';

function normalizeMac(mac) {
	var value = String(mac || '').trim().toUpperCase().replace(/-/g, ':');
	var compact = value.replace(/:/g, '');

	if (/^[0-9A-F]{12}$/.test(compact))
		value = compact.replace(/(..)(?=.)/g, '$1:');

	if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value) || value === '00:00:00:00:00:00')
		return '';

	return value;
}

function listValues(value) {
	if (Array.isArray(value))
		return value;

	if (value == null)
		return [];

	return String(value).split(/\s+/).filter(Boolean);
}

function reservedListSection(name) {
	return ['allowlist', 'blocklist', 'domain_allowlist'].indexOf(String(name || '')) !== -1;
}

function reservedSourceName(name) {
	return /^(arp|dhcp|static)$/i.test(String(name || '').trim());
}

function generatedSectionName(prefix, mac) {
	return prefix + '_' + normalizeMac(mac).toLowerCase().replace(/:/g, '');
}

function addDevice(map, mac, data) {
	var normalizedMac = normalizeMac(mac);
	var current;

	if (!normalizedMac)
		return;

	current = map[normalizedMac] || { mac: normalizedMac, sources: {} };
	if (data.ip && !current.ip)
		current.ip = data.ip;
	if (data.staticIp)
		current.staticIp = data.staticIp;
	if (data.hostname && data.hostname !== '*')
		current.hostname = data.hostname;
	if (data.staticName)
		current.staticName = data.staticName;
	// Имя UCI-секции связывает строку устройства с уже существующей постоянной
	// арендой. Без него редактор создаст вторую секцию host вместо обновления первой. §devinv
	if (data.staticSection)
		current.staticSection = data.staticSection;
	if (data.source)
		current.sources[data.source] = true;

	map[normalizedMac] = current;
}

function parseDhcp(content, map) {
	String(content || '').split(/\n/).forEach(function (line) {
		var fields = line.trim().split(/\s+/);

		if (fields.length < 4)
			return;

		addDevice(map, fields[1], {
			ip: fields[2],
			hostname: fields[3],
			source: 'dhcp'
		});
	});
}

function parseArp(content, map) {
	String(content || '').split(/\n/).slice(1).forEach(function (line) {
		var fields = line.trim().split(/\s+/);

		if (fields.length < 4)
			return;

		addDevice(map, fields[3], { ip: fields[0], source: 'arp' });
	});
}

function addStaticHosts(sections, map) {
	(sections || []).forEach(function (section) {
		var name = section.name || section.hostname || section.dns || '';
		var ip = section.ip || '';
		var sectionName = section['.name'] || '';

		listValues(section.mac).forEach(function (mac) {
			addDevice(map, mac, {
				staticName: name,
				staticIp: ip,
				ip: ip,
				staticSection: sectionName,
				source: 'static'
			});
		});
	});
}

function configuredByMac(sections) {
	var result = {};

	(sections || []).forEach(function (section) {
		var mac = normalizeMac(section.mac);

		if (!mac || reservedListSection(section['.name']))
			return;
		result[mac] = section;
	});

	return result;
}

function listMacs(sections, listName) {
	var result = {};

	(sections || []).forEach(function (section) {
		if (section['.name'] !== listName)
			return;

		listValues(section.mac).concat(listValues(section.macs)).forEach(function (mac) {
			mac = normalizeMac(mac);
			if (mac)
				result[mac] = true;
		});
	});

	return result;
}

function macInList(sections, listName, mac) {
	return !!listMacs(sections, listName)[normalizeMac(mac)];
}

function autoGroupStatus(status, translate) {
	var messages = {
		auto_configuration_disabled: translate('Automatic setup for new devices is disabled.'),
		no_restrictions_assignment_disabled: translate('Automatic assignment to No restrictions is disabled.'),
		no_restrictions_manually_excluded: translate('This device was manually removed from No restrictions and will not be added again automatically.'),
		personal_devices_assignment_disabled: translate('Automatic assignment to Personal devices is disabled.'),
		personal_devices_manually_excluded: translate('This device was manually removed from Personal devices and will not be added again automatically.'),
		unsafe_device_type: translate('This device type is not safe for automatic assignment to No restrictions.'),
		independent_evidence_required: translate('The type is recognized, but automatic assignment to No restrictions still needs a second independent router-side signal.'),
		device_type_confidence_too_low: translate('Device type confidence is still too low for automatic grouping.'),
		device_blocklisted: translate('A device from the device blocklist is never assigned automatically.'),
		another_group_already_selected: translate('The device is already in another group; automatic setup does not replace a parent choice.'),
		assigned: translate('The detected group has been assigned automatically.')
	};

	return messages[String(status || '')] || '';
}

function deviceNote(item, configured, translate) {
	var confidence;
	var groupStatus;

	if (configured && configured.note)
		return configured.note;

	if (configured && configured.detection_reason) {
		confidence = configured.detection_confidence ?
			' (' + translate('Detection confidence') + ': ' + configured.detection_confidence + '%)' : '';
		groupStatus = autoGroupStatus(configured.detection_auto_group_status, translate);
		return translate('Auto-detected') + ': ' + configured.detection_reason + confidence +
			(groupStatus ? '. ' + groupStatus : '');
	}

	if (configured)
		return translate('Configured in Sheepfold');
	if (item.sources.static && (item.sources.dhcp || item.sources.arp))
		return translate('Static DHCP lease, currently online');
	if (item.sources.dhcp)
		return translate('Active DHCP lease');
	if (item.sources.arp)
		return translate('ARP/neighbor entry');
	if (item.sources.static)
		return translate('Static DHCP lease');

	return translate('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.');
}

function build(options) {
	var map = {};
	var configured;
	var allowlist;
	var blocklist;
	var translate = options.translate || function (value) { return value; };

	parseDhcp(options.dhcpLeases, map);
	parseArp(options.arpTable, map);
	addStaticHosts(options.staticHosts, map);
	configured = configuredByMac(options.deviceSections);

	Object.keys(configured).forEach(function (mac) {
		var section = configured[mac];

		if (!map[mac]) {
			map[mac] = {
				mac: mac,
				ip: section.ip || '',
				hostname: section.name || '',
				staticName: section.name || '',
				sources: {}
			};
		}
	});

	allowlist = listMacs(options.listSections, 'allowlist');
	blocklist = listMacs(options.listSections, 'blocklist');

	return Object.keys(map).sort(function (left, right) {
		var leftDevice = map[left];
		var rightDevice = map[right];
		var leftOnline = leftDevice.sources.dhcp || leftDevice.sources.arp ? 1 : 0;
		var rightOnline = rightDevice.sources.dhcp || rightDevice.sources.arp ? 1 : 0;
		var leftName = leftDevice.staticName || leftDevice.hostname || left;
		var rightName = rightDevice.staticName || rightDevice.hostname || right;

		return leftOnline !== rightOnline ? rightOnline - leftOnline : leftName.localeCompare(rightName);
	}).map(function (mac, index) {
		var item = map[mac];
		var section = configured[mac];
		var status = section && section.status ? section.status : 'new';
		var adminDevice = section && section.admin_device === '1';
		var groupName = section && section.group ?
			options.normalizeGroupName(section.group) : options.notConfiguredGroup;
		var group = options.groupSectionByName(groupName);
		var deviceType = section && (section.device_type || section.detected_type) || 'unknown';

		if (allowlist[mac])
			status = 'allow';
		// Повреждённый или вручную изменённый UCI может содержать MAC в обоих списках.
		// В runtime чёрный список устройств обязан оставаться сильнее белого списка.
		if (blocklist[mac])
			status = 'blocked';

		return {
			id: String(section && section.id || index + 1),
			// Старые версии иногда сохраняли технический источник dhcp/arp как имя.
			// Показываем пользователю имя постоянной аренды или реальный hostname. §devinv
			name: section && section.name && !reservedListSection(section.name) && !reservedSourceName(section.name) ?
				section.name : (item.staticName || item.hostname || translate('Unknown device')),
			ip: section && section.ip ? section.ip : (item.ip || item.staticIp || ''),
			mac: mac,
			hostname: item.hostname || '',
			staticIp: item.staticIp || '',
			staticLease: !!item.sources.static,
			staticSection: item.staticSection || '',
			configSection: section && section['.name'],
			sourceLabel: Object.keys(item.sources).map(function (source) {
				return source === 'dhcp' ? translate('Active DHCP lease') :
					source === 'arp' ? translate('ARP/neighbor entry') : translate('Static DHCP lease');
			}).join(', '),
			group: groupName,
			deviceType: deviceType,
			manualDeviceType: section && section.manual_device_type === '1',
			detectionConfidence: section && section.detection_confidence,
			detectionReason: section && section.detection_reason,
			autoGroupAssigned: section && section.auto_group_assigned === '1',
			noRestrictionsAutoExcluded: section && section.no_restrictions_auto_excluded === '1',
			personalDevicesAutoExcluded: section && section.personal_devices_auto_excluded === '1',
			autoGroupStatus: section && section.detection_auto_group_status,
			status: status,
			statusBadge: options.statusBadge(status, section),
			note: deviceNote(item, section, translate),
			adminDevice: adminDevice,
			adminOwner: section && section.admin_owner,
			adminLogin: section && section.admin_login,
			groupAllowlistOnly: group && group.allowlist_only === '1',
			/* SHEEPFOLD_AI_BEGIN */
			activityLogEnabled: !adminDevice && status !== 'allow' && status !== 'blocked' && (
				section && section.activity_log_enabled === '1' ||
				group && group.activity_log_enabled === '1'
			)
			/* SHEEPFOLD_AI_END */
		};
	});
}

return baseclass.extend({
	normalizeMac: normalizeMac,
	listValues: listValues,
	reservedListSection: reservedListSection,
	reservedSourceName: reservedSourceName,
	generatedSectionName: generatedSectionName,
	parseDhcp: parseDhcp,
	parseArp: parseArp,
	listMacs: listMacs,
	macInList: macInList,
	build: build
});
