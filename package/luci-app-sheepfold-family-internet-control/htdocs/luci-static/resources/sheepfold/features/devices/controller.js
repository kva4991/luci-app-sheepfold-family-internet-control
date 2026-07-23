'use strict';
'require baseclass';
'require ui';

/* §frontmod §ovfinal1 §devmut
 * Контроллер устройств отвечает за таблицы, координацию редактора и действия
 * списков. Запись UCI/DHCP/firewall остаётся в devices/persistence.js.
 */
function create(deps) {
	var NEW_DEVICE_BADGE_SECONDS = 86400;
	var quickAllowlist;

	function devices() {
		return deps.store.devices();
	}

	function replaceDevices(values) {
		return deps.store.replaceDevices(values || []);
	}

	function normalizeMac(value) {
		return deps.inventory.normalizeMac(value);
	}

	function listValues(value) {
		return deps.inventory.listValues(value);
	}

	function displayId(device) {
		var match = String(device && device.id || '').match(/^(\d+)$/);
		return match ? String(parseInt(match[1], 10)) : String(Math.max(1, devices().indexOf(device) + 1));
	}

	function formattedId(device) {
		return '#' + displayId(device);
	}

	function byId(id) {
		var wanted = String(id || '');
		return devices().filter(function (device) { return String(device.id || '') === wanted; })[0] || null;
	}

	function firstSeenAt(configured) {
		var firstSeen = configured && configured.first_seen_at ? parseInt(configured.first_seen_at, 10) : 0;
		if (firstSeen > 0)
			return firstSeen;
		return configured && configured.detection_updated_at ? parseInt(configured.detection_updated_at, 10) || 0 : 0;
	}

	function statusBadge(status, configured) {
		if (/^(?:allow|blocked|scheduled|restricted|identity_blocked|identity_restricted)$/.test(status || ''))
			return status;
		if (status !== 'new')
			return '';
		var firstSeen = firstSeenAt(configured);
		return !firstSeen || Math.floor(Date.now() / 1000) - firstSeen < NEW_DEVICE_BADGE_SECONDS ? 'new' : '';
	}

	function badge(status) {
		var labels = {
			allow: _('Allowlist'),
			blocked: _('Blocklist'),
			scheduled: _('Scheduled'),
			restricted: _('Restricted'),
			identity_blocked: _('Identity quarantine: blocked'),
			identity_restricted: _('Identity quarantine: restricted'),
			new: _('New'),
			journal: _('Journal')
		};
		return E('span', { 'class': 'sf-badge sf-badge-' + status }, labels[status] || status);
	}

	function build(dhcpLeases, arpTable) {
		return deps.inventory.build({
			dhcpLeases: dhcpLeases,
			arpTable: arpTable,
			staticHosts: deps.sections('dhcp', 'host'),
			deviceSections: deps.sections('sheepfold', 'device'),
			listSections: deps.sections('sheepfold', 'list'),
			notConfiguredGroup: deps.notConfigured,
			normalizeGroupName: deps.groups.normalize,
			groupSectionByName: deps.groups.sectionByName,
			statusBadge: statusBadge,
			translate: _
		});
	}

	function readNow() {
		return Promise.all([
			deps.fs.read('/tmp/dhcp.leases').catch(function () { return ''; }),
			deps.fs.read('/proc/net/arp').catch(function () { return ''; })
		]).then(function (values) {
			return replaceDevices(build(values[0], values[1]));
		});
	}

	function reload() {
		return deps.persistence.reload(['sheepfold', 'dhcp']).then(readNow);
	}

	function refreshViews() {
		deps.pageRefresh.userLists();
		deps.pageRefresh.groups();
	}

	function ipSortValue(ip) {
		var parts = String(ip || '').split('.').map(function (part) { return parseInt(part, 10); });
		if (parts.length !== 4 || parts.some(function (part) { return isNaN(part); }))
			return -1;
		return (((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3];
	}

	function sortHeader(label, key) {
		return deps.table.sortHeader(label, key, {
			className: 'sf-device-sort',
			tableSelector: '.sf-device-table',
			rowSelector: '.sf-device-row:not(.sf-device-head)',
			buttonSelector: '.sf-device-sort'
		});
	}

	function createSelection(options) {
		options = options || {};
		return deps.selection.create({
			devices: devices(),
			selectedIds: options.selectedIds || [],
			filter: options.filter,
			displayId: displayId,
			formattedId: formattedId,
			groupName: deps.groups.display
		});
	}

	function isAdminDevice(device) {
		return deps.administrators().isAdminDevice(device);
	}

	function macInList(listName, mac) {
		return deps.inventory.macInList(deps.sections('sheepfold', 'list'), listName, mac);
	}

	function validateSettings(device, payload) {
		var group = deps.groups.normalize(payload.group || deps.notConfigured);
		if (isAdminDevice(device) && (payload.status !== 'allow' || group !== deps.notConfigured))
			return _('Administrator devices must remain in the allowlist and outside ordinary groups.');
		if (payload.status === 'allow' && macInList('blocklist', device.mac))
			return _('This device is already in the blocklist. Remove it from the blocklist before adding it to the allowlist.');
		if (payload.status === 'blocked' && macInList('allowlist', device.mac))
			return _('This device is already in the allowlist. Remove it from the allowlist before adding it to the blocklist.');
		if (payload.staticLease && !payload.ip)
			return _('Static lease requires an IP address.');
		return '';
	}

	function applyLocalResult(device, result) {
		device.name = result.name;
		device.ip = result.ip;
		device.group = result.group;
		device.deviceType = result.deviceType;
		device.manualDeviceType = result.manualDeviceType;
		device.status = result.status;
		device.statusBadge = statusBadge(result.status, null);
		device.staticLease = result.staticLease;
		device.staticSection = result.staticSectionName || '';
		/* SHEEPFOLD_AI_BEGIN */
		device.activityLogEnabled = result.activityLogEnabled;
		/* SHEEPFOLD_AI_END */
	}

	function persistedFailure(error, message, closeModal) {
		if (!error || !error.persisted)
			return Promise.resolve(false);
		return reload().then(function () {
			if (closeModal) ui.hideModal();
			refreshViews();
			deps.notify(message + ' ' + deps.errorText(error, _('Check the router journal.')), 'warning');
			return true;
		}, function (refreshError) {
			error.refreshFailed = true;
			error.refreshError = refreshError;
			if (closeModal) ui.hideModal();
			deps.notify(
				message + ' ' + _('The saved state could not be refreshed in LuCI; reopen the page before making another change.'),
				'warning'
			);
			return true;
		});
	}

	function persistSettings(device, payload, button) {
		return deps.actions.execute({
			key: 'device-settings:' + normalizeMac(device.mac),
			button: button,
			silent: true,
			task: function () { return deps.persistence.persistSettings(device, payload); }
		}).then(function (response) {
			applyLocalResult(device, response.data);
			ui.hideModal();
			deps.notify(_('Device settings saved.'), 'info');
			refreshViews();
		}, function (error) {
			return persistedFailure(
				error,
				_('Device settings were saved, but internet access rules could not be applied.'),
				true
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not save device settings.')), 'warning');
			});
		});
	}

	function showSettings(device) {
		return deps.editor.open({
			groups: deps.groups.options(),
			notConfiguredGroup: deps.notConfigured,
			inputControl: deps.forms.inputControl,
			selectControl: deps.forms.selectControl,
			deviceTypeControl: deps.typeControl.control,
			checkboxControl: deps.forms.checkboxControl,
			displayDeviceType: function (value) {
				return deps.types.displayedType(value, deps.get('sheepfold', 'global', 'detector_min_device_type_confidence', '70'));
			},
			displayId: formattedId,
			settingLine: deps.settingLine,
			validate: function (payload) { return validateSettings(device, payload); },
			persist: function (payload, button) { return persistSettings(device, payload, button); }
		}, device);
	}

	function listCanAdd(device, targetStatus) {
		var mac = normalizeMac(device && device.mac);
		if (!mac)
			return false;
		if (targetStatus === 'blocked') {
			return !isAdminDevice(device) && device.status !== 'blocked' && device.status !== 'allow' &&
				!macInList('allowlist', mac);
		}
		return device.status !== 'allow' && device.status !== 'blocked' &&
			!macInList('allowlist', mac) && !macInList('blocklist', mac);
	}

	function setBackendStatus(device, status) {
		return deps.persistence.setBackendStatus(device, status);
	}

	function persistMembership(selectedDevices, targetStatus, button) {
		var listSections = deps.sections('sheepfold', 'list');
		var isAllowlist = targetStatus === 'allow';
		var validationError = '';
		var normalized = (selectedDevices || []).map(function (device) {
			return { device: device, mac: normalizeMac(device && device.mac) };
		});
		var keyMacs;

		normalized.some(function (entry) {
			var conflict;
			if (!entry.mac) { validationError = _('Invalid MAC address'); return true; }
			conflict = deps.accessLists.conflictingList(listSections, targetStatus, entry.mac);
			if (conflict === 'blocklist' || isAllowlist && entry.device.status === 'blocked')
				validationError = _('This device is in the blocklist. Remove it from the blocklist first.');
			else if (conflict === 'allowlist' || !isAllowlist && entry.device.status === 'allow')
				validationError = _('This device is in the allowlist. Remove it from the allowlist first.');
			return !!validationError;
		});
		if (validationError)
			return Promise.reject(new Error(validationError));

		keyMacs = normalized.map(function (entry) { return entry.mac; }).sort();
		return deps.actions.execute({
			key: 'device-list-batch:' + targetStatus + ':' + keyMacs.join(','),
			button: button,
			silent: true,
			task: function () {
				var completed = 0;
				var total = normalized.length;
				var runtimeApplied = false;
				return normalized.reduce(function (chain, entry) {
					return chain.then(function () {
						return setBackendStatus(entry.device, targetStatus).then(function () { completed += 1; });
					});
				}, Promise.resolve()).then(function () {
					return deps.persistence.applyRuntime();
				}).then(function () {
					runtimeApplied = true;
					return reload().then(function () {
						return { persisted: completed > 0, runtimeApplied: true, completedCount: completed, totalCount: total };
					}, function (refreshError) {
						var error = new Error(_('The devices were saved, but the device list could not be refreshed.'));
						error.persisted = completed > 0;
						error.runtimeApplied = true;
						error.refreshFailed = true;
						error.refreshError = refreshError;
						error.completedCount = completed;
						error.totalCount = total;
						throw error;
					});
				}).catch(function (error) {
					if (!error || typeof error !== 'object') {
						var normalizedError = new Error(String(error == null ? 'device_batch_failed' : error));
						normalizedError.cause = error;
						error = normalizedError;
					}
					error.completedCount = completed;
					error.totalCount = total;
					if (completed > 0) {
						error.persisted = true;
						error.partial = completed < total;
						if (!error.refreshFailed)
							error.runtimeApplied = runtimeApplied;
					}
					throw error;
				});
			}
		}).then(function (response) { return response.data; });
	}

	function batchFailureMessage(error) {
		var completed = Number(error && error.completedCount || 0);
		var total = Number(error && error.totalCount || 0);

		if (error && error.refreshFailed && total > 0 && completed === total) {
			return _('All selected devices were saved, but the device list could not be refreshed. Reopen the page before making another change.');
		}
		if (error && error.persisted && total > 0 && completed > 0 && completed < total) {
			return _('Only part of the selected device list was saved: %s of %s devices.')
				.replace('%s', String(completed)).replace('%s', String(total));
		}
		if (error && error.persisted && total > 0 && completed === total && error.runtimeApplied === false) {
			return _('All selected devices were saved, but internet access rules could not be applied.');
		}
		return '';
	}

	function showManualList(targetStatus) {
		var isAllowlist = targetStatus === 'allow';
		var selector = createSelection({ filter: function (device) { return listCanAdd(device, targetStatus); } });
		var title = isAllowlist ? _('Add device to allowlist') : _('Add device to blocklist');
		var saving = false;
		var saveButtons = [];

		function setSaving(value) {
			saving = !!value;
			saveButtons.forEach(function (button) { button.disabled = saving; });
		}
		function save(event) {
			var selected;
			var promise;
			if (saving) return null;
			selected = selector.selectedDevices();
			if (!selected.length) { deps.notify(_('No devices selected'), 'warning'); return null; }
			setSaving(true);
			promise = persistMembership(selected, targetStatus, event && event.currentTarget).then(function (result) {
				deps.notify(isAllowlist ? _('Device added to allowlist.') : _('Device added to blocklist.'), 'info');
				ui.hideModal();
				refreshViews();
				return result;
			}, function (error) {
				var message = batchFailureMessage(error);
				if (message) {
					deps.notify(message, 'warning');
					if (error.refreshFailed) {
						ui.hideModal();
						throw error;
					}
					return reload().then(refreshViews).catch(function (refreshError) {
						error.refreshFailed = true;
						error.refreshError = refreshError;
						ui.hideModal();
						deps.notify(
							_('The saved device state could not be refreshed in LuCI. Reopen the page before making another change.'),
							'warning'
						);
					}).then(function () { throw error; });
				}
				deps.notify(deps.errorText(error, _('Could not add device.')), 'warning');
				throw error;
			}).finally(function () { setSaving(false); });
			return promise;
		}
		function actions() {
			var button = E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save }, _('Save'));
			saveButtons.push(button);
			return E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')), button
			]);
		}
		ui.showModal(title, [E('div', { 'class': 'sf-binding-modal' }, [actions(), selector.node]), actions()]);
	}

	function simpleInput(label, value) {
		var input = E('input', { 'class': 'cbi-input-text', 'value': value || '' });
		return { input: input, node: E('label', { 'class': 'sf-field' }, [E('span', {}, label), input]) };
	}

	function showManualDevice() {
		var nameField = simpleInput(_('Device name'), '');
		var macField = simpleInput(_('MAC address'), '');
		var ipField = simpleInput(_('IP address'), '');
		var typeField = deps.typeControl.control(_('Device type'), 'smart');
		var saveButton;

		function save(event) {
			var mac = normalizeMac(macField.input.value);
			var device;
			if (!mac) {
				deps.notify(_('Enter a valid MAC address.'), 'warning');
				return;
			}
			device = {
				mac: mac,
				name: nameField.input.value.trim() || mac,
				ip: ipField.input.value.trim(),
				group: deps.notConfigured,
				deviceType: typeField.input.value
			};
			deps.actions.execute({
				key: 'manual-device:' + mac,
				button: event && event.currentTarget || saveButton,
				silent: true,
				task: function () { return setBackendStatus(device, 'restricted').then(reload); }
			}).then(function () {
				deps.notify(_('Device added.'), 'info');
				ui.hideModal();
				refreshViews();
			}, function (error) {
				deps.notify(deps.errorText(error, _('Could not add device.')), 'warning');
			});
		}

		saveButton = E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save }, _('Save'));
		ui.showModal(_('Add device'), [
			E('div', { 'class': 'sf-device-editor' }, [nameField.node, macField.node, ipField.node, typeField.node]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				saveButton
			])
		]);
	}

	function grantTemporaryAccess(device, minutes, button) {
		var mac = normalizeMac(device && device.mac);
		var duration = Number(minutes || 0);
		if (!mac)
			return Promise.reject(new Error(_('Invalid MAC address')));
		if (!duration || duration < 1)
			return Promise.reject(new Error(_('Temporary access duration is invalid.')));
		if (!window.confirm(
			_('Grant temporary internet access to %s for %s minutes?')
				.replace('%s', deps.infoValue(device.name || device.hostname || mac))
				.replace('%s', String(duration))
		))
			return Promise.resolve(false);

		return deps.actions.execute({
			key: 'device-temp-access:' + mac,
			button: button,
			args: ['device-temp-access', mac, String(duration)],
			successMessage: _('Temporary access granted.'),
			errorMessage: _('Could not grant temporary access.'),
			refresh: function () { return reload().then(refreshViews); }
		}).then(function () { return true; }).catch(function () { return false; });
	}

	function removeFromList(device, listName, button) {
		var isAllowlist = listName === 'allowlist';
		var question = isAllowlist ? _('Remove device from allowlist?') : _('Remove device from blocklist?');
		var success = isAllowlist ? _('Device removed from allowlist.') : _('Device removed from blocklist.');
		if (!window.confirm(question + ' ' + formattedId(device) + ' ' + (device.name || device.mac)))
			return Promise.resolve(false);
		return deps.actions.execute({
			key: 'device-list-remove:' + listName + ':' + normalizeMac(device.mac),
			button: button,
			silent: true,
			task: function () { return deps.persistence.removeFromList(device, listName); }
		}).then(function () {
			device.status = 'new';
			deps.notify(success, 'info');
			refreshViews();
			return true;
		}, function (error) {
			return persistedFailure(
				error,
				_('The list change was saved, but internet access rules could not be applied.'),
				false
			).then(function (handled) {
				if (!handled)
					deps.notify(deps.errorText(error, _('Could not remove device from list.')), 'warning');
				return false;
			});
		});
	}

	function typeIcon(device) {
		var displayed = deps.types.displayedType(device, deps.get('sheepfold', 'global', 'detector_min_device_type_confidence', '70'));
		return { value: displayed, definition: deps.types.byValue(displayed) };
	}

	function renderTable(rows, options) {
		options = options || {};
		var tableRows = (rows || []).map(function (device, index) {
			var adminDevice = isAdminDevice(device);
			var type = typeIcon(device);
			return E('div', {
				'class': 'sf-device-row',
				'data-sort-id': String(index + 1),
				'data-sort-device': device.name || '',
				'data-sort-type': type.definition.label || '',
				'data-sort-ip': String(ipSortValue(device.ip)),
				'data-sort-group': deps.groups.normalize(device.group) || '',
				'data-sort-status': device.status || '',
				'data-search': [device.id, device.mac, device.hostname, device.note, type.definition.label].join(' ')
			}, [
				E('div', { 'class': 'sf-device-index', 'data-label': _('ID') }, formattedId(device)),
				E('div', { 'class': 'sf-device-name', 'data-label': _('Device') }, [
					E('strong', {}, [deps.identityIcon(device), adminDevice ? deps.adminCrown() : '', E('span', {}, device.name || device.mac)]),
					E('small', {}, device.note || '')
				]),
				E('div', { 'class': 'sf-device-type-cell', 'data-label': _('Type') }, deps.types.icon(type.value)),
				E('div', { 'class': 'sf-ip-cell', 'data-label': _('IP address') }, [
					E('span', {}, device.ip || '-'),
					device.staticLease ? deps.staticLease() : ''
				]),
				E('div', { 'class': 'sf-mono', 'data-label': _('MAC address') }, device.mac || '-'),
				E('div', { 'data-label': _('Group') }, deps.groups.display(device.group)),
				E('div', { 'class': 'sf-status-stack', 'data-label': _('Status') }, [
					device.statusBadge ? badge(device.statusBadge) : '',
					/* SHEEPFOLD_AI_BEGIN */
					device.activityLogEnabled ? badge('journal') : ''
					/* SHEEPFOLD_AI_END */
				]),
				E('div', { 'class': 'sf-row-actions', 'data-label': _('Actions') }, [
					deps.iconButton(_('Configure'), 'gear', 'neutral', function () { showSettings(device); }),
					options.removeFromList ? deps.iconButton(
						options.removeFromList === 'allowlist' ? _('Remove from allowlist') : _('Remove from blocklist'),
						'trash', 'danger', function (event) { removeFromList(device, options.removeFromList, event.currentTarget); }
					) : '',
					options.compact || adminDevice || device.status === 'allow' || device.status === 'blocked' ? '' :
						E('button', {
							'class': 'sf-action sf-action-positive',
							'click': function (event) {
								event.preventDefault();
								grantTemporaryAccess(device, 30, event.currentTarget);
							}
						}, _('+30 min'))
				])
			]);
		});

		return E('div', { 'class': 'sf-device-table' }, [
			E('div', { 'class': 'sf-device-row sf-device-head' }, [
				E('div', {}, sortHeader(_('ID'), 'id')),
				E('div', {}, sortHeader(_('Device'), 'device')),
				E('div', {}, sortHeader(_('Type'), 'type')),
				E('div', {}, sortHeader(_('IP address'), 'ip')),
				E('div', {}, _('MAC address')),
				E('div', {}, sortHeader(_('Group'), 'group')),
				E('div', {}, sortHeader(_('Status'), 'status')),
				E('div', {}, _('Actions'))
			])
		].concat(tableRows));
	}

	function manualListButton(targetStatus) {
		return E('button', {
			'class': 'sf-action sf-action-positive',
			'click': function (event) { event.preventDefault(); showManualList(targetStatus); }
		}, _('Add device'));
	}

	function renderDevices(embedded) {
		var table = renderTable(devices());
		var search = E('input', { 'class': 'cbi-input-text sf-search', 'placeholder': _('Search by name, IP, or MAC') });
		search.addEventListener('input', function () { deps.table.filter(table, search.value); });
		return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
			E('div', { 'class': 'sf-panel-head' }, E('div', {}, E('p', {},
				_('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.')))),
			E('div', { 'class': 'sf-toolbar sf-device-toolbar' }, [
				search,
				E('button', { 'class': 'sf-action sf-action-positive', 'click': function (event) {
					event.preventDefault(); showManualDevice();
				} }, _('Add device'))
			]),
			devices().length ? '' : E('div', { 'class': 'sf-note sf-note-warning' },
				_('No devices found in DHCP leases, ARP, or static DHCP leases yet.')),
			table
		]);
	}

	function renderAllowlist(embedded) {
		return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
			E('div', { 'class': 'sf-panel-head' }, [
				E('div', {}, E('p', {}, _('These devices are never blocked by global blocking or schedules.'))),
				E('div', { 'class': 'sf-toolbar' }, [quickAllowlist.button(), manualListButton('allow')])
			]),
			renderTable(devices().filter(function (device) { return device.status === 'allow'; }), {
				compact: true,
				removeFromList: 'allowlist'
			})
		]);
	}

	function renderBlocklist(embedded) {
		var emergencyAccess = deps.get('sheepfold', 'global', 'domain_allowlist_for_blocklist', '1') === '1';
		return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
			E('div', { 'class': 'sf-panel-head' }, [
				E('div', {}, E('p', {}, _('Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.'))),
				manualListButton('blocked')
			]),
			E('div', { 'class': 'sf-note ' + (emergencyAccess ? 'sf-note-ok' : 'sf-note-warning') }, emergencyAccess ?
				_('Emergency-useful sites for blocklisted devices are enabled and still do not open router access.') :
				_('Emergency-useful sites for blocklisted devices are disabled and still do not open router access.')),
			renderTable(devices().filter(function (device) { return device.status === 'blocked'; }), {
				compact: true,
				removeFromList: 'blocklist'
			})
		]);
	}

	quickAllowlist = deps.quickAllowlist.create({
		devices: devices,
		readNetworks: function () { return deps.wifi().readNetworks(); },
		wifiPayload: deps.wifiPayload.build,
		token: deps.random.urlToken,
		allowlistUrl: function (token) {
			return deps.discovery.quickAllowlistUrl(
				window.location.protocol,
				deps.discovery.routerAddress(window.location),
				token
			);
		},
		qrCode: deps.qrCode,
		settingLine: deps.settingLine,
		readDevices: readNow,
		persist: function (device) { return persistMembership([device], 'allow'); },
		execute: deps.actions.execute,
		normalizeMac: normalizeMac,
		identityIcon: deps.identityIcon
	});

	return {
		devices: devices,
		replaceDevices: replaceDevices,
		normalizeMac: normalizeMac,
		listValues: listValues,
		displayId: displayId,
		formattedId: formattedId,
		byId: byId,
		build: build,
		readNow: readNow,
		reload: reload,
		createSelection: createSelection,
		isAdminDevice: isAdminDevice,
		validateSettings: validateSettings,
		persistSettings: persistSettings,
		persistMembership: persistMembership,
		showSettings: showSettings,
		grantTemporaryAccess: grantTemporaryAccess,
		removeFromList: removeFromList,
		renderTable: renderTable,
		renderDevices: renderDevices,
		renderAllowlist: renderAllowlist,
		renderBlocklist: renderBlocklist
	};
}

return baseclass.extend({ create: create });
