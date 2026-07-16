'use strict';
'require baseclass';

function nextId(administrators, idNumber) {
	var next = administrators.reduce(function (maximum, administrator) {
		return Math.max(maximum, idNumber(administrator.id));
	}, 0) + 1;

	return String(next);
}

function loginExists(administrators, login) {
	var normalized = String(login || '').trim().toLowerCase();

	return administrators.some(function (administrator) {
		return String(administrator.login || '').trim().toLowerCase() === normalized;
	});
}

function fromSections(sections, devices, idNumber) {
	return sections.map(function (section, index) {
		var parsedId = idNumber(section.id);
		var id = parsedId === Number.MAX_SAFE_INTEGER ? index + 1 : parsedId;
		var login = String(section.login || '').trim();

		return {
			id: String(id),
			name: String(section.display_name || login || _('Parent')),
			login: login,
			allowChildAccessRequests: section.allow_child_access_requests === '1',
			deviceIds: devices.filter(function (device) {
				return device.adminDevice && device.adminLogin === login;
			}).map(function (device) {
				return device.id;
			})
		};
	}).sort(function (left, right) {
		return idNumber(left.id) - idNumber(right.id);
	});
}

return baseclass.extend({
	nextId: nextId,
	loginExists: loginExists,
	fromSections: fromSections
});
