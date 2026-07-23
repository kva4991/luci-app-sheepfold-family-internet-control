'use strict';
'require baseclass';

/* §devpas1
 * Presentation for optional heavy detection tools. The module owns only local UI
 * state; package-manager access is supplied through narrow callbacks.
 */
function create(deps) {
	var mode = deps.mode ? deps.mode() : 'full';
	var status = null;
	var loading = false;
	var root = null;
	var note = null;
	var action = null;
	var pollTimer = null;

	function numberValue(value) {
		var parsed = parseInt(value, 10);
		return isNaN(parsed) ? 0 : parsed;
	}

	function stopPoll() {
		if (pollTimer) {
			window.clearTimeout(pollTimer);
			pollTimer = null;
		}
	}

	function schedulePoll(attempt) {
		stopPoll();
		if (attempt >= 60)
			return;
		pollTimer = window.setTimeout(function () {
			load(attempt + 1);
		}, 2000);
	}

	function setNote(className, text) {
		if (!note)
			return;
		note.className = 'sf-note ' + className;
		note.textContent = text;
	}

	function update() {
		var state = status && status.state || 'idle';
		var available = status && status.nmap_available === '1';
		var canInstall = status && status.can_install === '1';
		var reason = status && status.reason || '';
		var freeMb = Math.floor(numberValue(status && status.free_kb) / 1024);
		var requiredMb = Math.ceil(numberValue(status && status.minimum_free_kb) / 1024);

		if (!root)
			return;
		root.hidden = mode === 'disabled' ? 'hidden' : null;
		if (mode === 'disabled') {
			stopPoll();
			return;
		}
		if (mode === 'reduced') {
			stopPoll();
			setNote('sf-note-ok', _('Reduced mode intentionally skips port checks; nmap is not required.'));
			action.hidden = 'hidden';
			return;
		}
		if (loading && !status) {
			setNote('', _('Checking optional port-scan support…'));
			action.hidden = 'hidden';
			return;
		}
		if (available) {
			stopPoll();
			setNote('sf-note-ok', _('Full mode includes bounded local port checks through nmap.'));
			action.hidden = 'hidden';
			return;
		}
		if (state === 'running' || state === 'queued') {
			setNote('sf-note-warning', _('Installing optional nmap package. Full mode continues without port checks until installation finishes.'));
			action.hidden = 'hidden';
				return;
		}

		setNote('sf-note-warning', _('Full mode without port checks. Device detection still works, but server, camera and printer hints may be less accurate.'));
		action.hidden = canInstall ? null : 'hidden';
		action.disabled = null;
		if (!canInstall && reason === 'insufficient_space')
			note.textContent += ' ' + _('Free space:') + ' ' + freeMb + ' MB; ' + _('required:') + ' ' + requiredMb + ' MB.';
		else if (!canInstall && reason === 'package_manager_missing')
			note.textContent += ' ' + _('No supported OpenWrt package manager is available.');
		else if (state === 'failed')
			note.textContent += ' ' + _('The last installation attempt failed; review the router system log before retrying.');
	}

	function load(attempt) {
		loading = true;
		return deps.status().then(function (nextStatus) {
			status = nextStatus || {};
			loading = false;
			update();
			if ((status.state === 'running' || status.state === 'queued') && (attempt || 0) < 60)
				schedulePoll(attempt || 0);
			return status;
		}, function (error) {
			loading = false;
			setNote('sf-note-warning', deps.errorText(error, _('Could not check optional nmap support.')));
			action.hidden = 'hidden';
		});
	}

	function install(event) {
		if (event)
			event.preventDefault();
		if (!deps.confirm(_('Install the optional nmap package? The router will update package indexes, check free flash space, and install only nmap.')))
			return;
		deps.install(action).then(function () {
			status = Object.assign({}, status || {}, { state: 'queued', can_install: '0' });
			update();
			schedulePoll(0);
		}, function () {
			load(0);
		});
	}

	function render() {
		stopPoll();
		note = E('div', { 'class': 'sf-note' });
		action = E('button', {
			'class': 'sf-action sf-action-neutral',
			'type': 'button',
			'data-sf-action-key': 'device-detection-install-nmap',
			'hidden': 'hidden',
			'click': install
		}, _('Install optional nmap'));
		root = E('div', { 'class': 'sf-detection-tools-status' }, [note, action]);
		update();
		load(0);
		return root;
	}

	return {
		render: render,
		setMode: function (value) {
			mode = value === 'reduced' ? 'reduced' : (value === 'disabled' ? 'disabled' : 'full');
			update();
		},
		reload: function () { return load(0); }
	};
}

return baseclass.extend({ create: create });
