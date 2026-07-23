'use strict';
'require baseclass';

/* §frontmod §ovfinal1
 * Небольшое изменяемое хранилище состояния для контроллеров overview. Оно знает
 * только состояние страницы, но ничего не знает об UCI, DOM, командах роутера
 * и семантике сохранения.
 */
function create(initial) {
	var state = Object.assign({
		devices: [],
		administrators: [{
			id: '1',
			name: 'Родитель',
			login: 'SuperParent',
			role: 'owner',
			deviceIds: []
		}],
		activeView: null,
		rootPasswordSet: false,
		rootPasswordCheckFailed: false,
		globalInternetBlocked: null
	}, initial || {});

	function list(name) {
		return state[name] || [];
	}

	function replace(name, values) {
		state[name] = Array.isArray(values) ? values : [];
		return state[name];
	}

	return {
		devices: function () { return list('devices'); },
		replaceDevices: function (values) { return replace('devices', values); },
		administrators: function () { return list('administrators'); },
		replaceAdministrators: function (values) { return replace('administrators', values); },
		activeView: function () { return state.activeView; },
		setActiveView: function (value) { state.activeView = value || null; },
		rootPassword: function () {
			return {
				set: !!state.rootPasswordSet,
				failed: !!state.rootPasswordCheckFailed
			};
		},
		setRootPassword: function (isSet, failed) {
			state.rootPasswordSet = !!isSet;
			state.rootPasswordCheckFailed = !!failed;
		},
		globalInternetBlocked: function () { return state.globalInternetBlocked; },
		setGlobalInternetBlocked: function (value) {
			state.globalInternetBlocked = value == null ? null : !!value;
		},
		snapshot: function () {
			return {
				devices: list('devices').slice(),
				administrators: list('administrators').slice(),
				activeView: state.activeView,
				rootPasswordSet: !!state.rootPasswordSet,
				rootPasswordCheckFailed: !!state.rootPasswordCheckFailed,
				globalInternetBlocked: state.globalInternetBlocked
			};
		}
	};
}

return baseclass.extend({ create: create });
