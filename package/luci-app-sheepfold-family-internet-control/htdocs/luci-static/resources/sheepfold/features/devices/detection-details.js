'use strict';
'require baseclass';
'require ui';

/* Device-detection presentation and the explicit reclassification command live
 * together. Positive evidence remains hidden; only contradictions and identity
 * quarantine need the parent's attention. §frontmod §devpas1
 */
function create(deps) {
	function sectionByMac(mac) {
		var wanted = deps.inventory.normalizeMac(mac);
		var found = null;

		if (!wanted)
			return null;
		deps.uci.sections('sheepfold', 'device', function (section) {
			if (!found && deps.inventory.normalizeMac(section.mac) === wanted)
				found = section;
		});
		return found;
	}

	function isBlocklisted(section, mac) {
		var blocked = false;

		if (section && /^(?:blocked|block)$/.test(String(section.status || '')))
			return true;
		deps.uci.sections('sheepfold', 'list', function (list) {
			if (list['.name'] !== 'blocklist')
				return;
			blocked = deps.inventory.listValues(list.mac)
				.concat(deps.inventory.listValues(list.macs))
				.some(function (value) {
					return deps.inventory.normalizeMac(value) === deps.inventory.normalizeMac(mac);
				});
		});
		return blocked;
	}

	function evidenceLabel(value) {
		var labels = {
			name: _('Device name'),
			owner_configured: _('Static DHCP lease'),
			dhcp: _('DHCP fingerprint'),
			oui: _('MAC manufacturer'),
			mdns: 'mDNS/DNS-SD',
			upnp: 'SSDP/UPnP',
			wsd: 'WS-Discovery',
			ports: _('Network services')
		};
		return labels[value] || value;
	}

	function competingEvidenceText(value) {
		var typeLabels = {
			computer: _('Computer'),
			phone: _('Phone'),
			tablet: _('Tablet'),
			printer: _('Printer'),
			camera: _('Camera'),
			server: _('Server'),
			network: _('Network device'),
			speaker: _('Smart speaker'),
			smart_home: _('Smart home')
		};

		return String(value || '').split(',').map(function (marker) {
			var parts = marker.trim().split(':');
			if (parts.length < 2)
				return '';
			return evidenceLabel(parts[0]) + ': ' + (typeLabels[parts[1]] || parts[1]);
		}).filter(Boolean).join('; ') || _('No contradictions');
	}

	function line(label, value) {
		return E('div', { 'class': 'sf-device-detection-row' }, [
			E('span', {}, label),
			E('code', {}, String(value == null || value === '' ? _('No data') : value))
		]);
	}

	function render(section) {
		var confidence = parseInt(section && section.detection_confidence || '0', 10) || 0;
		var manual = section && section.manual_device_type === '1';
		var intro;

		if (!section) {
			intro = _('Detection data will appear after the first device scan.');
		} else if (section.identity_quarantine_mode) {
			intro = _('The current connection strongly differs from the trusted fingerprint. The device saved rights are preserved, while this connection is temporarily isolated.');
		} else if (manual) {
			intro = _('The device type was selected manually. Detecting it again will remove the manual selection.');
		} else if (!section.detected_type && !section.detection_confidence && !section.detection_evidence) {
			intro = _('Automatic detection has not run yet.');
		} else {
			intro = _('This is the detection result. Positive technical scores are hidden; only contradictions that need attention are shown.');
		}

		return E('section', { 'class': 'sf-device-detection-modal' }, [
			E('h4', {}, _('Device detection data')),
			E('p', { 'class': 'sf-device-detection-intro' }, intro),
			E('div', { 'class': 'sf-device-detection-grid' }, [
				line(_('IP address'), section && section.ip || _('No data')),
				line(_('Detected type'), section ? deps.inventory.effectiveDeviceType(section) : _('No data')),
				line(_('Type confidence'), confidence ? confidence + '%' : _('No data')),
				line(_('Contradicting evidence'), competingEvidenceText(section && section.detection_competing_evidence)),
				line(_('Connection identity check'), section && section.identity_quarantine_mode ?
					(section.identity_quarantine_mode === 'block' ? _('Quarantine: blocked') : _('Quarantine: restricted')) :
					_('Matched or not enough stable evidence'))
			])
		]);
	}

	function reclassify(mac, button, trustCurrent) {
		var spinner = E('span', { 'class': 'sf-spinner' });
		var status = E('p', {}, _('Collecting current device signals...'));
		var output = E('pre', { 'class': 'sf-pre' }, _('Preparing device detection.'));
		var closeButton = E('button', {
			'class': 'btn cbi-button',
			'hidden': 'hidden',
			'click': function (event) {
				event.preventDefault();
				ui.hideModal();
			}
		}, _('Close'));

		if (trustCurrent && !window.confirm(_('The current identifiers do not match the trusted fingerprint. Continue only if you recognize this device. The current fingerprint will become trusted and the quarantine will be removed.')))
			return;

		button.disabled = true;
		ui.showModal(_('Detect device again'), [
			E('div', { 'class': 'sf-update-progress' }, [spinner, status]),
			output,
			E('div', { 'class': 'right sf-modal-actions' }, [closeButton])
		]);

		deps.actions.execute({
			key: 'device-reclassify:' + mac,
			args: ['device-reclassify', mac],
			button: button,
			silent: true,
			errorMessage: _('Could not detect the device again.')
		}).then(function (response) {
			var text = String(response.stdout || response.stderr || '').trim();
			spinner.className = 'sf-spinner sf-spinner-done';
			status.textContent = _('The device was detected again.');
			output.textContent = text || mac;
			window.setTimeout(function () {
				ui.hideModal();
				window.location.reload();
			}, 900);
		}).catch(function (error) {
			spinner.className = 'sf-spinner sf-spinner-failed';
			status.textContent = _('Could not detect the device again.');
			output.textContent = deps.actions.errorText(error, _('Unknown error.'));
			closeButton.hidden = false;
			button.disabled = false;
		});
	}

	function decorateSettingsModal(mac, attempt) {
		var actionRows;
		var actions;
		var modal;
		var editor;
		var section;
		var oldDetails;
		var oldLeft;
		var reclassifyButton;
		var leftPanel;
		var blocklisted;
		var trustCurrent;

		attempt = attempt || 0;
		actionRows = document.querySelectorAll('.sf-modal-actions');
		actions = actionRows.length ? actionRows[actionRows.length - 1] : null;
		modal = document.getElementById('modal_overlay') || (actions && actions.closest('.modal, .cbi-modal'));
		editor = modal && modal.querySelector('.sf-device-editor');

		/* Ищем редактор по структурному маркеру, чтобы код одинаково работал
		 * при любом языке LuCI и не зависел от текста заголовка модалки.
		 */
		if (!actions || !modal || !editor) {
			if (attempt < 20)
				window.setTimeout(function () { decorateSettingsModal(mac, attempt + 1); }, 50);
			return;
		}

		section = sectionByMac(mac);
		blocklisted = isBlocklisted(section, mac);
		trustCurrent = !!(section && section.identity_quarantine_mode);
		oldDetails = modal.querySelector('.sf-device-detection-modal');
		oldLeft = actions.querySelector('.sf-device-settings-left');
		if (oldDetails)
			oldDetails.remove();
		if (oldLeft)
			oldLeft.remove();
		if (editor)
			editor.appendChild(render(section));

		reclassifyButton = blocklisted ? null : E('button', {
			'class': 'sf-action sf-action-neutral sf-device-reclassify',
			'type': 'button',
			'data-device-reclassify': mac,
			'disabled': section ? null : 'disabled',
			'title': section ? (trustCurrent ?
				_('Trust this connection, remove quarantine, and detect the device type again') :
				_('Remove the manual type selection, collect signals, and detect the type again')) :
				_('Save the device before detecting it again'),
			'click': function (event) {
				event.preventDefault();
				reclassify(mac, event.currentTarget, trustCurrent);
			}
		}, trustCurrent ? _('Trust current connection') : _('Detect again'));

		leftPanel = E('div', { 'class': 'sf-device-settings-left' }, [
			E('div', { 'class': 'sf-device-presence-modal-status' }, deps.presence.statusText(deps.presence.get(mac))),
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
		button.addEventListener('click', function () {
			deps.presence.load(true).then(function () {
				decorateSettingsModal(mac, 0);
			});
		});
	}

	function macFromRow(row) {
		var match = String(row && row.textContent || '').toUpperCase().match(/(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/);
		return match ? deps.inventory.normalizeMac(match[0]) : '';
	}

	function decorateRows(root) {
		root.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function (row) {
			var cells = row.children;
			var mac = macFromRow(row);
			var actions = row.querySelector('.sf-row-actions') || cells[cells.length - 1];
			var oldEvidence = row.querySelector('.sf-detection-evidence');
			var oldReclassify = actions && actions.querySelector('[data-device-reclassify]');

			if (!mac || !actions)
				return;
			if (oldEvidence)
				oldEvidence.remove();
			if (oldReclassify)
				oldReclassify.remove();
			deps.presence.decorateRow(row, mac, actions);
			bindSettingsModal(mac, actions);
		});
	}

	return {
		render: render,
		decorateRows: decorateRows
	};
}

return baseclass.extend({ create: create });
