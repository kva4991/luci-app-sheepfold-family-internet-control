'use strict';
'require baseclass';

/* §frontmod §ovfinal1
 * Pure-ish group naming, aliases, colors and lookup helpers shared by device,
 * schedule and group controllers. Only explicit exclusion markers write UCI.
 */
var DEFAULT_SECTION_IDS = ['no_restrictions', 'child_1', 'personal_devices'];
var LEGACY_ALIASES = {
	'No restrictions': 'no_restrictions',
	'Без ограничений': 'no_restrictions',
	'不受限制': 'no_restrictions',
	'First child': 'child_1',
	'Child number 1': 'child_1',
	'Первый ребёнок': 'child_1',
	'Ребёнок номер 1': 'child_1',
	'第一个孩子': 'child_1',
	'Personal devices': 'personal_devices',
	'Персональные устройства': 'personal_devices',
	'个人设备': 'personal_devices'
};

function create(deps) {
	function defaultDisplayName(sectionId, fallback) {
		return String(deps.get('sheepfold', sectionId, 'name', '') || fallback || '').trim();
	}

	function noRestrictionsName() {
		return defaultDisplayName('no_restrictions', 'No restrictions');
	}

	function personalDevicesName() {
		return defaultDisplayName('personal_devices', _('Personal devices'));
	}

	function normalize(name) {
		var trimmed = String(name || '').trim();

		if (!trimmed || trimmed === deps.notConfigured || trimmed === 'Не настроено')
			return deps.notConfigured;
		if (LEGACY_ALIASES[trimmed])
			return defaultDisplayName(LEGACY_ALIASES[trimmed], trimmed);
		return trimmed;
	}

	function display(name) {
		var normalized = normalize(name);
		return !normalized || normalized === deps.notConfigured ? _('Not configured') : normalized;
	}

	function sectionByName(name) {
		var normalized = normalize(name);
		return deps.sections('sheepfold', 'group').filter(function (section) {
			return normalize(section.name || section['.name']) === normalized;
		})[0] || null;
	}

	function sectionName(name) {
		var section = sectionByName(name);
		return section ? section['.name'] : '';
	}

	function options() {
		var result = [[deps.notConfigured, _('Not configured')]];

		deps.sections('sheepfold', 'group').forEach(function (section) {
			var name = normalize(section.name);
			if (name)
				result.push([name, name]);
		});
		return result;
	}

	function validColor(value) {
		return /^#[0-9a-f]{6}$/i.test(String(value || ''));
	}

	function palette() {
		return ['#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#ede9fe', '#fce7f3', '#cffafe', '#e2e8f0'];
	}

	function automaticColor(name) {
		var values = palette();
		return values[deps.groupModel.hash(name) % values.length];
	}

	function usedColors() {
		var used = Object.create(null);
		deps.sections('sheepfold', 'group').forEach(function (section) {
			if (validColor(section.color))
				used[section.color.toLowerCase()] = true;
		});
		return used;
	}

	function nextAvailableColor(name) {
		var used = usedColors();
		var result = '';
		palette().some(function (color) {
			if (used[color.toLowerCase()])
				return false;
			result = color;
			return true;
		});
		return result || automaticColor(name);
	}

	function color(name, section) {
		return section && validColor(section.color) ? section.color : automaticColor(name);
	}

	function markNoRestrictionsExcluded(sectionNameValue) {
		if (!sectionNameValue)
			return;
		deps.uci.set('sheepfold', sectionNameValue, 'no_restrictions_auto_excluded', '1');
		deps.uci.set('sheepfold', sectionNameValue, 'auto_group_assigned', '0');
	}

	function markPersonalDevicesExcluded(sectionNameValue) {
		if (!sectionNameValue)
			return;
		deps.uci.set('sheepfold', sectionNameValue, 'personal_devices_auto_excluded', '1');
		deps.uci.set('sheepfold', sectionNameValue, 'auto_group_assigned', '0');
	}

	function ensureDefaultSections(grouped, groupSections) {
		DEFAULT_SECTION_IDS.forEach(function (sectionId) {
			var section = deps.sections('sheepfold', 'group').filter(function (item) {
				return item['.name'] === sectionId;
			})[0];
			var displayName;

			if (!section)
				return;
			displayName = normalize(section.name || defaultDisplayName(sectionId, sectionId));
			if (!grouped[displayName])
				grouped[displayName] = [];
			groupSections[displayName] = section;
		});
	}

	function supplement(grouped, devices) {
		var byMac = Object.create(null);

		(devices || []).forEach(function (device) {
			var mac = deps.normalizeMac(device && device.mac);
			if (mac) byMac[mac] = device;
		});
		deps.sections('sheepfold', 'device').forEach(function (section) {
			var mac = deps.normalizeMac(section.mac);
			var groupName;
			var entry;
			var listed;

			if (!mac || deps.reservedListSection(section['.name']))
				return;
			groupName = section.group ? normalize(section.group) : '';
			if (!groupName || groupName === deps.notConfigured)
				return;
			if (!grouped[groupName])
				grouped[groupName] = [];
			listed = grouped[groupName].some(function (device) { return deps.normalizeMac(device && device.mac) === mac; });
			if (listed)
				return;
			entry = byMac[mac] || {
				id: deps.generatedSectionName('device', mac),
				name: section.name || mac,
				mac: mac,
				group: groupName
			};
			grouped[groupName].push(entry);
		});
	}

	function currentDeviceIds(name, devices) {
		return (devices || []).filter(function (device) {
			return normalize(device.group) === name;
		}).map(function (device) { return device.id; });
	}

	function nameExists(newName, oldName) {
		return newName !== oldName && deps.sections('sheepfold', 'group').some(function (item) {
			return normalize(item.name || item['.name']) === newName;
		});
	}

	return {
		defaultDisplayName: defaultDisplayName,
		noRestrictionsName: noRestrictionsName,
		personalDevicesName: personalDevicesName,
		normalize: normalize,
		display: display,
		sectionByName: sectionByName,
		sectionName: sectionName,
		options: options,
		validColor: validColor,
		palette: palette,
		automaticColor: automaticColor,
		nextAvailableColor: nextAvailableColor,
		color: color,
		markNoRestrictionsExcluded: markNoRestrictionsExcluded,
		markPersonalDevicesExcluded: markPersonalDevicesExcluded,
		ensureDefaultSections: ensureDefaultSections,
		supplement: supplement,
		currentDeviceIds: currentDeviceIds,
		nameExists: nameExists
	};
}

return baseclass.extend({ create: create });
