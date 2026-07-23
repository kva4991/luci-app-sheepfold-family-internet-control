'use strict';
'require baseclass';
'require ui';

/* §frontmod §ovfinal1 §pairsec §ovaudit3
 * Контроллер администраторов отвечает за показ и координацию сопряжения. После
 * сохранения прав он всегда перечитывает реальный список устройств роутера;
 * ошибка только runtime-шага не выдаётся за полный откат операции.
 */
function create(deps) {
	function idNumber(value) {
		var parsed = parseInt(String(value || ''), 10);
		return isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
	}
	function administrators() { return deps.administrators(); }
	function devices() { return deps.devices(); }
	function load() {
		var sections = deps.sections('sheepfold', 'administrator');
		if (sections.length)
			deps.replaceAdministrators(deps.model.fromSections(sections, devices(), idNumber));
		return administrators();
	}
	function nextId() { return deps.model.nextId(administrators(), idNumber); }
	function loginExists(login) { return deps.model.loginExists(administrators(), login); }
	function validateLogin(login) { return deps.persistence.validateLogin(login); }
	function isAdminDevice(device) { return !!(device && (device.adminDevice || device.admin_device === '1')); }
	function firstBySmallestId() {
		return administrators().slice().sort(function (left, right) { return idNumber(left.id) - idNumber(right.id); })[0] || null;
	}
	function byDeepLink(value) {
		var normalized = String(value || '').trim().toLowerCase();
		return administrators().filter(function (admin) {
			return String(admin.id || '').toLowerCase() === normalized || String(admin.login || '').toLowerCase() === normalized;
		})[0] || firstBySmallestId();
	}
	function assignedDeviceIds(excludedAdmin) {
		var assigned = Object.create(null);
		administrators().forEach(function (admin) {
			if (excludedAdmin && admin === excludedAdmin) return;
			(admin.deviceIds || []).forEach(function (id) { assigned[id] = true; });
		});
		return assigned;
	}
	function canBind(device) {
		return !!device && device.status !== 'blocked' && !(deps.isBlocklisted && deps.isBlocklisted(device));
	}
	function deviceList(admin) {
		var entries = (admin.deviceIds || []).map(function (id) { return deps.deviceById(id); }).filter(Boolean);
		if (!entries.length)
			return E('span', { 'class': 'sf-muted' }, _('No administrator devices'));
		return E('div', { 'class': 'sf-admin-device-list' }, entries.map(function (device) {
			return E('span', { 'class': 'sf-admin-device-chip' }, [
				deps.identityIcon(device), E('span', {}, deps.displayDeviceId(device) + ' ' + (device.name || device.mac))
			]);
		}));
	}
	function sortHeader(label, key) {
		return deps.table.sortHeader(label, key, {
			className: 'sf-device-sort sf-admin-sort', tableSelector: '.sf-admin-table',
			rowSelector: '.sf-admin-row:not(.sf-admin-head)', buttonSelector: '.sf-admin-sort'
		});
	}
	function updateRow(admin) {
		document.querySelectorAll('.sf-admin-row').forEach(function (row) {
			if (row.getAttribute('data-admin-login') === String(admin.login || '')) row.replaceWith(renderRow(admin));
		});
	}
	function findDeviceByMac(mac) {
		var normalized = deps.normalizeMac(mac);
		return devices().filter(function (device) { return deps.normalizeMac(device.mac) === normalized; })[0] || null;
	}

	function reloadAndRefreshDevices() {
		return Promise.resolve().then(function () { return deps.reloadDevices(); }).then(function () {
			load();
			deps.refreshDevices();
			return { administrators: administrators(), devices: devices() };
		});
	}

	function persistedRefresh(error) {
		return reloadAndRefreshDevices().then(function () {
			return { refreshed: true };
		}, function (refreshError) {
			error.refreshFailed = true;
			error.refreshError = refreshError;
			return { refreshed: false, error: refreshError };
		});
	}

	function startWatcher(admin, since) {
		var startedAt = Date.now();
		var timer = null;
		var stopped = false;
		function stop() { stopped = true; if (timer) window.clearTimeout(timer); }
		function check() {
			if (stopped) return;
			if (Date.now() - startedAt > 10 * 60 * 1000) { stop(); return; }
			deps.persistence.status(admin, since).then(function (status) {
				if (stopped) return;
				if (status.paired !== '1') { timer = window.setTimeout(check, 2000); return; }
				stopped = true;
				return reloadAndRefreshDevices().then(function () {
					var refreshedAdmin = administrators().filter(function (item) {
						return String(item.login || '') === String(admin.login || '');
					})[0] || admin;
					var device = findDeviceByMac(status.mac);

					if (!device) {
						stopped = false;
						deps.notify(
							_('The phone was paired, but the router has not published the device card yet. Retrying.'),
							'warning'
						);
						timer = window.setTimeout(check, 3000);
						return;
					}

					updateRow(refreshedAdmin);
					ui.hideModal();
					deps.notifyCentered(
						_('A device was successfully paired with administrator') + ' ' +
						(status.admin_name || refreshedAdmin.name || refreshedAdmin.login) + ': ' +
						(device.name || status.device_name || status.mac || '')
					);
				}, function (error) {
					stopped = false;
					deps.notify(deps.errorText(error, _('The phone was paired, but the device list could not be refreshed.')), 'warning');
					timer = window.setTimeout(check, 3000);
				});
			}, function () { if (!stopped) timer = window.setTimeout(check, 3000); });
		}
		timer = window.setTimeout(check, 1500);
		return stop;
	}

	function loadTlsFingerprint() {
		return deps.run(['tls-public-key-fingerprint']).then(function (result) {
			var values;
			var fingerprint;
			deps.ensureOk(result, _('Could not read the router TLS public-key fingerprint.'));
			values = deps.parseKeyValues(result.stdout || '');
			fingerprint = String(values.fingerprint || '').trim().toLowerCase();
			if (values.algorithm !== 'sha256-spki' || !/^[0-9a-f]{64}$/.test(fingerprint))
				throw new Error(_('The router returned an invalid TLS public-key fingerprint.'));
			return fingerprint;
		});
	}

	function showSettings(admin) {
		var address = deps.discovery.routerAddress(window.location);
		var port = deps.get('sheepfold', 'global', 'app_port', '5201');
		var apiUrl = 'https://' + deps.discovery.urlHost(address) + ':' + port + '/cgi-bin/sheepfold-api';
		var temporaryPassword = deps.random.pairingCode();
		var stopWatcher = null;
		function openActivated(fingerprint) {
			stopWatcher = startWatcher(admin, Math.floor(Date.now() / 1000));
			deps.editor.openSettings({
				checkboxControl: deps.forms.checkboxControl, inputControl: deps.forms.inputControl,
				passwordRevealField: deps.passwordRevealField, settingLine: deps.settingLine
			}, admin, {
				qrNode: deps.qrCode(deps.discovery.pairingPayload(address, port, admin.login, temporaryPassword, fingerprint)),
				temporaryPassword: temporaryPassword, apiUrl: apiUrl, routerAddress: address, port: port
			}, {
				close: function () { if (stopWatcher) stopWatcher(); ui.hideModal(); },
				save: function (form, button) {
					var previous = admin.allowChildAccessRequests;
					admin.allowChildAccessRequests = form.allowChildAccessRequests;
					return deps.actions.execute({
						key: 'administrator-settings:' + admin.login, button: button, silent: true,
						task: function () { return deps.persistence.saveAdministrator(admin); }
					}).then(function () {
						deps.notifyCentered(_('Settings saved successfully.'));
						if (stopWatcher) stopWatcher();
						ui.hideModal();
					}, function (error) {
						admin.allowChildAccessRequests = previous;
						deps.notify(deps.errorText(error, _('Could not save settings.')), 'warning');
						throw error;
					});
				}
			});
		}
		ui.showModal(_('Administrator settings'), [E('p', { 'class': 'spinning' }, _('Preparing secure pairing...'))]);
		loadTlsFingerprint().then(function (fingerprint) {
			return deps.persistence.activate(admin, temporaryPassword).then(function () { openActivated(fingerprint); });
		}).catch(function (error) {
			ui.hideModal();
			deps.notify(deps.errorText(error, _('Could not prepare the pairing code. Please reopen administrator settings.')), 'warning');
		});
	}

	function createSelector(admin) {
		var assigned = assignedDeviceIds(admin || null);
		return deps.createDeviceSelector({
			selectedIds: admin && admin.deviceIds || [],
			filter: function (device) { return canBind(device) && !assigned[device.id]; }
		});
	}

	function persistedMutationFailure(error, successMessage) {
		if (!error || !error.persisted)
			return Promise.resolve(false);
		return persistedRefresh(error).then(function (refresh) {
			var message = successMessage + ' ' + deps.errorText(error, _('Check the router journal.'));
			if (!refresh.refreshed)
				message += ' ' + _('The saved administrator state could not be refreshed in LuCI.');
			ui.hideModal();
			deps.notify(message, 'warning');
			return true;
		});
	}

	function persistedRefreshFailure(error, message) {
		error = error && typeof error === 'object' ? error : new Error(String(error || 'refresh_failed'));
		error.persisted = true;
		error.runtimeApplied = true;
		error.refreshFailed = true;
		ui.hideModal();
		deps.notify(message, 'warning');
		return error;
	}

	function persistNew(form, onAdd, button) {
		var admin = { id: nextId(), name: form.name, login: form.login, deviceIds: form.selectedIds, allowChildAccessRequests: false };
		return deps.actions.execute({
			key: 'administrator-create:' + admin.login.toLowerCase(), button: button, silent: true,
			task: function () { return deps.persistence.persistBindings(admin, form.selectedDevices, [], true); }
		}).then(function () {
			return reloadAndRefreshDevices().then(function () {
				var actual = administrators().filter(function (candidate) { return candidate.login === admin.login; })[0] || admin;
				if (onAdd) onAdd(actual);
				deps.notify(_('Administrator added.'), 'info');
				ui.hideModal();
			}, function (refreshError) {
				throw persistedRefreshFailure(
					refreshError,
					_('The administrator was saved, but the device list could not be refreshed. Reopen the page before making another change.')
				);
			});
		}, function (error) {
			return persistedMutationFailure(error, _('Administrator was saved, but internet access rules could not be applied.')).then(function (handled) {
				if (!handled) deps.notify(deps.errorText(error, _('Could not save administrator.')), 'warning');
				throw error;
			});
		});
	}

	function showAdd(onAdd) {
		deps.editor.openAdd({
			inputControl: deps.forms.inputControl, loginExists: loginExists, validateLogin: validateLogin,
			createDeviceSelector: function () { return createSelector(null); }
		}, function (form, button) { return persistNew(form, onAdd, button); });
	}

	function persistBindings(admin, form, previousIds, onSave, button) {
		return deps.actions.execute({
			key: 'administrator-bindings:' + admin.login.toLowerCase(), button: button, silent: true,
			task: function () { return deps.persistence.persistBindings(admin, form.selectedDevices, previousIds, false); }
		}).then(function () {
			return reloadAndRefreshDevices().then(function () {
				var actual = administrators().filter(function (candidate) { return candidate.login === admin.login; })[0] || admin;
				if (onSave) onSave(actual);
				ui.hideModal();
				deps.notify(_('Device bindings saved.'), 'info');
			}, function (refreshError) {
				throw persistedRefreshFailure(
					refreshError,
					_('Device bindings were saved, but the device list could not be refreshed. Reopen the page before making another change.')
				);
			});
		}, function (error) {
			if (!error.persisted) admin.deviceIds = previousIds;
			return persistedMutationFailure(error, _('Device bindings were saved, but internet access rules could not be applied.')).then(function (handled) {
				if (!handled) deps.notify(deps.errorText(error, _('Could not save device bindings.')), 'warning');
				throw error;
			});
		});
	}

	function showBindings(admin, onSave) {
		var previousIds = (admin.deviceIds || []).slice();
		deps.editor.openBinding({ createDeviceSelector: function () { return createSelector(admin); } }, admin, function (form, button) {
			return persistBindings(admin, form, previousIds, onSave, button);
		});
	}

	function renderRow(admin) {
		var devicesCell = E('div', {}, deviceList(admin));
		return E('div', {
			'class': 'sf-admin-row', 'data-admin-login': admin.login || '',
			'data-sort-name': admin.name || '', 'data-sort-login': admin.login || ''
		}, [
			E('div', {}, E('strong', {}, admin.name)), E('div', { 'class': 'sf-mono' }, admin.login), devicesCell,
			E('div', { 'class': 'sf-row-actions' }, [
				deps.iconButton(_('Configure'), 'gear', 'neutral', function () { showSettings(admin); }),
				deps.iconButton(_('Bind devices'), 'link', 'neutral', function () {
					showBindings(admin, function (actual) { devicesCell.replaceChildren(deviceList(actual || admin)); });
				})
			])
		]);
	}
	function render(embedded) {
		return deps.view.render({ administrators: administrators(), sortHeader: sortHeader, row: renderRow, add: showAdd }, embedded);
	}

	return {
		load: load, administrators: administrators, isAdminDevice: isAdminDevice, canBind: canBind,
		byDeepLink: byDeepLink, showSettings: showSettings, showBindings: showBindings,
		reloadAndRefreshDevices: reloadAndRefreshDevices, renderRow: renderRow, render: render
	};
}

return baseclass.extend({ create: create });
