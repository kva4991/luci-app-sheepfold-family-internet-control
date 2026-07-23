'use strict';
'require view';
'require view.sheepfold.overview as overview';
'require uci';
'require ui';
'require rpc';
'require sheepfold.core.backend.router as routerBackend';
'require sheepfold.core.persistence.uci as uciPersistenceModel';
'require sheepfold.core.backend.actions as commandActionsModel';

/*
 * Secure additions are kept as a thin decorator around the regular overview
 * application. The base view remains the single composition root; this file
 * only adds router-specific LED repair and the account-first administrator
 * creation flow. §frontmod §pairsec §ovaudit3
 */
var renderSettings = overview.renderSettings;
var renderAdmins = overview.renderAdmins;
var commandActions = commandActionsModel.create({
	run: routerBackend.run,
	withTimeout: routerBackend.withTimeout,
	ensureOk: routerBackend.ensureOk,
	errorText: routerBackend.errorText,
	actionMetadata: routerBackend.actionMetadata,
	parseKeyValues: routerBackend.parseKeyValues,
	notify: function (message, level) {
		ui.addNotification(null, E('p', {}, message), level || 'info');
	}
});
var callUciRevert = rpc.declare({
	object: 'uci',
	method: 'revert',
	params: ['config'],
	reject: true
});
var uciPersistence = uciPersistenceModel.create({
	uci: uci,
	applyTimeout: 10,
	setTimeout: window.setTimeout.bind(window),
	revert: function (configs) {
		return Promise.all((configs || []).map(function (config) {
			return callUciRevert(config);
		}));
	}
});

function routerControl(args, options) {
	return commandActions.run(args || [], options);
}

function parseKeyValueOutput(text) {
	return routerBackend.parseKeyValues(text);
}

function commandErrorText(error, fallback) {
	return commandActions.errorText(error, fallback);
}

function ensureSuccessfulCommand(result, fallback) {
	return commandActions.ensureOk(result, fallback);
}

function findLedControlSelect(root) {
	var selects = Array.prototype.slice.call(root.querySelectorAll('select'));

	return selects.find(function (select) {
		return !!select.querySelector('option[value="off_forever"]') &&
			!!select.querySelector('option[value="new_device_alert_until_luci_login"]');
	}) || null;
}

function findLedRepairInput(root) {
	return root.querySelector('[data-sheepfold-led-repair]');
}

function continueSettingsSave(button) {
	button.dataset.sheepfoldLedSaveBypass = '1';
	button.click();
}

function confirmLedDependencyInstall(packageName, boardName) {
	return new Promise(function (resolve) {
		var completed = false;

		function finish(confirmed) {
			if (completed)
				return;
			completed = true;
			ui.hideModal();
			resolve(confirmed);
		}

		ui.showModal(_('LED control dependency'), [
			E('div', { 'class': 'cbi-section' }, [
				E('p', {}, _('The selected LED control mode requires an additional package.')),
				E('p', {}, [
					E('strong', {}, _('Router model') + ': '),
					E('code', {}, boardName || _('unknown'))
				]),
				E('p', {}, [
					E('strong', {}, _('Package') + ': '),
					E('code', {}, packageName)
				]),
				E('p', {}, _('Install the dependency and continue saving settings?'))
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': function (event) {
						event.preventDefault();
						finish(false);
					}
				}, _('No')),
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': function (event) {
						event.preventDefault();
						finish(true);
					}
				}, _('Yes'))
			])
		]);
	});
}

function installLedDependency(packageName) {
	return new Promise(function (resolve, reject) {
		var spinner = E('span', { 'class': 'sf-spinner' });
		var statusNode = E('p', {}, _('Installing dependency. Do not close this page.'));
		var outputNode = E('pre', { 'class': 'sf-pre' }, _('Preparing installation…'));
		var closeButton = E('button', {
			'class': 'btn cbi-button',
			'hidden': 'hidden',
			'click': function (event) {
				event.preventDefault();
				ui.hideModal();
			}
		}, _('Close'));

		ui.showModal(_('Installing dependency'), [
			E('div', { 'class': 'sf-update-progress' }, [spinner, statusNode]),
			outputNode,
			E('div', { 'class': 'right sf-modal-actions' }, [closeButton])
		]);

		routerControl(['led-dependency-install']).then(function (result) {
			var output;

			ensureSuccessfulCommand(result, _('Could not install dependency.'));
			output = String(result && (result.stdout || result.stderr) || '').trim();
			outputNode.textContent = output || packageName;
			spinner.className = 'sf-spinner sf-spinner-done';
			statusNode.textContent = _('Dependency installed successfully.');
			closeButton.hidden = false;
			window.setTimeout(function () {
				ui.hideModal();
				resolve();
			}, 1000);
		}).catch(function (error) {
			spinner.className = 'sf-spinner sf-spinner-failed';
			statusNode.textContent = _('Could not install dependency.');
			outputNode.textContent = commandErrorText(error, _('Could not install the required package.'));
			closeButton.hidden = false;
			reject(error);
		});
	});
}

function prepareLedDependency(root) {
	var ledSelect = findLedControlSelect(root);

	if (!ledSelect || ledSelect.value === 'router_default')
		return Promise.resolve();
	return routerControl(['led-dependency-status']).then(function (result) {
		var status;

		ensureSuccessfulCommand(result, _('Could not check LED dependency.'));
		status = parseKeyValueOutput(result && result.stdout || '');
		if (status.required !== '1' || status.installed === '1')
			return null;
		return confirmLedDependencyInstall(status.package || _('unknown package'), status.board).then(function (confirmed) {
			if (!confirmed) {
				ledSelect.value = 'router_default';
				ledSelect.dispatchEvent(new Event('change', { bubbles: true }));
				return null;
			}
			return installLedDependency(status.package || _('unknown package'));
		});
	});
}

function saveLedRepair(root) {
	var input = findLedRepairInput(root);
	var previousValue;
	var nextValue;

	if (!input || input.dataset.changed !== '1')
		return Promise.resolve(false);
	previousValue = input.dataset.initial === '1' ? '1' : '0';
	nextValue = input.checked ? '1' : '0';
	return uciPersistence.mutate(['sheepfold'], function () {
		uci.set('sheepfold', 'global', 'router_led_repair', nextValue);
		return nextValue;
	}).then(function () {
		return routerControl(['led-repair-apply']);
	}).then(function (result) {
		ensureSuccessfulCommand(result, _('Could not apply indicator repair.'));
		input.dataset.initial = nextValue;
		input.dataset.changed = '0';
		return true;
	}).catch(function (error) {
		input.checked = previousValue === '1';
		return uciPersistence.mutate(['sheepfold'], function () {
			uci.set('sheepfold', 'global', 'router_led_repair', previousValue);
			return previousValue;
		}).then(function () {
			return routerControl(['led-repair-apply']).catch(function () { return null; });
		}).then(function () {
			throw error;
		}, function (rollbackError) {
			if (error && typeof error === 'object')
				error.rollbackError = rollbackError;
			throw error;
		});
	});
}

function createLedRepairField() {
	var initialValue = uci.get('sheepfold', 'global', 'router_led_repair') === '1';
	var input = E('input', {
		'type': 'checkbox',
		'checked': initialValue ? 'checked' : null,
		'disabled': 'disabled',
		'data-sheepfold-led-repair': '1',
		'data-initial': initialValue ? '1' : '0',
		'data-changed': '0'
	});
	var hint = E('small', {}, _('Checking for a router-specific indicator repair…'));
	var field = E('label', { 'class': 'sf-check-field' }, [
		input,
		E('span', {}, _('Try to fix indicator behavior')),
		hint
	]);

	input.addEventListener('change', function () {
		input.dataset.changed = input.checked === (input.dataset.initial === '1') ? '0' : '1';
	});
	routerControl(['led-repair-status']).then(function (result) {
		var status;

		ensureSuccessfulCommand(result, _('Could not check indicator repair.'));
		status = parseKeyValueOutput(result && result.stdout || '');
		if (status.available === '1') {
			input.disabled = false;
			hint.textContent = _('A reversible WAN indicator repair was found for this model. Apply the change with Save settings.');
		} else {
			input.disabled = true;
			hint.textContent = _('No model-specific repairs were found. Standard system LED controls are used.');
		}
	}).catch(function (error) {
		input.disabled = true;
		hint.textContent = _('Could not check repair availability: ') + commandErrorText(error, _('unknown error'));
	});
	return field;
}

function attachLedSaveCheck(root, button) {
	button.addEventListener('click', function (event) {
		var repairInput;
		var repairChanged;
		var ledSelect;

		if (button.dataset.sheepfoldLedSaveBypass === '1') {
			delete button.dataset.sheepfoldLedSaveBypass;
			return;
		}
		repairInput = findLedRepairInput(root);
		repairChanged = repairInput && repairInput.dataset.changed === '1';
		ledSelect = findLedControlSelect(root);
		if (!repairChanged && (!ledSelect || ledSelect.value === 'router_default'))
			return;
		event.preventDefault();
		event.stopImmediatePropagation();
		prepareLedDependency(root).then(function () {
			return saveLedRepair(root);
		}).then(function (repairSaved) {
			var coreHasChanges = !button.classList.contains('sf-action-muted');

			if (coreHasChanges) {
				continueSettingsSave(button);
				return;
			}
			if (repairSaved)
				ui.addNotification(null, E('p', {}, _('Indicator repair setting saved.')), 'info');
		}).catch(function (error) {
			ui.addNotification(null, E('p', {},
				_('Could not prepare LED settings: ') + commandErrorText(error, _('unknown error'))), 'error');
		});
	}, true);
}

function normalizedLogin(login) {
	return String(login || '').trim().toLowerCase();
}

function validAdministratorLogin(login) {
	return /^[A-Za-z0-9_.@+-]{1,64}$/.test(String(login || '').trim());
}

function administratorLoginExists(login) {
	var normalized = normalizedLogin(login);
	var exists = false;

	uciPersistence.sections('sheepfold', 'administrator').forEach(function (section) {
		if (normalizedLogin(section.login) === normalized)
			exists = true;
	});
	return exists;
}

function administratorHash(text) {
	var result = 2166136261;

	String(text || '').split('').forEach(function (character) {
		result ^= character.charCodeAt(0);
		result = Math.imul(result, 16777619) >>> 0;
	});
	return ('00000000' + result.toString(16)).slice(-8);
}

function administratorSectionName(login) {
	var slug = normalizedLogin(login).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'administrator';
	var base = 'admin_' + slug + '_' + administratorHash(normalizedLogin(login));
	var index;
	var candidate;
	var occupied;

	for (index = 1; index <= 999; index++) {
		candidate = index === 1 ? base : base + '_' + index;
		occupied = uciPersistence.sections('sheepfold').filter(function (section) {
			return section['.name'] === candidate;
		})[0] || null;
		if (!occupied)
			return uciPersistence.ensureSection('sheepfold', 'administrator', candidate);
		if (occupied['.type'] === 'administrator' && normalizedLogin(occupied.login) === normalizedLogin(login))
			return candidate;
	}
	var error = new Error('administrator_section_collision');
	error.errorCode = 'administrator_section_collision';
	throw error;
}

function nextAdministratorId() {
	var maximum = 0;

	uciPersistence.sections('sheepfold', 'administrator').forEach(function (section) {
		var id = parseInt(section.id, 10);
		if (isFinite(id) && id > maximum)
			maximum = id;
	});
	return String(maximum + 1);
}

function showSafeAddAdministratorModal() {
	var nameInput = E('input', { 'class': 'cbi-input-text' });
	var loginInput = E('input', { 'class': 'cbi-input-text' });
	var errorNode = E('p', { 'class': 'alert-message error', 'hidden': 'hidden' });
	var createButtons = [];
	var submission = null;

	function showError(message) {
		errorNode.textContent = message;
		errorNode.hidden = false;
	}

	function setSaving(saving) {
		createButtons.forEach(function (button) {
			button.disabled = !!saving;
		});
	}

	function createAdministrator() {
		var displayName = nameInput.value.trim();
		var login = loginInput.value.trim();
		var key;

		if (submission)
			return submission;
		errorNode.hidden = true;
		if (!displayName || !login) {
			showError(_('Name and login are required.'));
			return Promise.resolve(false);
		}
		if (!validAdministratorLogin(login)) {
			showError(_('Login may contain only Latin letters, digits, and . _ - @ + symbols.'));
			return Promise.resolve(false);
		}
		if (administratorLoginExists(login)) {
			showError(_('This login is already in use.'));
			return Promise.resolve(false);
		}

		key = 'secure-administrator-create:' + normalizedLogin(login);
		setSaving(true);
		submission = commandActions.execute({
			key: key,
			buttons: createButtons,
			busyText: _('Creating...'),
			silent: true,
			task: function () {
				return uciPersistence.mutate(['sheepfold'], function () {
					var duplicate = uciPersistence.sections('sheepfold', 'administrator').some(function (section) {
						return normalizedLogin(section.login) === normalizedLogin(login);
					});
					var sectionName;

					if (duplicate) {
						var duplicateError = new Error(_('This login is already in use.'));
						duplicateError.errorCode = 'administrator_login_exists';
						throw duplicateError;
					}
					sectionName = administratorSectionName(login);
					uci.set('sheepfold', sectionName, 'id', nextAdministratorId());
					uci.set('sheepfold', sectionName, 'display_name', displayName);
					uci.set('sheepfold', sectionName, 'login', login);
					uci.set('sheepfold', sectionName, 'role', 'admin');
					uci.set('sheepfold', sectionName, 'password_hash', '');
					uci.set('sheepfold', sectionName, 'password_setup_required', '1');
					uci.set('sheepfold', sectionName, 'allow_child_access_requests', '0');
					return sectionName;
				});
			}
		}).then(function () {
			ui.addNotification(null, E('p', {},
				_('Administrator created. Open administrator settings and complete QR pairing.')), 'info');
			ui.hideModal();
			window.location.reload();
			return true;
		}).catch(function (error) {
			showError(commandErrorText(error, _('Could not create administrator.')));
			throw error;
		}).finally(function () {
			submission = null;
			setSaving(false);
		});
		return submission;
	}

	function modalActions() {
		var createButton = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function (event) {
				event.preventDefault();
				createAdministrator().catch(function () { return null; });
			}
		}, _('Create'));
		createButtons.push(createButton);
		return E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
			createButton
		]);
	}

	ui.showModal(_('Add administrator'), [
		E('div', { 'class': 'cbi-section' }, [
			E('p', {}, _('An account is created first. The phone receives administrator rights only after QR pairing with MAC, blocklist, and one-time code verification.')),
			modalActions(),
			errorNode,
			E('label', { 'class': 'cbi-value' }, [
				E('span', { 'class': 'cbi-value-title' }, _('Administrator name')),
				E('div', { 'class': 'cbi-value-field' }, nameInput)
			]),
			E('label', { 'class': 'cbi-value' }, [
				E('span', { 'class': 'cbi-value-title' }, _('Login')),
				E('div', { 'class': 'cbi-value-field' }, loginInput)
			])
		]),
		modalActions()
	]);
}

overview.renderSettings = function () {
	var node = renderSettings.apply(this, arguments);
	var ledSelect = findLedControlSelect(node);
	var ledField = ledSelect ? ledSelect.closest('label') : null;

	if (ledField && ledField.parentNode)
		ledField.parentNode.insertBefore(createLedRepairField(), ledField.nextSibling);
	node.querySelectorAll('[data-settings-save]').forEach(function (button) {
		attachLedSaveCheck(node, button);
	});
	return node;
};

overview.renderAdmins = function () {
	var node = renderAdmins.apply(this, arguments);
	var addButton = node.querySelector('.sf-panel-head .sf-action-positive');

	if (addButton) {
		addButton.replaceWith(E('button', {
			'class': 'sf-action sf-action-positive',
			'click': function (event) {
				event.preventDefault();
				showSafeAddAdministratorModal();
			}
		}, _('Add administrator')));
	}
	node.insertBefore(E('div', { 'class': 'sf-note sf-note-warning' },
		_('Administrative rights cannot be granted from the general device list. Pair devices with the button next to the gear icon; blocklisted devices are unavailable. QR pairing is in administrator settings.')), node.firstChild);
	return node;
};

return view.extend({
	load: function () {
		return overview.load ? overview.load.apply(overview, arguments) : null;
	},
	render: function () {
		return overview.render.apply(overview, arguments);
	}
});
