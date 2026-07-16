'use strict';
'require baseclass';

var colors = [
	'#e8f4ef', '#eef2ff', '#fff4dd', '#fceeee', '#edf7fb',
	'#f5f0ff', '#eef8e7', '#f8f1e8', '#eaf3f8'
];

function hash(text) {
	var value = 0;

	String(text || '').split('').forEach(function (character) {
		value = ((value << 5) - value + character.charCodeAt(0)) | 0;
	});

	return Math.abs(value);
}

function validColor(color) {
	return /^#[0-9a-f]{6}$/i.test(String(color || ''));
}

function automaticColor(name) {
	return colors[hash(name) % colors.length];
}

function nextColor(name, used) {
	for (var index = 0; index < colors.length; index++) {
		if (!used[String(colors[index]).toLowerCase()])
			return colors[index];
	}

	return automaticColor(name);
}

function membershipChanges(devices, oldName, newName, selectedIds, normalize) {
	var selected = {};

	(selectedIds || []).forEach(function (id) {
		selected[String(id)] = true;
	});

	return (devices || []).reduce(function (changes, device) {
		var linked = !!selected[String(device.id)];
		var previousGroup = normalize(device.group || '');

		if (previousGroup !== oldName && !linked)
			return changes;

		changes.push({
			device: device,
			linked: linked,
			previousGroup: previousGroup,
			nextGroup: linked ? newName : ''
		});
		return changes;
	}, []);
}

function deletionBlockReason(options) {
	if (options.protectedGroup || options.noRestrictionsGroup)
		return 'protected';
	if (options.deviceCount > 0)
		return 'assigned';
	if (!options.hasSection)
		return 'missing-section';
	return '';
}

return baseclass.extend({
	hash: hash,
	palette: function () { return colors.slice(); },
	validColor: validColor,
	automaticColor: automaticColor,
	nextColor: nextColor,
	membershipChanges: membershipChanges,
	deletionBlockReason: deletionBlockReason
});
