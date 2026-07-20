'use strict';
'require baseclass';
'require sheepfold.core.backend.router as routerBackend';

var state = {
	status: 'idle',
	values: null,
	error: null,
	pending: null,
	listeners: []
};

function infoValue(value, fallback) {
	value = String(value == null ? '' : value).trim();
	return value || fallback || 'unknown';
}

function translatedStatus(value) {
	var labels = {
		online: _('Online'),
		offline: _('Offline'),
		limited: _('Limited'),
		unknown: _('Unknown'),
		enabled: _('Enabled'),
		disabled: _('Disabled'),
		yes: _('Installed'),
		no: _('Not installed')
	};

	return labels[value] || value || _('Unknown');
}

function formatPingMs(value) {
	value = String(value == null ? '' : value).trim();
	return !value || value === 'timeout' ? _('No response') : value + ' ms';
}

function probeLine(host, pingMs) {
	var ping = String(pingMs == null ? '' : pingMs).trim();

	return !ping || ping === 'timeout'
		? host + ' ' + _('does not respond')
		: host + ' ' + _('responds') + ' (' + _('ping') + ' ' + ping + ')';
}

function internetDetails(values) {
	var reason = String(values.internet_reason || '').trim();
	var lines = [
		translatedStatus(values.internet_status),
		probeLine('ya.ru', values.ping_ya_ru_ms || values.ping_yandex_ms),
		probeLine('gosuslugi.ru', values.ping_gosuslugi_ru_ms),
		probeLine('ntp1.vniiftri.ru', values.ping_ntp_vniiftri_ru_ms)
	];

	if (reason && values.internet_status !== 'online')
		lines.splice(1, 0, reason);

	return E('div', { 'class': 'sf-info-multiline' }, lines.map(function (line) {
		return E('div', {}, line);
	}));
}

function hasData(values) {
	return !!(values && (
		values.sheepfold_version || values.current_time || values.router_model ||
		values.firmware_version || values.openwrt_release || values.internet_status || values.storage_space
	));
}

function notifyListeners() {
	state.listeners.slice().forEach(function (listener) { listener(); });
}

function load(force) {
	if (state.pending && !force)
		return state.pending;

	state.status = 'loading';
	state.error = null;
	notifyListeners();

	state.pending = routerBackend.withTimeout(['router-info'], 20000, _('Router command timed out.')).then(function (result) {
		var values = routerBackend.parseKeyValues(result.stdout || '');

		if (Number(result && result.code || 0) !== 0)
			throw new Error(routerBackend.errorText(result, _('Could not load router information.')));
		if (!hasData(values))
			throw new Error(_('Router diagnostics returned empty data. Try Refresh or run sheepfold-router-control router-info on the router.'));

		state.values = values;
		state.status = 'ready';
		state.error = null;
		notifyListeners();
		return values;
	}).catch(function (error) {
		state.status = 'error';
		state.error = routerBackend.errorText(error, _('Could not load router information.'));
		notifyListeners();
		return Promise.reject(error);
	}).finally(function () {
		state.pending = null;
	});

	return state.pending;
}

function packageStatus(status) {
	var labels = { up_to_date: _('package up to date'), outdated: _('package outdated') };
	return labels[status] || '';
}

function packageInfo(installed, version, versionStatus) {
	var versionText = infoValue(version);
	var statusLabel = installed === 'yes' ? packageStatus(versionStatus) : '';

	if (statusLabel)
		versionText += ', ' + statusLabel;

	return translatedStatus(installed) + ' (' + versionText + ')';
}

function row(label, value) {
	return E('div', { 'class': 'sf-info-row' }, [E('span', {}, label), E('strong', {}, value)]);
}

function wifiModules(values) {
	var count = parseInt(values.wifi_count || '0', 10) || 0;
	var rows = [];

	for (var index = 1; index <= count; index++) {
		rows.push(E('div', { 'class': 'sf-info-table-row' }, [
			E('div', {}, infoValue(values['wifi_' + index + '_name'])),
			E('div', {}, translatedStatus(values['wifi_' + index + '_status'])),
			E('div', {}, infoValue(values['wifi_' + index + '_band'])),
			E('div', {}, infoValue(values['wifi_' + index + '_channel'])),
			E('div', {}, infoValue(values['wifi_' + index + '_type'])),
			E('div', {}, infoValue(values['wifi_' + index + '_path'])),
			E('div', {}, infoValue(values['wifi_' + index + '_country'])),
			E('div', {}, infoValue(values['wifi_' + index + '_mode']))
		]));
	}

	if (!rows.length)
		return E('div', { 'class': 'sf-note sf-note-warning' }, _('No active Wi-Fi networks were found in the router wireless config.'));

	return E('div', { 'class': 'sf-info-table sf-info-wifi-table' }, [
		E('div', { 'class': 'sf-info-table-row sf-info-table-head' }, [
			E('div', {}, _('Module')), E('div', {}, _('Status')), E('div', {}, _('Band')),
			E('div', {}, _('Channel')), E('div', {}, _('Driver/type')), E('div', {}, _('Path')),
			E('div', {}, _('Country')), E('div', {}, _('Mode'))
		])
	].concat(rows));
}

function renderContent(body, values) {
	var podkop = packageInfo(values.podkop_installed, values.podkop_version, values.podkop_version_status);
	var adguard = translatedStatus(values.adguard_installed) + ' (' + infoValue(values.adguard_version) + ')';

	body.replaceChildren(
		E('div', { 'class': 'sf-grid two sf-info-grid' }, [
			E('div', { 'class': 'sf-box' }, [
				row(_('Current router time'), infoValue(values.current_time)),
				row(_('Current Sheepfold version'), infoValue(values.sheepfold_version)),
				row(_('Internet connection status'), internetDetails(values)),
				row(_('Router firmware version'), infoValue(values.firmware_version)),
				row(_('OpenWRT release'), infoValue(values.openwrt_release)),
				row(_('Kernel version'), infoValue(values.kernel_version))
			]),
			E('div', { 'class': 'sf-box' }, [
				row(_('Router model'), infoValue(values.router_model)),
				row(_('Router uptime'), infoValue(values.uptime)),
				row(_('Load average'), infoValue(values.load_average)),
				row(_('Memory'), infoValue(values.memory)),
				row(_('Router storage'), infoValue(values.storage_space)),
				row(_('LAN ports'), infoValue(values.lan_ports_count, '0') + ' (' + infoValue(values.lan_ports) + ')'),
				row(_('Podkop'), podkop),
				row(_('AdGuard Home'), adguard)
			])
		]),
		E('div', { 'class': 'sf-box' }, [E('h4', {}, _('Wi-Fi modules')), wifiModules(values)])
	);
}

function spinner() {
	return E('div', { 'class': 'sf-info-loading' }, [E('div', { 'class': 'sf-spinner', 'aria-hidden': 'true' })]);
}

function paint(body, refreshButton) {
	if (state.status === 'loading' || state.status === 'idle') {
		body.replaceChildren(spinner());
		if (refreshButton) refreshButton.disabled = true;
		return;
	}

	if (refreshButton) refreshButton.disabled = null;
	if (state.status === 'error') {
		body.replaceChildren(E('div', { 'class': 'sf-note sf-note-warning' }, state.error));
		return;
	}

	renderContent(body, state.values || {});
}

function panel() {
	var body = E('div', { 'class': 'sf-info-body' });
	var refreshButton;
	var repaint = function () { paint(body, refreshButton); };

	refreshButton = E('button', {
		'class': 'sf-action sf-action-neutral',
		'click': function (event) {
			event.preventDefault();
			load(true).catch(function () {});
		}
	}, _('Refresh information'));

	state.listeners = [repaint];
	repaint();
	if (state.status === 'idle')
		window.setTimeout(function () { load().catch(function () {}); }, 0);

	return E('div', { 'class': 'sf-settings-section' }, [
		E('div', { 'class': 'sf-panel-head' }, [
			E('div', {}, [E('p', { 'class': 'sf-section-intro' }, _('Router information'))]),
			refreshButton
		]),
		body
	]);
}

return baseclass.extend({
	load: load,
	status: function () { return state.status; },
	panel: panel,
	formatPingMs: formatPingMs,
	probeLine: probeLine,
	internetDetails: internetDetails,
	hasData: hasData,
	infoValue: infoValue,
	translatedStatus: translatedStatus,
	packageStatus: packageStatus,
	packageInfo: packageInfo,
	row: row,
	wifiModules: wifiModules,
	renderContent: renderContent,
	spinner: spinner,
	paint: paint
});
