'use strict';
'require baseclass';

function bandKind(band, channel) {
	var value = String(band || '').toLowerCase().trim();
	var channelNumber = parseInt(channel, 10);

	if (value === '2g' || value === '2ghz' || value.indexOf('2.4') !== -1 || /^11b$|^11g$|^11ng$|^bg$/.test(value))
		return '2g';
	if (value === '5g' || value === '5ghz' || /^11a$|^11ac$/.test(value))
		return '5g';
	if (value === '6g' || value === '6ghz')
		return '6g';
	if (!isNaN(channelNumber) && channelNumber >= 36)
		return '5g';
	if (!isNaN(channelNumber) && channelNumber >= 1 && channelNumber <= 14)
		return '2g';

	return '';
}

function readNetworks(sections, getValue) {
	return sections.filter(function (section) {
		return !section.mode || section.mode === 'ap';
	}).map(function (section) {
		var device = section.device || '';
		var sectionName = section['.name'] || '';
		var radioDisabled = device ? getValue('wireless', device, 'disabled', '0') === '1' : false;
		var interfaceDisabled = section.disabled === '1';
		var band = device ? (getValue('wireless', device, 'band', '') || getValue('wireless', device, 'hwmode', '')) : '';
		var channel = device ? (getValue('wireless', device, 'channel', 'auto') || 'auto') : 'auto';
		var ssid = section.ssid || (sectionName ? getValue('wireless', sectionName, 'ssid', '') : '') || '';
		var encryption = section.encryption || (sectionName ? getValue('wireless', sectionName, 'encryption', '') : '') || 'none';
		var password = section.key || (sectionName ? getValue('wireless', sectionName, 'key', '') : '') || '';

		return {
			title: ssid || device || _('Network'), bandKind: bandKind(band, channel), sectionName: sectionName,
			device: device, ssid: ssid, password: password, encryption: encryption, channel: channel,
			enabled: !interfaceDisabled && !radioDisabled, radioDisabled: radioDisabled
		};
	});
}

function editorSnapshot(editor) {
	return {
		ssid: String(editor.ssidInput.value || '').trim(),
		password: String(editor.passwordInput.value || ''),
		encryption: String(editor.securitySelect.value || ''),
		channel: String(editor.channelSelect.value || 'auto'),
		enabled: !!editor.enabledInput.checked
	};
}

function editorIsDirty(editor) {
	var current = editorSnapshot(editor);
	return current.ssid !== editor.original.ssid || current.password !== editor.original.password ||
		current.encryption !== editor.original.encryption || current.channel !== editor.original.channel ||
		current.enabled !== editor.original.enabled;
}

function securityOptions(value) {
	var options = [
		['sae-mixed', 'WPA2/WPA3 mixed'], ['psk2', 'WPA2-PSK'], ['sae', 'WPA3-SAE'],
		['psk-mixed', 'WPA/WPA2 mixed'], ['wep', 'WEP'], ['none', _('Open network')]
	];

	if (value && !options.some(function (item) { return item[0] === value; }))
		options.unshift([value, value]);

	return options;
}

function networkBox(network, index, deps) {
	var card;
	var ssidInput = E('input', { 'class': 'cbi-input-text', 'value': network.ssid || '' });
	var passwordInput = E('input', { 'class': 'cbi-input-text', 'value': network.password || '' });
	var enabledInput = E('input', {
		'type': 'checkbox',
		'checked': network.enabled ? 'checked' : null,
		'aria-label': _('Turn this Wi-Fi network on or off.')
	});
	var powerState = E('span', { 'class': 'sf-wifi-power-state', 'aria-live': 'polite' });
	var powerControl = E('label', {
		'class': 'sf-wifi-power',
		'title': _('Turn this Wi-Fi network on or off.')
	}, [
		enabledInput,
		E('span', { 'class': 'sf-wifi-power-track', 'aria-hidden': 'true' }, [
			E('span', { 'class': 'sf-wifi-power-knob' })
		]),
		powerState
	]);
	var securitySelect = E('select', { 'class': 'cbi-input-select' }, securityOptions(network.encryption).map(function (item) {
		return E('option', { 'value': item[0], 'selected': item[0] === network.encryption ? 'selected' : null }, item[1]);
	}));
	var channelSelect = E('select', { 'class': 'cbi-input-select' }, [
		['auto', _('Auto')], ['1', '1'], ['6', '6'], ['11', '11'], ['36', '36'], ['44', '44'], ['149', '149']
	].map(function (item) {
		return E('option', { 'value': item[0], 'selected': item[0] === network.channel ? 'selected' : null }, item[1]);
	}));
	var qrWrap = E('div', { 'class': 'sf-wifi-qr-code' });

	function updateQr() {
		qrWrap.replaceChildren(deps.qrCode(deps.qrPayload(ssidInput.value, passwordInput.value, securitySelect.value)));
	}

	function updatePowerState() {
		powerState.textContent = enabledInput.checked ? _('On') : _('Off');
		if (card)
			card.classList.toggle('is-disabled', !enabledInput.checked);
	}

	ssidInput.addEventListener('input', updateQr);
	passwordInput.addEventListener('input', updateQr);
	securitySelect.addEventListener('change', updateQr);
	enabledInput.addEventListener('change', updatePowerState);
	updateQr();

	deps.registerEditor({
		sectionName: network.sectionName || '', device: network.device || '', ssidInput: ssidInput,
		passwordInput: passwordInput, securitySelect: securitySelect, channelSelect: channelSelect,
		enabledInput: enabledInput, radioDisabled: !!network.radioDisabled,
		original: {
			ssid: String(network.ssid || '').trim(), password: String(network.password || ''),
			encryption: String(network.encryption || 'none'), channel: String(network.channel || 'auto'),
			enabled: !!network.enabled
		}
	});

	card = E('div', {
		'class': 'sf-box sf-wifi-network' + (network.enabled ? '' : ' is-disabled'),
		'style': 'background-color: ' + deps.cardColor(index) + ';'
	}, [
		E('h4', { 'class': 'sf-wifi-title' }, deps.title(network, powerControl)),
		E('div', { 'class': 'sf-wifi-fields' }, [
			E('label', { 'class': 'sf-field' }, [E('span', {}, _('SSID')), ssidInput]),
			E('label', { 'class': 'sf-field' }, [E('span', {}, _('Password')), passwordInput]),
			E('label', { 'class': 'sf-field' }, [E('span', {}, _('Security')), securitySelect]),
			E('label', { 'class': 'sf-field' }, [E('span', {}, _('Channel')), channelSelect])
		]),
		E('div', { 'class': 'sf-wifi-qr' }, [qrWrap, E('small', {}, _('Scan to connect to this Wi-Fi network.'))])
	]);
	updatePowerState();

	return card;
}

return baseclass.extend({
	bandKind: bandKind,
	readNetworks: readNetworks,
	editorSnapshot: editorSnapshot,
	editorIsDirty: editorIsDirty,
	securityOptions: securityOptions,
	networkBox: networkBox
});
