'use strict';
'require baseclass';
'require ui';
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
		firewall_sync_failed: _('The router could not update the Sheepfold site filtering rules.'),
		authentication_failed: _('AdGuard Home rejected the configured username or password.'),
		api_unreachable: _('AdGuard Home did not answer at the configured address.'),
		api_timeout: _('The AdGuard Home API request timed out.'),
		api_unsupported: _('This AdGuard Home version does not provide the required API endpoint.'),
		api_rate_limited: _('AdGuard Home is temporarily limiting API requests.'),
		api_server_error: _('AdGuard Home reported an internal API error.'),
		api_request_rejected: _('AdGuard Home rejected the requested filter change.'),
		api_response_too_large: _('The AdGuard Home API response is too large for safe processing on this router.'),
		api_action_forbidden: _('Sheepfold refused an AdGuard Home action outside its managed filter.'),
		api_http_error: _('AdGuard Home returned an unexpected API response.'),
		invalid_url: _('The AdGuard Home address is invalid.'),
		insecure_remote_url: _('Use HTTPS when AdGuard Home is running on another device.'),
		credentials_incomplete: _('Enter both the AdGuard Home username and password.'),
		credentials_invalid: _('The AdGuard Home credentials contain unsupported characters.'),
		invalid_api_response: _('The AdGuard Home API returned unreadable data.'),
		invalid_refresh_response: _('AdGuard Home returned an unreadable filter refresh result.'),
		invalid_check_response: _('AdGuard Home returned an unreadable control-rule check result.'),
		invalid_control_rule: _('Sheepfold could not prepare a safe AdGuard Home control rule.'),
		control_rule_not_confirmed: _('AdGuard Home did not confirm the Sheepfold control rule.'),
		server_not_running: _('The AdGuard Home DNS server is not running.'),
		protection_disabled: _('AdGuard Home protection is disabled.'),
		filtering_disabled: _('DNS filtering is disabled in AdGuard Home.'),
		filter_not_confirmed: _('AdGuard Home did not confirm the Sheepfold filter.'),
		filter_disable_not_confirmed: _('AdGuard Home did not confirm that the old Sheepfold filter was disabled.'),
		duplicate_managed_filter: _('AdGuard Home contains multiple filters with the exact Sheepfold feed address.'),
		invalid_owned_filter_url: _('The saved Sheepfold filter address is invalid and was not trusted.'),
		feed_unreachable: _('The local Sheepfold filter feed is unavailable to AdGuard Home.'),
		feed_mismatch: _('The local Sheepfold filter feed returned unexpected content.'),
		client_ip_missing: _('A device covered by the policy has no current IPv4 address.'),
		feed_too_large: _('The generated AdGuard Home filter is too large for safe application on this router.'),
		json_parser_unavailable: _('The router JSON parser required for the AdGuard Home API is unavailable.'),
		topology_without_adguard: _('AdGuard Home is not selected in the integration chain.'),
		adguard_helper_unavailable: _('The Sheepfold AdGuard Home adapter is unavailable.'),
		adguard_cleanup_failed: _('The previous Sheepfold filter could not be disabled in AdGuard Home.'),
		manual_cleanup_required: _('Automatic AdGuard Home management is off; disable the old Sheepfold filter there manually.')
	};

	return messages[reason] || '';
}

function sourceReasonText(reason) {
	var messages = {
		download_tool_missing: _('The router has no program for secure list downloads.'),
		download_failed: _('The source server did not answer or the connection was interrupted.'),
		download_timed_out: _('The source server did not answer before the safe timeout.'),
		empty_download: _('The source returned an empty file.'),
		source_too_large: _('The downloaded file is too large for safe processing on this router.'),
		payload_too_large: _('The unpacked list is too large for safe processing on this router.'),
		unsupported_archive: _('This archive format is not supported.'),
		invalid_archive: _('The downloaded archive is damaged or cannot be unpacked safely.'),
		unsafe_archive_entry: _('The archive contains an unsafe file name.'),
		archive_missing_domains: _('No domain list was found in the archive.'),
		html_document: _('The source returned a web page instead of a domain list.'),
		no_valid_domains: _('The downloaded file contains no valid domains.'),
		too_many_domains: _('The source contains too many domains for this router.'),
		too_many_total_domains: _('The combined lists contain too many domains for this router.'),
		too_many_sources: _('Too many sources of this list type are configured.'),
		invalid_source: _('The source address is invalid.'),
		suspicious_shrink: _('The new file contains far fewer domains than the last working copy. Sheepfold kept the previous copy.')
	};

	return messages[reason] || _('The source could not be updated.');
}

function formatTime(value) {
	var seconds = parseInt(value || '', 10);

	if (!Number.isFinite(seconds) || seconds <= 0)
		return _('Not yet');

	return new Date(seconds * 1000).toLocaleString();
}

function sourceRecords(values) {
	var count = parseInt(values.source_count || '0', 10);
	var records = [];
	var index;

	if (!Number.isFinite(count) || count < 1)
		return records;

	for (index = 1; index <= count; index++) {
		records.push({
			kind: values['source_' + index + '_kind'] || '',
			label: values['source_' + index + '_label'] || _('Unnamed source'),
			status: values['source_' + index + '_status'] || 'pending',
			cachedCount: safeCount(values['source_' + index + '_cached_count']),
			updatedAt: values['source_' + index + '_updated_at'] || '',
			reason: values['source_' + index + '_reason'] || '',
			failureCount: safeCount(values['source_' + index + '_failure_count']),
			nextRetryAt: values['source_' + index + '_next_retry_at'] || '',
			canAcceptShrink: values['source_' + index + '_can_accept_shrink'] === '1',
			previousCount: values['source_' + index + '_previous_count'] || '',
			candidateCount: values['source_' + index + '_candidate_count'] || ''
		});
	}

	return records;
}

function acceptReducedLists() {
	return routerBackend.withTimeout(
		['site-lists-accept-shrink'],
		180000,
		_('The site list update timed out.')
	).then(function (result) {
		routerBackend.ensureOk(result, _('Could not accept the reduced site list.'));
		return load(true);
	});
}

function showAcceptReducedListsModal() {
	var remaining = 10;
	var timer;
	var confirmButton = E('button', {
		'class': 'btn cbi-button cbi-button-positive',
		'disabled': 'disabled',
		'click': function (event) {
			event.preventDefault();
			window.clearInterval(timer);
			confirmButton.disabled = true;
			confirmButton.textContent = _('Updating site lists...');
			acceptReducedLists().then(function () {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, _('The reduced site list was accepted and applied.')), 'info');
			}).catch(function (error) {
				confirmButton.disabled = false;
				confirmButton.textContent = _('Try again');
				ui.addNotification(null, E('p', {}, routerBackend.errorText(error, _('Could not accept the reduced site list.'))), 'error');
			});
		}
	}, _('Accept reduced lists') + ' (' + remaining + ')');

	timer = window.setInterval(function () {
		remaining -= 1;
		confirmButton.textContent = remaining > 0 ?
			_('Accept reduced lists') + ' (' + remaining + ')' :
			_('Accept reduced lists');
		if (remaining <= 0) {
			window.clearInterval(timer);
			confirmButton.disabled = false;
		}
	}, 1000);

	ui.showModal(_('Accept a greatly reduced site list?'), [
		E('div', { 'class': 'sf-note sf-note-warning' }, [
			E('p', {}, _('One or more sources now contain far fewer domains than their last working copies. This can be a legitimate source cleanup, but it can also mean that the download is incomplete or damaged.')),
			E('p', {}, _('Sheepfold is currently using the previous working copies. Continue only after checking the source settings.'))
		]),
		E('div', { 'class': 'right sf-modal-actions' }, [
			E('button', {
				'class': 'btn cbi-button',
				'click': function (event) {
					event.preventDefault();
					window.clearInterval(timer);
					ui.hideModal();
				}
			}, _('Cancel')),
			confirmButton
		])
	]);
}

function adguardDetails(values) {
	var version = String(values.policy_adguard_server_version || '').slice(0, 100);
	var port = safeCount(values.policy_adguard_dns_port);
	var failures = safeCount(values.policy_adguard_consecutive_failures);
	var result = '';

	if (version && port !== '0')
		result = _('AdGuard Home version: %s. DNS port: %s.')
			.replace('%s', version)
			.replace('%s', port);
	else if (version)
		result = _('AdGuard Home version: %s.').replace('%s', version);

	if (String(values.policy_adguard_dns_info_available || '0') !== '1')
		result += (result ? ' ' : '') + _('The AdGuard Home DNS configuration could not be read; the active filter remains unchanged.');

	if (String(values.policy_adguard_engine_checked || '0') === '1')
		result += (result ? ' ' : '') + _('Control rules confirmed: %s of %s.')
			.replace('%s', safeCount(values.policy_adguard_engine_checks_passed))
			.replace('%s', safeCount(values.policy_adguard_engine_checks_required));

	if (failures !== '0')
		result += (result ? ' ' : '') + _('Consecutive failed AdGuard Home checks: %s.').replace('%s', failures);

	return result;
}

function describe(values) {
	var backend = String(values.policy_backend || 'unknown');
	var reason = String(values.policy_reason || 'not_applied');
	var requested = String(values.policy_requested || '0') === '1';
	var allowReady = String(values.policy_allowlist_ready || '0') === '1';
	var blockReady = String(values.policy_blocklist_ready || '0') === '1';
	var fallback = String(values.policy_adguard_fallback || '0') === '1';
	var cleanupFailed = String(values.policy_adguard_cleanup_failed || '0') === '1';
	var adguardReason = String(values.policy_adguard_reason || '');
	var counts = _('Loaded domains: allowlist %s, blocklist %s.')
		.replace('%s', safeCount(values.allowlist_count))
		.replace('%s', safeCount(values.blocklist_count));

	if (cleanupFailed) {
		return {
			kind: 'warning',
			title: _('Site filtering needs attention.'),
			message: (reasonText(adguardReason) || _('The old AdGuard Home filter may still be active.')) + ' ' + counts
		};
	}

	if (backend === 'error') {
		return {
			kind: 'danger',
			title: _('Could not apply the new site lists.'),
			message: (reasonText(reason) ? reasonText(reason) + ' ' : '') +
				(reasonText(adguardReason) ? reasonText(adguardReason) + ' ' : '') +
				_('The previous working DNS configuration is kept when one exists.')
		};
	}

	if (!requested || backend === 'disabled') {
		return {
			kind: 'muted',
			title: _('Site list filtering is disabled.'),
			message: counts
		};
	}

	if (backend === 'adguard') {
		if (reason !== 'active') {
			return {
				kind: 'warning',
				title: _('AdGuard Home is selected, but Sheepfold cannot confirm the site lists.'),
				message: reason === 'manual_unverified' ?
					_('Automatic management is off. Configure the lists in AdGuard Home and verify them there.') :
					_('The site lists were delegated without a confirmed Sheepfold-managed filter.')
			};
		}
		if (String(values.policy_adguard_engine_checked || '0') !== '1') {
			return {
				kind: 'warning',
				title: _('The AdGuard Home filter exists, but its control rules are not confirmed.'),
				message: (reasonText(values.policy_adguard_engine_check_reason) ||
					_('Save the integration settings or refresh the site lists to run a new check.')) + ' ' + counts
			};
		}
		if (String(values.policy_adguard_dns_path_status || 'not_checked') !== 'confirmed') {
			return {
				kind: 'warning',
				title: _('The Sheepfold filter is active in AdGuard Home, but the DNS path is not yet verified.'),
				message: counts + ' ' + adguardDetails(values) + ' ' +
					_('The filter engine is confirmed. A later end-to-end check must still prove that home devices send DNS requests through AdGuard Home.') + ' ' +
					_('Only the Sheepfold-managed filter is changed; other AdGuard Home filters are kept.')
			};
		}
		return {
			kind: 'ok',
			title: _('Site lists are applied by AdGuard Home.'),
			message: counts + ' ' + adguardDetails(values) + ' ' +
				_('Only the Sheepfold-managed filter is changed; other AdGuard Home filters are kept.')
		};
	}

	if (backend === 'dnsmasq' && reason === 'active') {
		return {
			kind: 'ok',
			title: fallback ? _('Site lists are working through Sheepfold.') : _('Site lists are applied by Sheepfold.'),
			message: counts + ' ' + (allowReady ?
				_('Strict allowlist groups are protected by the loaded allowlist.') :
				_('No strict allowlist group is currently using the loaded allowlist.')) + ' ' + (blockReady ?
				_('The site blocklist is active.') :
				_('The site blocklist is not active.')) + (fallback ?
				' ' + (reasonText(adguardReason) || _('AdGuard Home was unavailable, so Sheepfold used its built-in filtering.')) : '')
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

	return {
		kind: 'warning',
		title: _('Site list application status is not available yet.'),
		message: _('Refresh the status after the first list update or after saving the integration settings.')
	};
}

function updateProblems(node, values) {
	var count = safeCount(values.problem_count);
	var sources = sourceRecords(values);
	var canAcceptShrink = sources.some(function (source) { return source.canAcceptShrink; });
	var children;
	var rows = sources.map(function (source) {
		var kindLabel = source.kind === 'allowlist' ? _('Site allowlist') : _('Site blocklist');
		var statusLabel = source.status === 'ok' ? _('Working') :
			(source.status === 'error' ? _('Update error') : _('Waiting for first update'));
		var details = [
			_('Domains in the last working copy') + ': ' + source.cachedCount,
			_('Last successful update') + ': ' + formatTime(source.updatedAt)
		];

		if (source.status === 'error') {
			details.push(sourceReasonText(source.reason));
			if (source.canAcceptShrink && source.previousCount && source.candidateCount)
				details.push(_('Domains before: %s; in the new file: %s.')
					.replace('%s', source.previousCount).replace('%s', source.candidateCount));
			details.push(_('Failed attempts') + ': ' + source.failureCount);
			if (source.nextRetryAt)
				details.push(_('Next automatic attempt') + ': ' + formatTime(source.nextRetryAt));
		}

		return E('div', { 'class': 'sf-site-source-row sf-site-source-' + source.status }, [
			E('div', { 'class': 'sf-site-source-title' }, [
				E('strong', {}, source.label),
				E('span', { 'class': 'sf-site-source-kind' }, kindLabel),
				E('span', { 'class': 'sf-site-source-state' }, statusLabel)
			]),
			E('small', {}, details.join(' · '))
		]);
	});

	if (!sources.length && count === '0') {
		node.hidden = true;
		node.replaceChildren();
		return;
	}

	node.hidden = null;
	children = [E('div', { 'class': 'sf-site-source-head' }, [
			E('strong', {}, _('Configured site list sources')),
			canAcceptShrink ? E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': function (event) {
					event.preventDefault();
					showAcceptReducedListsModal();
				}
			}, _('Review and accept reduced lists')) : ''
		])].concat(rows);
	if (count !== '0') {
		children.push(E('small', { 'class': 'sf-site-source-summary' },
			_('Sources with update errors: %s. Last working copies are kept.').replace('%s', count)));
	}
	// DOM replaceChildren не разворачивает вложенный массив и напечатает
	// "[object HTMLDivElement]". Передаём каждый подготовленный узел отдельно.
	node.replaceChildren.apply(node, children);
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
	var problems = E('div', { 'class': 'sf-site-list-problems', 'hidden': 'hidden' });
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

function compactPanel() {
	var container = E('div', { 'class': 'sf-site-filter-status sf-status-warning', 'data-site-list-status': 'compact' });
	var lamp = E('span', { 'class': 'sf-status-lamp', 'aria-hidden': 'true' });
	var title = E('strong', {});
	var message = E('small', {});
	var refreshButton;
	var repaint = function () {
		var description;

		if (state.status === 'loading' || state.status === 'idle') {
			container.className = 'sf-site-filter-status sf-status-warning';
			title.textContent = _('Checking site list application status...');
			message.textContent = '';
			refreshButton.disabled = true;
			return;
		}

		refreshButton.disabled = null;
		if (state.status === 'error') {
			container.className = 'sf-site-filter-status sf-status-danger';
			title.textContent = _('Could not read site list application status.');
			message.textContent = state.error || _('Action failed.');
			return;
		}

		description = describe(state.values || {});
		container.className = 'sf-site-filter-status sf-status-' +
			(description.kind === 'ok' ? 'ok' : (description.kind === 'danger' ? 'danger' :
				(description.kind === 'muted' ? 'muted' : 'warning')));
		title.textContent = description.title;
		message.textContent = description.message;
	};

	refreshButton = sharedIcons.button(_('Refresh status'), 'refresh', 'neutral', function () {
		load(true).catch(function () {});
	});
	container.appendChild(lamp);
	container.appendChild(E('span', { 'class': 'sf-site-filter-status-copy' }, [title, message]));
	container.appendChild(refreshButton);
	state.listeners = [repaint];
	repaint();
	if (state.status === 'idle')
		window.setTimeout(function () { load().catch(function () {}); }, 0);

	return container;
}

return baseclass.extend({
	load: load,
	panel: panel,
	compactPanel: compactPanel,
	describe: describe,
	status: function () { return state.status; }
});
