'use strict';
'require baseclass';

var namedPaths = {
	gear: ['M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 3a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.6 1.5l.4 3h4l.4-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'],
	trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 14h10l1-14', 'M9 7V4h6v3'],
	link: ['M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1', 'M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1'],
	eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'],
	refresh: ['M20 6v5h-5', 'M19 11a8 8 0 1 0 1 5']
};

function svg(paths, attrs) {
	var svgNs = 'http://www.w3.org/2000/svg';
	var node = document.createElementNS(svgNs, 'svg');

	attrs = attrs || {};
	node.setAttribute('viewBox', attrs.viewBox || '0 0 24 24');
	node.setAttribute('aria-hidden', 'true');
	node.setAttribute('focusable', 'false');

	paths.forEach(function (pathData) {
		var path = document.createElementNS(svgNs, 'path');
		path.setAttribute('d', pathData);
		node.appendChild(path);
	});

	return node;
}

function wrapped(className, title, paths) {
	return E('span', { 'class': className, 'title': title }, [svg(paths)]);
}

function adminDevice(title) {
	return wrapped('sf-admin-device-icon', title, [
		'M4 5h11a2 2 0 0 1 2 2v8H2V7a2 2 0 0 1 2-2z',
		'M1 17h17v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z',
		'M19 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'
	]);
}

function adminCrown(title) {
	return wrapped('sf-admin-crown-icon', title, ['M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z', 'M6 19h12']);
}

function staticLease(title) {
	return wrapped('sf-static-lease-icon', title, ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v10H6z', 'M12 15v2']);
}

function deviceIdentity(protectedIdentity, title) {
	var paths = [
		'M9.5 11a4 4 0 1 1 5 0',
		'M4 21a8 8 0 0 1 12.2-6.8',
		'M18 12.5v1.1l1 .6-1 1.8-1.1-.4-.9.5-.2 1.2h-2l-.2-1.2-.9-.5-1.1.4-1-1.8 1-.6v-1.1l-1-.6 1-1.8 1.1.4.9-.5.2-1.2h2l.2 1.2.9.5 1.1-.4 1 1.8z',
		'M15 11.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z'
	];

	if (!protectedIdentity)
		paths.push('M3 3l18 18');

	return wrapped(
		'sf-device-identity-icon ' + (protectedIdentity ? 'is-trusted' : 'is-mac-only'),
		title,
		paths
	);
}

function named(name) {
	return svg(namedPaths[name] || namedPaths.gear);
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
	adminDevice: adminDevice,
	adminCrown: adminCrown,
	staticLease: staticLease,
	deviceIdentity: deviceIdentity,
	named: named,
	button: button
});
