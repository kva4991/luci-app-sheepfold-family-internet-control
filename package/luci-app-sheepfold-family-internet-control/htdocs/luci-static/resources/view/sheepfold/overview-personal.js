'use strict';
'require view';
'require view.sheepfold.overview-secure as secureOverview';
'require view.sheepfold.overview as overview';
'require uci';
'require ui';
'require sheepfold.features.devices.inventory as deviceInventory';
'require sheepfold.core.backend.router as routerBackend';
'require sheepfold.core.backend.actions as commandActionsModel';
'require sheepfold.features.devices.presence as devicePresenceModel';
'require sheepfold.features.devices.detection-details as detectionDetailsModel';

/*
 * secureOverview нужен как зависимость: он патчит базовый overview до того,
 * как personal-wrapper добавит водяные знаки и presence-декор.
 */
var renderGroups = overview.renderGroups;
var renderUsers = overview.renderUsers;
var commandActions = commandActionsModel.create({
	run: routerBackend.run,
	withTimeout: routerBackend.withTimeout,
	ensureOk: routerBackend.ensureOk,
	errorText: routerBackend.errorText,
	actionMetadata: routerBackend.actionMetadata,
	parseKeyValues: routerBackend.parseKeyValues,
	notify: function(message, level) {
		ui.addNotification(null, E('p', {}, message), level || 'info');
	}
});
var devicePresence = devicePresenceModel.create({
	actions: commandActions,
	normalizeMac: deviceInventory.normalizeMac
});
var detectionDetails = detectionDetailsModel.create({
	uci: uci,
	actions: commandActions,
	inventory: deviceInventory,
	presence: devicePresence
});

function normalizedGroupName(value) {
	return String(value || '').trim().toLowerCase();
}

function ensurePersonalGroupStylesheet() {
	var stylesheetId = 'sheepfold-personal-groups-css';
	var assetVersion;
	var link;

	if (document.getElementById(stylesheetId))
		return;

	assetVersion = uci.get('sheepfold', 'global', 'ui_asset_version') || '0';
	link = E('link', {
		'id': stylesheetId,
		'rel': 'stylesheet',
		'href': L.resource('sheepfold/sheepfold-personal-groups.css') + '?v=' + encodeURIComponent(assetVersion)
	});
	document.head.appendChild(link);
}

function personalGroupNames() {
	var names = {
		'ребёнок номер 1': true,
		'ребенок номер 1': true,
		'первый ребёнок': true,
		'первый ребенок': true,
		'child number 1': true
	};

	uci.sections('sheepfold', 'group', function(section) {
		if (section.personal === '1')
			names[normalizedGroupName(section.name || section['.name'])] = true;
	});

	return names;
}

function personalGroupWatermark() {
	return E('span', {
		'class': 'sf-group-person-watermark',
		'aria-hidden': 'true'
	}, [
		E('span', { 'class': 'sf-group-person-watermark-head' }),
		E('span', { 'class': 'sf-group-person-watermark-body' })
	]);
}

overview.renderGroups = function() {
	var node = renderGroups.apply(this, arguments);
	var personalNames = personalGroupNames();

	ensurePersonalGroupStylesheet();
	node.querySelectorAll('.sf-group-box').forEach(function(card) {
		var title = card.querySelector('.sf-group-title');
		var groupName = normalizedGroupName(title && title.textContent);

		if (!personalNames[groupName])
			return;

		card.classList.add('sf-group-box-personal');
		card.appendChild(personalGroupWatermark());
	});

	return node;
};

overview.renderUsers = function() {
	var node = renderUsers.apply(this, arguments);

	ensurePersonalGroupStylesheet();
	detectionDetails.decorateRows(node);
	devicePresence.load(false).then(function() {
		detectionDetails.decorateRows(node);
		devicePresence.sortRows(node);
	});
	return node;
};

return view.extend({
	load: function() {
		return overview.load ? overview.load.apply(overview, arguments) : null;
	},

	render: function() {
		return overview.render.apply(overview, arguments);
	}
});
