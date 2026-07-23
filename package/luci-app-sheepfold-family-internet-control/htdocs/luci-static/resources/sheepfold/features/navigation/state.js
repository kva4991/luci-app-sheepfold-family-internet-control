'use strict';
'require baseclass';

var TOP_TABS = [
	['users', 'User lists'],
	['management', 'User management'],
	['wifi', 'Wi-Fi'],
	['logs', 'Logs'],
	['settings', 'Settings'],
	['donation', 'Donation']
];

var SETTINGS_PRIMARY_TABS = [
	['info', 'Information'],
	['general', 'General'],
	['integrations', 'Integrations'],
	['messenger', 'Messenger'],
	['notifications', 'Notifications'],
	['emergency', 'Emergency-useful sites'],
	['misc', 'Misc'],
	['feedback', 'Feedback / suggestions']
];

var SETTINGS_SECONDARY_TABS = [
	/* SHEEPFOLD_AI_BEGIN */
	['ai', 'AI assistant'],
	/* SHEEPFOLD_AI_END */
	['storage', 'Router memory management']
];

var USER_LIST_TABS = [
	['devices', 'All devices'],
	['allowlist', 'Allowlist'],
	['blocklist', 'Blocklist']
];

var MANAGEMENT_TABS = [
	['schedules', 'Schedules'],
	['groups', 'Groups'],
	['admins', 'Administrators']
];

function cloneTabs(tabs) {
	return tabs.map(function (item) { return [item[0], item[1]]; });
}

function contains(tabs, key) {
	return tabs.some(function (item) { return item[0] === key; });
}

function normalize(tabs, value, fallback) {
	return contains(tabs, value) ? value : fallback;
}

function settingsTabs() {
	return SETTINGS_PRIMARY_TABS.concat(SETTINGS_SECONDARY_TABS);
}

function isKnownSettingsTab(tab) {
	return contains(settingsTabs(), tab);
}

function create(initial) {
	var state = {
		activeTab: normalize(TOP_TABS, initial && initial.activeTab, 'users'),
		activeUserListTab: normalize(USER_LIST_TABS, initial && initial.activeUserListTab, 'devices'),
		activeManagementTab: normalize(MANAGEMENT_TABS, initial && initial.activeManagementTab, 'schedules'),
		activeSettingsTab: normalize(settingsTabs(), initial && initial.activeSettingsTab, 'general')
	};

	return {
		snapshot: function () {
			return {
				activeTab: state.activeTab,
				activeUserListTab: state.activeUserListTab,
				activeManagementTab: state.activeManagementTab,
				activeSettingsTab: state.activeSettingsTab
			};
		},
		selectTop: function (tab) {
			state.activeTab = normalize(TOP_TABS, tab, state.activeTab);
			return this;
		},
		selectUserList: function (tab) {
			state.activeUserListTab = normalize(USER_LIST_TABS, tab, state.activeUserListTab);
			return this;
		},
		selectManagement: function (tab) {
			state.activeManagementTab = normalize(MANAGEMENT_TABS, tab, state.activeManagementTab);
			return this;
		},
		selectSettings: function (tab) {
			state.activeSettingsTab = normalize(settingsTabs(), tab, state.activeSettingsTab);
			return this;
		},
		applyDeepLink: function (params) {
			if (params && params.get('view') === 'admins') {
				state.activeTab = 'management';
				state.activeManagementTab = 'admins';
			}
			return this;
		},
		restoreChildTab: function (parentTab) {
			if (parentTab === 'settings')
				return state.activeSettingsTab;
			if (parentTab === 'users')
				return state.activeUserListTab;
			if (parentTab === 'management')
				return state.activeManagementTab;
			return null;
		}
	};
}

return baseclass.extend({
	topTabs: function () { return cloneTabs(TOP_TABS); },
	settingsPrimaryTabs: function () { return cloneTabs(SETTINGS_PRIMARY_TABS); },
	settingsSecondaryTabs: function () { return cloneTabs(SETTINGS_SECONDARY_TABS); },
	userListTabs: function () { return cloneTabs(USER_LIST_TABS); },
	managementTabs: function () { return cloneTabs(MANAGEMENT_TABS); },
	isKnownSettingsTab: isKnownSettingsTab,
	create: create
});
