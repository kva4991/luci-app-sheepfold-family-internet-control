'use strict';
'require baseclass';
'require fs';

function run(args) {
	// Маркер источника идёт отдельным служебным аргументом: backend не должен
	// угадывать LuCI по названию команды, общей с Android или ботом. §logaudit
	return fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', ['--luci'].concat(args || []));
}

function ensureOk(result, fallback) {
	var code = Number(result && result.code || 0);
	var output = String(result && (result.stdout || result.stderr) || '').trim();

	if (code !== 0)
		throw new Error(output || fallback || 'Action failed.');

	return result;
}

function parseKeyValues(text) {
	var values = {};

	String(text || '').split(/\r?\n/).forEach(function (line) {
		var separator = line.indexOf('=');

		if (separator > 0)
			values[line.slice(0, separator)] = line.slice(separator + 1);
	});

	return values;
}

function errorText(error, fallback) {
	var text = fallback || 'Action failed.';

	if (error)
		text = String(error.stderr || error.stdout || error.message || text).trim() || text;

	return text;
}

function withTimeout(args, timeoutMs, timeoutMessage) {
	var timeout = timeoutMs || 20000;

	return Promise.race([
		run(args),
		new Promise(function (_resolve, reject) {
			window.setTimeout(function () {
				reject(new Error(timeoutMessage || 'Router command timed out.'));
			}, timeout);
		})
	]);
}

return baseclass.extend({
	run: run,
	ensureOk: ensureOk,
	parseKeyValues: parseKeyValues,
	errorText: errorText,
	withTimeout: withTimeout
});
