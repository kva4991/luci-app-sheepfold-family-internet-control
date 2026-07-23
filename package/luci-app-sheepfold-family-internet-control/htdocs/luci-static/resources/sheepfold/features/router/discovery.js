'use strict';
'require baseclass';

/* §frontmod §coordclean1
 * Pure construction of local discovery and pairing payloads. No UCI, DOM,
 * network access or secret persistence belongs here.
 */
function routerAddress(locationValue) {
	var location = locationValue || {};
	var hostname = String(location.hostname || '').trim();
	var host = String(location.host || '').trim();

	if (hostname)
		return hostname;
	if (host.charAt(0) === '[') {
		var closing = host.indexOf(']');
		if (closing > 0)
			return host.slice(1, closing);
	}
	return host.split(':')[0] || '192.168.1.1';
}

function discoveryJson(port, version) {
	return JSON.stringify({
		service: 'sheepfold',
		name: 'Sheepfold Family Internet Control',
		routerName: 'OpenWRT Sheepfold',
		appPort: String(port),
		apiPath: '/cgi-bin/sheepfold-api',
		apiBase: '/cgi-bin/sheepfold-api',
		version: String(version || '0.1.0')
	}, null, 2) + '\n';
}

function pairingPayload(routerAddressValue, port, login, code, tlsSpkiSha256) {
	return 'SF2|h=' + routerAddressValue + '|p=' + port + '|u=' + login + '|c=' + code +
		'|spki=' + tlsSpkiSha256;
}

function urlHost(address) {
	address = String(address || '').trim();
	if (address.indexOf(':') !== -1 && address.charAt(0) !== '[')
		return '[' + address + ']';
	return address;
}

function quickAllowlistUrl(protocol, address, token) {
	return String(protocol || 'https:') + '//' + urlHost(address) + '/q/' + encodeURIComponent(token);
}

return baseclass.extend({
	routerAddress: routerAddress,
	discoveryJson: discoveryJson,
	pairingPayload: pairingPayload,
	urlHost: urlHost,
	quickAllowlistUrl: quickAllowlistUrl
});
