'use strict';
'require baseclass';
'require ui';
'require sheepfold.features.settings.backup as backupModel';
'require sheepfold.shared.downloads as downloads';

/* §frontmod §cfgbak1
 * Этот модуль владеет только файлами и диалогами backup. Снимок UCI,
 * транзакционное применение и rollback остаются у overview-координатора.
 */
function errorMessage(error) {
	var code = error && error.message || '';

	if (code === 'password_too_short')
		return _('Use at least 12 characters for the backup password.');
	if (code === 'conflicting_device_lists')
		return _('The backup contains a device in both the allowlist and the blocklist.');
	if (code === 'global_section_missing' || code === 'required_lists_missing')
		return _('The backup does not contain the required Sheepfold sections.');
	if (code === 'encryption_unavailable')
		return _('This browser cannot create or open an encrypted backup.');
	if (code === 'unencrypted_secrets_forbidden')
		return _('A backup containing passwords or tokens must be encrypted.');
	if (/^(invalid_|duplicate_|too_many_|option_value_|named_section_)/.test(code))
		return _('Import file format is not recognized.');
	return _('Could not import settings. The previous settings were kept.');
}

function create(deps) {
	function exportSafe() {
		var stamp = new Date().toISOString().replace(/[:.]/g, '-');
		var text = JSON.stringify(deps.payload(false), null, 2) + '\n';

		downloads.textFile('sheepfold-settings-' + stamp + '.json', text);
		deps.notify(_('Settings export saved.'), 'info');
	}

	function showEncryptedExport() {
		var password = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'new-password' });
		var repeat = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'new-password' });
		var status = E('p', { 'class': 'sf-muted' });
		var saveButton;

		saveButton = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function () {
				var stamp;

				if (password.value.length < 12) {
					status.textContent = _('Use at least 12 characters for the backup password.');
					return;
				}
				if (password.value !== repeat.value) {
					status.textContent = _('Backup passwords do not match.');
					return;
				}

				saveButton.disabled = true;
				status.textContent = _('Encrypting backup...');
				backupModel.encrypt(deps.payload(true), password.value).then(function (envelope) {
					stamp = new Date().toISOString().replace(/[:.]/g, '-');
					downloads.textFile('sheepfold-full-backup-' + stamp + '.json', JSON.stringify(envelope, null, 2) + '\n');
					password.value = '';
					repeat.value = '';
					ui.hideModal();
					deps.notify(_('Encrypted full backup saved.'), 'info');
				}, function (error) {
					saveButton.disabled = false;
					status.textContent = errorMessage(error);
				});
			}
		}, _('Create encrypted backup'));

		ui.showModal(_('Encrypted full backup'), [
			E('p', {}, _('This backup contains passwords and tokens. Keep the file and its password separately. Without the password, the backup cannot be restored.')),
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Backup password')), password]),
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Repeat backup password')), repeat]),
			status,
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				saveButton
			])
		]);
	}

	function exportAll() {
		if (deps.exportMode() === 'encrypted')
			showEncryptedExport();
		else
			exportSafe();
	}

	function showImportConfirmation(payload) {
		var preview;
		var info;
		var status = E('p', { 'class': 'sf-muted' });
		var warnings;
		var applyButton;

		try {
			preview = backupModel.prepareRestore(
				payload,
				backupModel.validate(deps.payload(true))
			);
		} catch (error) {
			deps.notify(errorMessage(error), 'warning');
			return;
		}

		info = backupModel.summary(preview.payload);
		warnings = [
			E('strong', {}, _('Existing Sheepfold settings, static DHCP leases and Wi-Fi settings will be replaced.')),
			E('br'),
			info.containsSecrets ?
				_('The encrypted backup contains secrets.') :
				_('This backup does not contain secrets. Existing matching secrets will be kept; missing ones must be entered again.'),
			E('br'),
			_('Wi-Fi may restart and temporarily disconnect this device.')
		];

		if (preview.routerTransfer) {
			warnings.push(E('br'));
			warnings.push(_('This backup was created on another router or by an older Sheepfold version. Device numbers, groups, schedules and lists will be kept, but device fingerprints and administrator phone bindings will be rebuilt. Pair administrator phones again after import.'));
		}

		applyButton = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function () {
				applyButton.disabled = true;
				status.textContent = _('Applying backup...');
				deps.apply(payload).then(function (result) {
					deps.resetDraft();
					ui.hideModal();
					deps.notifyCentered(_('Settings imported successfully. The page will reload.'));
					if (!result.servicesRefreshed)
						deps.notify(_('Settings were restored, but router services could not be refreshed.'), 'warning');
					window.setTimeout(function () { window.location.reload(); }, 1200);
				}, function (error) {
					applyButton.disabled = false;
					status.textContent = errorMessage(error);
				});
			}
		}, _('Import and apply'));

		ui.showModal(_('Import all settings and user list'), [
			E('p', {}, _('The backup contains: %s devices, %s groups, %s schedules, %s administrators, %s static DHCP leases and %s Wi-Fi sections.')
				.replace('%s', info.devices).replace('%s', info.groups).replace('%s', info.schedules)
				.replace('%s', info.administrators).replace('%s', info.dhcpHosts).replace('%s', info.wifiSections)),
			E('div', { 'class': 'sf-note sf-note-warning' }, warnings),
			status,
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				applyButton
			])
		]);
	}

	function showEncryptedImport(envelope) {
		var password = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'current-password' });
		var status = E('p', { 'class': 'sf-muted' });
		var openButton;

		openButton = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function () {
				openButton.disabled = true;
				status.textContent = _('Decrypting backup...');
				backupModel.decrypt(envelope, password.value).then(function (payload) {
					password.value = '';
					showImportConfirmation(payload);
				}, function () {
					openButton.disabled = false;
					status.textContent = _('Could not decrypt the backup. Check the password and file.');
				});
			}
		}, _('Decrypt and check'));

		ui.showModal(_('Open encrypted backup'), [
			E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Backup password')), password]),
			status,
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				openButton
			])
		]);
	}

	function importAll() {
		var input = E('input', {
			'type': 'file',
			'accept': 'application/json,.json',
			'change': function () {
				var file = input.files && input.files[0];
				var reader;

				if (!file)
					return;
				if (file.size > 5 * 1024 * 1024) {
					deps.notify(_('The backup file is too large.'), 'warning');
					return;
				}

				reader = new FileReader();
				reader.onload = function () {
					var parsed;
					var payload;

					try {
						parsed = JSON.parse(String(reader.result || ''));
						if (parsed.format === backupModel.encryptedFormat) {
							showEncryptedImport(parsed);
							return;
						}
						payload = backupModel.validate(parsed);
						if (payload.containsSecrets)
							throw new Error('unencrypted_secrets_forbidden');
					} catch (error) {
						deps.notify(errorMessage(error), 'warning');
						return;
					}
					showImportConfirmation(payload);
				};
				reader.onerror = function () {
					deps.notify(_('Could not read import file.'), 'warning');
				};
				reader.readAsText(file);
			}
		});

		input.click();
	}

	return {
		exportAll: exportAll,
		importAll: importAll
	};
}

return baseclass.extend({
	create: create,
	errorMessage: errorMessage
});
