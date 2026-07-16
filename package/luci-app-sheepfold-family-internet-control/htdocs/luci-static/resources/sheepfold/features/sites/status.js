'use strict';
'require baseclass';
'require sheepfold.core.backend.router as routerBackend';
'require sheepfold.shared.icons as sharedIcons';

var state = {
	status: 'idle',
	values: {},
	error: '',
	pending: null,
	listeners: []
};

function safeCount(value) {
	var number = parseInt(value || '0', 10);

	return String(Number.isFinite(number) && number > 0 ? number : 0);
}

function reasonText(reason) {
	var messages = {
		invalid_confdir: _('The router DNS configuration directory is invalid.'),
		firewall_unavailable: _('Sheepfold firewall rules are not available.'),
		dnsmasq_config_invalid: _('The router DNS service rejected the new site list configuration.'),
		config_too_large: _('The combined site lists are too large for safe application on this router.'),
		restart_failed: _('The router DNS service could not restart with the new site lists.'),
		firewall_sync_failed: _('The router could not update the Sheepfold site filtering rules.')
	};

	return messages[reason] || '';
}

function describe(values) {
	var backend = String(values.policy_backend || 'unknown');
	var reason = String(values.policy_reason || 'not_applied');
	var requested = String(values.policy_requested || '0') === '1';
	var allowReady = String(values.policy_allowlist_ready || '0') === '1';
	var blockReady = String(values.policy_blocklist_ready || '0') === '1';
	var counts = _('Loaded domains: allowlist %s, blocklist %s.')
		.replace('%s', safeCount(values.allowlist_count))
		.replace('%s', safeCount(values.blocklist_count));

	if (!requested || backend === 'disabled') {
		return {
			kind: 'muted',
			title: _('Site list filtering is disabled.'),
			message: counts
		};
	}

	if (backend === 'adguard') {
		return {
			kind: 'ok',
			title: _('Site filtering is delegated to AdGuard Home.'),
			message: _('Configure allowlists and blocklists in AdGuard Home. Sheepfold does not duplicate or overwrite its DNS rules.')
		};
	}

	if (backend === 'dnsmasq' && reason === 'active') {
		return {
			kind: 'ok',
			title: _('Site lists are applied by Sheepfold.'),
			message: counts + ' ' + (allowReady ?
				_('Strict allowlist groups are protected by the loaded allowlist.') :
				_('No strict allowlist group is currently using the loaded allowlist.')) + ' ' + (blockReady ?
				_('The site blocklist is active.') :
				_('The site blocklist is not active.'))
		};
	}

	if (backend === 'waiting_for_lists' || reason === 'waiting_for_lists') {
		return {
			kind: 'warning',
			title: _('Sheepfold is waiting for the first successful site list download.'),
			message: _('Until verified domains are available, strict allowlist groups are left online instead of accidentally blocking all internet access.')
		};
	}

	if (backend === 'unsupported' || reason === 'dnsmasq_nftset_unavailable') {
		return {
			kind: 'warning',
			title: _('The router DNS service cannot apply Sheepfold site lists.'),
			message: _('Site list filtering is left off instead of incorrectly blocking devices. The router needs a dnsmasq build with nftset support.')
		};
	}

	if (backend === 'error') {
		return {
			kind: 'danger',
			title: _('Could not apply the new site lists.'),
			message: (reasonText(reason) ? reasonText(reason) + ' ' : '') +
				_('The previous working DNS configuration is kept when one exists.')
		};
	}

	return {
		kind: 'warning',
		title: _('Site list application status is not available yet.'),
		message: _('Refresh the status after the first list update or after saving the integration settings.')
	};
}

function updateProblems(node, values) {
	var count = safeCount(values.problem_count);

	if (count === '0') {
		node.hidden = true;
		node.textContent = '';
		return;
	}

	node.hidden = null;
	node.textContent = _('Sources with update errors: %s. Last working copies are kept.').replace('%s', count);
}

function paint(container, title, message, problems, refreshButton) {
	var description;

	if (state.status === 'loading' || state.status === 'idle') {
		container.className = 'sf-note sf-site-list-status sf-note-warning';
		title.textContent = _('Checking site list application status...');
		message.textContent = '';
		problems.hidden = true;
		refreshButton.disabled = true;
		return;
	}

	refreshButton.disabled = null;
	if (state.status === 'error') {
		container.className = 'sf-note sf-site-list-status sf-note-danger';
		title.textContent = _('Could not read site list application status.');
		message.textContent = state.error || _('Action failed.');
		problems.hidden = true;
		return;
	}

	description = describe(state.values || {});
	container.className = 'sf-note sf-site-list-status' +
		(description.kind === 'muted' ? '' : ' sf-note-' + description.kind);
	title.textContent = description.title;
	message.textContent = description.message;
	updateProblems(problems, state.values || {});
}

function notifyListeners() {
	state.listeners.slice().forEach(function (listener) { listener(); });
}

function load(force) {
	if (state.pending && !force)
		return state.pending;

	state.status = 'loading';
	state.error = '';
	notifyListeners();
	state.pending = routerBackend.withTimeout(
		['site-lists-status'],
		15000,
		_('Router command timed out.')
	).then(function (result) {
		routerBackend.ensureOk(result, _('Could not read site list application status.'));
		state.values = routerBackend.parseKeyValues(result.stdout || '');
		state.status = 'ready';
		notifyListeners();
		return state.values;
	}).catch(function (error) {
		state.status = 'error';
		state.error = routerBackend.errorText(error, _('Could not read site list application status.'));
		notifyListeners();
		return Promise.reject(error);
	}).finally(function () {
		state.pending = null;
	});

	return state.pending;
}

function panel() {
	var container = E('div', { 'class': 'sf-note sf-site-list-status', 'data-site-list-status': '1' });
	var title = E('strong', {});
	var message = E('span', {});
	var problems = E('span', { 'class': 'sf-site-list-problems', 'hidden': 'hidden' });
	var refreshButton;
	var repaint = function () { paint(container, title, message, problems, refreshButton); };

	refreshButton = sharedIcons.button(_('Refresh status'), 'refresh', 'neutral', function () {
		load(true).catch(function () {});
	});
	container.appendChild(E('div', { 'class': 'sf-site-list-status-head' }, [title, refreshButton]));
	container.appendChild(message);
	container.appendChild(problems);
	state.listeners = [repaint];
	repaint();

	if (state.status === 'idle')
		window.setTimeout(function () { load().catch(function () {}); }, 0);

	return container;
}

return baseclass.extend({
	load: load,
	panel: panel,
	describe: describe,
	status: function () { return state.status; }
});
