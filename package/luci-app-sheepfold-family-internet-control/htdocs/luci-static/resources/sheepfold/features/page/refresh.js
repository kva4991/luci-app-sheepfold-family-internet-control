'use strict';
'require baseclass';

/* §frontmod §ovfinal1
 * Refreshes only already-mounted overview subpanels. It deliberately does not own
 * navigation state or persistence; the active view supplies the render functions.
 */
function create(deps) {
	function current() {
		return {
			page: deps.page && deps.page(),
			view: deps.view && deps.view()
		};
	}

	function userLists() {
		var state = current();
		var devices = deps.devices ? deps.devices() : [];
		var definitions;

		if (!state.page || !state.view)
			return false;
		definitions = {
			devices: state.view.renderDevices(true),
			allowlist: state.view.renderAllowlist(true),
			blocklist: state.view.renderBlocklist(true)
		};
		Object.keys(definitions).forEach(function (tab) {
			var mounted = state.page.querySelector('[data-user-list-panel="' + tab + '"]');
			if (mounted)
				mounted.replaceWith(state.view.renderUserListPanel(tab, definitions[tab]));
		});
		[
			['devices', devices.length],
			['allowlist', devices.filter(function (device) { return device.status === 'allow'; }).length],
			['blocklist', devices.filter(function (device) { return device.status === 'blocked'; }).length],
			['restricted', devices.filter(function (device) {
				return device.status === 'restricted' || device.status === 'scheduled';
			}).length]
		].forEach(function (item) {
			var node = state.page.querySelector('[data-metric="' + item[0] + '"] strong');
			if (node)
				node.textContent = String(item[1]);
		});
		return true;
	}

	function management(tab, renderer) {
		var state = current();
		var mounted;

		if (!state.page || !state.view || typeof renderer !== 'function')
			return false;
		mounted = state.page.querySelector('[data-management-panel="' + tab + '"]');
		if (!mounted)
			return false;
		mounted.replaceWith(state.view.renderManagementPanel(tab, renderer(state.view)));
		return true;
	}

	return {
		userLists: userLists,
		schedules: function () {
			return management('schedules', function (view) { return view.renderSchedules(true); });
		},
		groups: function () {
			return management('groups', function (view) { return view.renderGroups(true); });
		}
	};
}

return baseclass.extend({ create: create });
