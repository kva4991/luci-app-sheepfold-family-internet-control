'use strict';
'require baseclass';

/* §frontmod §persist1 §wifitgl1 §ovaudit3
 * Wireless staging is executed inside the serialized UCI mutation. A successful
 * commit followed by reload failure is reported as persisted partial success.
 */
function commandSucceeded(result) { return Number(result && result.code || 0) === 0; }

function commandError(result, fallback) {
	var output = String(result && (result.stderr || result.stdout) || '').trim();
	var error = new Error(output || fallback || 'wifi_reload_failed');
	error.errorCode = 'wifi_reload_failed';
	error.result = result;
	return error;
}

function create(deps) {
	function setOption(section, option, value) { deps.uci.set('wireless', section, option, value); }
	function unsetOption(section, option) { deps.uci.unset('wireless', section, option); }

	function runWifi(args) {
		return Promise.resolve().then(function () { return deps.exec('/sbin/wifi', args || []); }).then(function (result) {
			if (!commandSucceeded(result))
				throw commandError(result);
			return result;
		});
	}

	function reload() {
		return runWifi(['reload']).catch(function () { return runWifi([]); });
	}

	function persist(stage) {
		return deps.persistence.mutate(['wireless'], stage).then(function (mutation) {
			var state = { persisted: true, runtimeApplied: false, stageResult: mutation.stageResult };
			return reload().then(function () {
				state.runtimeApplied = true;
				return state;
			}, function (error) {
				error.persisted = true;
				error.runtimeApplied = false;
				error.persistenceResult = mutation.stageResult;
				throw error;
			});
		});
	}

	return {
		setOption: setOption,
		unsetOption: unsetOption,
		reload: reload,
		persist: persist,
		discard: function () { return deps.persistence.discard(['wireless']); }
	};
}

return baseclass.extend({ commandSucceeded: commandSucceeded, create: create });
