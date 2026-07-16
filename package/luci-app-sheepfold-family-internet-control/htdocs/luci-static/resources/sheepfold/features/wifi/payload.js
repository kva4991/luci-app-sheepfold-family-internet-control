'use strict';
'require baseclass';

function escape(value) {
	return String(value == null ? '' : value).replace(/([\\;,:"])/g, '\\$1');
}

function security(encryption) {
	var value = String(encryption || '').toLowerCase();

	if (!value || value === 'none' || value === 'open' || value === 'disabled')
		return 'nopass';

	if (value.indexOf('wep') !== -1)
		return 'WEP';

	return 'WPA';
}

function build(ssid, password, encryption) {
	var type = security(encryption);
	var payload = 'WIFI:T:' + type + ';S:' + escape(ssid) + ';';

	if (type !== 'nopass')
		payload += 'P:' + escape(password) + ';';

	return payload + ';';
}

return baseclass.extend({
	escape: escape,
	security: security,
	build: build
});
