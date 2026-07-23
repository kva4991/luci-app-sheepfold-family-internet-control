'use strict';
'require baseclass';
'require fs';

var ACTION_HELPER = '/usr/libexec/sheepfold/sheepfold-luci-action';
var ACTION_KEYS = {
	actionStatus: 'status',
	actionCommand: 'command',
	actionErrorCode: 'errorCode',
	actionExitCode: 'exitCode',
	actionMessage: 'message'
};

function run(args) {
	// The helper preserves command stdout byte-for-byte and writes only bounded
	// action metadata to stderr. Existing status parsers therefore keep working.
	return fs.exec(ACTION_HELPER, args || []);
}

function actionMetadata(result) {
	var metadata = {};

	String(result && result.stderr || '').split(/\r?\n/).forEach(function (line) {
		var separator = line.indexOf('=');
		var sourceKey;
		var targetKey;

		if (separator <= 0)
			return;
		sourceKey = line.slice(0, separator);
		targetKey = ACTION_KEYS[sourceKey];
		if (targetKey && metadata[targetKey] == null)
			metadata[targetKey] = line.slice(separator + 1);
	});
	if (metadata.exitCode != null)
		metadata.exitCode = Number(metadata.exitCode || 0);
	return metadata;
}

function stripActionMetadata(text) {
	return String(text || '').split(/\r?\n/).filter(function (line) {
		var separator = line.indexOf('=');
		return separator <= 0 || !Object.prototype.hasOwnProperty.call(ACTION_KEYS, line.slice(0, separator));
	}).join('\n').trim();
}

function actionErrorMessage(code) {
	var messages = {
		action_busy: _('Another request for this action is already running.'),
		action_timeout: _('Router command timed out.'),
		runtime_unavailable: _('Router action runtime is unavailable.'),
		invalid_mac: _('Enter a valid MAC address.'),
		administrator_device: _('Administrator devices cannot be blocked or restricted.'),
		device_allowlisted: _('Remove the device from the allowlist first.'),
		device_blocklisted: _('Remove the device from the blocklist first.'),
		already_unrestricted: _('This device already has unrestricted access.'),
		confirmation_required: _('Confirmation is required for this action.'),
		not_found: _('The requested item was not found.'),
		invalid_request: _('The router rejected invalid action data.')
	};

	return messages[String(code || '')] || '';
}

function resultError(result, fallback) {
	var metadata = actionMetadata(result);
	var stderr = stripActionMetadata(result && result.stderr || '');
	var stdout = String(result && result.stdout || '').trim();
	var message = metadata.message || stderr || stdout || fallback || _('Action failed.');
	var error = new Error(message);

	error.errorCode = metadata.errorCode || 'action_failed';
	error.command = metadata.command || '';
	error.exitCode = metadata.exitCode != null ? metadata.exitCode : Number(result && result.code || 0);
	error.result = result;
	return error;
}

function ensureOk(result, fallback) {
	var code = Number(result && result.code || 0);
	var metadata = actionMetadata(result);

	if (code !== 0 || metadata.status === 'error')
		throw resultError(result, fallback || _('Action failed.'));

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
	var result = error && error.result ? error.result : error;
	var metadata = actionMetadata(result);
	var code = error && error.errorCode || metadata.errorCode || '';
	var friendly = actionErrorMessage(code);
	var raw = stripActionMetadata(result && (result.stderr || result.stdout) || '');
	var message = error && error.message ? String(error.message).trim() : '';

	return friendly || message || metadata.message || raw || fallback || _('Action failed.');
}

function withTimeout(args, timeoutMs, timeoutMessage) {
	var timeout = timeoutMs || 20000;

	return new Promise(function (resolve, reject) {
		var timer = window.setTimeout(function () {
			var error = new Error(timeoutMessage || _('Router command timed out.'));
			error.errorCode = 'action_timeout';
			reject(error);
		}, timeout);

		run(args).then(function (result) {
			window.clearTimeout(timer);
			resolve(result);
		}, function (error) {
			window.clearTimeout(timer);
			reject(error);
		});
	});
}

return baseclass.extend({
	run: run,
	ensureOk: ensureOk,
	parseKeyValues: parseKeyValues,
	actionMetadata: actionMetadata,
	stripActionMetadata: stripActionMetadata,
	actionErrorMessage: actionErrorMessage,
	errorText: errorText,
	withTimeout: withTimeout
});
