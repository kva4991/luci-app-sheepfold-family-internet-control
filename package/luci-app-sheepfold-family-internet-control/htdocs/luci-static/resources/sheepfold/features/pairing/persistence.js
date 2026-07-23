'use strict';
'require baseclass';

/* §frontmod §persist1 §pairsec §ovaudit3
 * Administrator sections and rights bindings are persisted atomically through the
 * shared UCI mutation. Section names are collision-safe and bound devices are
 * removed from standalone device-target schedules as well as legacy fields.
 */
function create(deps) {
	function value(item) { return typeof item === 'function' ? item() : item; }
	function validateLogin(login) { return /^[A-Za-z0-9_.@+-]{1,64}$/.test(String(login || '').trim()); }
	function hash(text) {
		var result = 2166136261;
		String(text || '').split('').forEach(function (character) {
			result ^= character.charCodeAt(0);
			result = Math.imul(result, 16777619) >>> 0;
		});
		return ('00000000' + result.toString(16)).slice(-8);
	}

	function sectionName(admin) {
		var login = String(admin && admin.login || '').trim();
		var existing = deps.persistence.sections('sheepfold', 'administrator').filter(function (section) {
			return String(section.login || '').trim().toLowerCase() === login.toLowerCase();
		})[0];
		var slug;
		var base;
		var index;
		var candidate;
		var occupied;
		if (!validateLogin(login)) {
			var invalid = new Error('invalid_administrator_login');
			invalid.errorCode = 'invalid_request';
			throw invalid;
		}
		if (existing)
			return existing['.name'];
		slug = login.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'administrator';
		base = login === 'SuperParent' ? 'owner' : 'admin_' + slug + '_' + hash(login.toLowerCase());
		for (index = 1; index <= 999; index++) {
			candidate = index === 1 ? base : base + '_' + index;
			occupied = deps.persistence.sections('sheepfold').filter(function (section) {
				return section['.name'] === candidate;
			})[0] || null;
			if (!occupied)
				return deps.persistence.ensureSection('sheepfold', 'administrator', candidate);
			if (occupied['.type'] === 'administrator' && String(occupied.login || '').trim().toLowerCase() === login.toLowerCase())
				return candidate;
		}
		throw new Error('administrator_section_collision');
	}

	function ensureNewAdministratorLogin(login) {
		var normalized = String(login || '').trim().toLowerCase();
		var duplicate = deps.persistence.sections('sheepfold', 'administrator').some(function (section) {
			return String(section.login || '').trim().toLowerCase() === normalized;
		});
		if (duplicate) {
			var error = new Error('administrator_login_exists');
			error.errorCode = 'administrator_login_exists';
			throw error;
		}
	}

	function stageAdministrator(admin) {
		var section = sectionName(admin);
		deps.uci.set('sheepfold', section, 'id', String(admin.id));
		deps.uci.set('sheepfold', section, 'display_name', admin.name || '');
		deps.uci.set('sheepfold', section, 'login', admin.login || '');
		deps.uci.set('sheepfold', section, 'allow_child_access_requests', admin.allowChildAccessRequests ? '1' : '0');
		deps.uci.set('sheepfold', section, 'role', admin.login === 'SuperParent' ? 'owner' : 'admin');
		return section;
	}

	function saveAdministrator(admin) {
		return deps.persistence.mutate(['sheepfold'], function () {
			return { sectionName: stageAdministrator(admin) };
		}).then(function (mutation) {
			return { persisted: true, runtimeApplied: true, sectionName: mutation.stageResult.sectionName };
		});
	}

	function activate(admin, code) {
		return deps.action({
			key: 'pairing-activate:' + String(admin.login || ''),
			args: ['activate-admin-pairing-code', admin.login || '', code || '', admin.name || admin.login || '', '600'],
			silent: true,
			errorMessage: value(deps.activateError) || 'pairing_activation_failed'
		}).then(function (response) { return response.result; });
	}

	function status(admin, since) {
		return deps.action({
			key: 'pairing-status:' + String(admin.login || ''),
			args: ['admin-pairing-status', admin.login || '', String(since || 0)],
			parse: 'kv', silent: true,
			errorMessage: value(deps.statusError) || 'pairing_status_failed'
		}).then(function (response) { return response.data || {}; });
	}

	function removeDeviceScheduleTargets(ids) {
		var selected = Object.create(null);
		(ids || []).forEach(function (id) { selected[String(id)] = true; });
		deps.persistence.sections('sheepfold', 'schedule').forEach(function (schedule) {
			var targets;
			var remaining;
			if ((schedule.target_type || 'group') !== 'device')
				return;
			targets = deps.listValues(schedule.targets);
			remaining = targets.filter(function (id) { return !selected[String(id)]; });
			if (remaining.length !== targets.length)
				deps.persistence.replaceList('sheepfold', schedule['.name'], 'targets', remaining);
		});
	}

	function stageBindings(admin, selectedDevices, previousIds) {
		var selectedById = Object.create(null);
		var selectedIds = [];
		var notConfigured = value(deps.notConfiguredGroup) || 'Not configured';
		if ((selectedDevices || []).some(function (device) { return !deps.canBind(device); })) {
			var blocked = new Error(value(deps.blocklistedError) || 'blocklisted_device');
			blocked.errorCode = 'device_blocklisted';
			throw blocked;
		}

		(selectedDevices || []).forEach(function (device) {
			var owner = String(device && (device.adminLogin || device.admin_login) || '').trim();
			if ((device.adminDevice || device.admin_device === '1') && owner && owner.toLowerCase() !== String(admin.login || '').toLowerCase()) {
				var assigned = new Error(value(deps.boundElsewhereError) || 'administrator_device_already_bound');
				assigned.errorCode = 'administrator_device_already_bound';
				assigned.adminLogin = owner;
				throw assigned;
			}
		});

		(selectedDevices || []).forEach(function (device) {
			var section = deps.devicePersistence.ensureDeviceSection(device);
			var mac = deps.normalizeMac(device.mac);
			selectedById[String(device.id)] = true;
			selectedIds.push(String(device.id));
			deps.uci.set('sheepfold', section, 'mac', mac);
			deps.uci.set('sheepfold', section, 'name', device.name || mac);
			deps.uci.set('sheepfold', section, 'ip', device.ip || '');
			deps.uci.set('sheepfold', section, 'device_type', device.deviceType || 'phone');
			deps.uci.set('sheepfold', section, 'group', notConfigured);
			deps.uci.set('sheepfold', section, 'schedules', '');
			deps.uci.set('sheepfold', section, 'schedule', '');
			/* SHEEPFOLD_AI_BEGIN */
			deps.uci.set('sheepfold', section, 'activity_log_enabled', '0');
			/* SHEEPFOLD_AI_END */
			deps.uci.set('sheepfold', section, 'status', 'allow');
			deps.uci.set('sheepfold', section, 'admin_device', '1');
			deps.uci.set('sheepfold', section, 'admin_owner', admin.name || '');
			deps.uci.set('sheepfold', section, 'admin_login', admin.login || '');
			deps.devicePersistence.updateMacList('allowlist', mac, true);
			deps.devicePersistence.updateMacList('blocklist', mac, false);
		});
		removeDeviceScheduleTargets(selectedIds);

		(previousIds || []).forEach(function (id) {
			var device = deps.deviceById(id);
			var section;
			if (!device || selectedById[String(id)]) return;
			section = deps.devicePersistence.ensureDeviceSection(device);
			if (deps.uci.get('sheepfold', section, 'admin_login') === admin.login) {
				deps.uci.set('sheepfold', section, 'admin_device', '0');
				deps.uci.set('sheepfold', section, 'admin_owner', '');
				deps.uci.set('sheepfold', section, 'admin_login', '');
			}
		});
		return { selectedIds: selectedIds };
	}

	function persistBindings(admin, selectedDevices, previousIds, includeAdministrator) {
		return deps.devicePersistence.saveAccess(['sheepfold'], function () {
			if (includeAdministrator !== false)
				ensureNewAdministratorLogin(admin && admin.login);
			var administratorSection = includeAdministrator === false ? '' : stageAdministrator(admin);
			var binding = stageBindings(admin, selectedDevices, previousIds);
			binding.administratorSection = administratorSection;
			return binding;
		});
	}

	return {
		validateLogin: validateLogin,
		ensureNewAdministratorLogin: ensureNewAdministratorLogin,
		sectionName: sectionName,
		stageAdministrator: stageAdministrator,
		saveAdministrator: saveAdministrator,
		activate: activate,
		status: status,
		removeDeviceScheduleTargets: removeDeviceScheduleTargets,
		stageBindings: stageBindings,
		persistBindings: persistBindings
	};
}

return baseclass.extend({ create: create });
