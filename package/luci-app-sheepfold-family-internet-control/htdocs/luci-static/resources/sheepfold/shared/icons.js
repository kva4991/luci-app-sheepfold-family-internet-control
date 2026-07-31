'use strict';
'require baseclass';
'require sheepfold.shared.icon-registry as iconRegistry';

/* Геометрия хранится только в icons/catalog.json и попадает сюда через
 * icon-registry.js. Так одинаковое действие не получает разные рисунки. §iconcat1 */
function svg(name, attrs) {
	var svgNs = 'http://www.w3.org/2000/svg';
	var definition = iconRegistry.get(name);
	var node = document.createElementNS(svgNs, 'svg');

	attrs = attrs || {};
	node.setAttribute('viewBox', attrs.viewBox || definition.viewBox);
	node.setAttribute('aria-hidden', 'true');
	node.setAttribute('focusable', 'false');

	definition.paths.forEach(function (pathData) {
		var path = document.createElementNS(svgNs, 'path');
		path.setAttribute('d', pathData);
		node.appendChild(path);
	});
	(definition.thinPaths || []).forEach(function (pathData) {
		var path = document.createElementNS(svgNs, 'path');
		path.setAttribute('d', pathData);
		path.setAttribute('stroke-width', '1.25');
		node.appendChild(path);
	});

	return node;
}

function wrapped(className, title, name) {
	return E('span', { 'class': className, 'title': title }, [svg(name)]);
}

function adminCrown(title) {
	return wrapped('sf-admin-crown-icon', title, 'administratorCrown');
}

function staticLease(title) {
	return wrapped('sf-static-lease-icon', title, 'staticIpLease');
}

function deviceIdentityState(device) {
	// Красный цвет оставляем только для действующего карантина: отсутствие
	// устойчивого паспорта является обычным ограничением, а не тревогой.
	if (device && device.identityQuarantineMode)
		return 'suspicious';
	if (device && device.identityProtected)
		return 'trusted';
	return 'mac-only';
}

function deviceIdentityTitle(device, state) {
	if (state === 'suspicious') {
		return device && device.identityQuarantineMode === 'block' ?
			_('Identity quarantine: blocked') :
			_('Identity quarantine: restricted');
	}
	if (state === 'trusted')
		return _('Stable device identity is available');
	return _('This device is protected mainly by its MAC address; MAC spoofing cannot be reliably detected yet');
}

function deviceIdentity(identityState, title) {
	var normalizedState = identityState === true || identityState === 'trusted' ?
		'trusted' : (identityState === 'suspicious' ? 'suspicious' : 'mac-only');
	var names = {
		trusted: 'deviceIdentityTrusted',
		'mac-only': 'deviceIdentityMacOnly',
		suspicious: 'deviceIdentityMismatch'
	};

	return wrapped(
		'sf-device-identity-icon is-' + normalizedState,
		title,
		names[normalizedState]
	);
}

function deviceIdentityForDevice(device) {
	var state = deviceIdentityState(device);

	return deviceIdentity(state, deviceIdentityTitle(device, state));
}

function named(name) {
	return svg(name);
}

function button(title, icon, tone, handler) {
	return E('button', {
		'class': 'sf-icon-action sf-icon-action-' + tone,
		'title': title,
		'aria-label': title,
		'click': function (event) {
			event.preventDefault();
			handler(event);
		}
	}, named(icon));
}

return baseclass.extend({
	svg: svg,
	adminCrown: adminCrown,
	staticLease: staticLease,
	deviceIdentity: deviceIdentity,
	deviceIdentityForDevice: deviceIdentityForDevice,
	named: named,
	button: button
});
