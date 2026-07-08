'use strict';
'require view.sheepfold.overview-secure as overview';
'require uci';

var renderGroups = overview.renderGroups;

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

return overview;
