'use strict';
'require baseclass';

function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function validRamCachePath(path) {
	return /^\/tmp\/[A-Za-z0-9_./-]+$/.test(path || '') &&
		path.indexOf('..') === -1 && path.charAt(path.length - 1) !== '/';
}

function normalizeAccessOrder(value, accessKeys) {
	var known = {};
	var order = [];

	(accessKeys || []).forEach(function (key) { known[key] = true; });
	String(value || '').split(/\s+/).filter(Boolean).forEach(function (key) {
		if (known[key] && order.indexOf(key) === -1)
			order.push(key);
	});
	(accessKeys || []).forEach(function (key) {
		if (order.indexOf(key) === -1)
			order.push(key);
	});
	return order;
}

function partitionOptions(options) {
	var result = {
		global: {},
		usb: {},
		cloud: {},
		gdrive: {},
		adguard: {}
	};

	Object.keys(options || {}).forEach(function (key) {
		var sectionParts = key.match(/^(usb|cloud|gdrive|adguard)\.(.+)$/);

		if (sectionParts)
			result[sectionParts[1]][sectionParts[2]] = options[key];
		else
			result.global[key] = options[key];
	});

	return result;
}

function integerInRange(value, minimum, maximum) {
	var parsed = parseInt(value, 10);

	return Boolean(value) && String(parsed) === String(value) &&
		parsed >= minimum && parsed <= maximum;
}

function numericRange(value, minimum, maximum) {
	var parsed = parseInt(value, 10);

	return parsed >= minimum && parsed <= maximum;
}

function validateDraft(options, deps) {
	var adguardUrl;
	var adguardUrlParts;
	var adguardUsername;
	var adguardPassword;
	var accessKeys = deps.accessKeys || [];
	/* SHEEPFOLD_AI_BEGIN */
	var numericValue;
	/* SHEEPFOLD_AI_END */

	if (hasOwn(options, 'log_cache_path') && !validRamCachePath(options.log_cache_path))
		throw new Error(_('Cache file path must start with /tmp/ and contain only letters, numbers, dot, slash, underscore, and hyphen.'));

	if (hasOwn(options, 'app_port') && !integerInRange(options.app_port, 1, 65535))
		throw new Error(_('Enter a port from 1 to 65535.'));

	if (hasOwn(options, 'usb.device') && options['usb.device'] && !/^\/dev\/[A-Za-z0-9._-]+$/.test(options['usb.device']))
		throw new Error(_('USB partition device path') + ': /dev/...');

	/* SHEEPFOLD_AI_BEGIN */
	if (hasOwn(options, 'ai_rate_limit_requests')) {
		numericValue = options.ai_rate_limit_requests;
		if (!integerInRange(numericValue, 1, 1000))
			throw new Error(_('Requests per device') + ': 1–1000');
	}

	if (hasOwn(options, 'ai_rate_limit_window_seconds')) {
		numericValue = options.ai_rate_limit_window_seconds;
		if (!integerInRange(numericValue, 60, 86400))
			throw new Error(_('Rate limit window, seconds') + ': 60–86400');
	}
	/* SHEEPFOLD_AI_END */

	if (hasOwn(options, 'access_priority') &&
		normalizeAccessOrder(options.access_priority, accessKeys).join(' ') !== String(options.access_priority).trim())
		throw new Error(_('Access priority contains an unknown or duplicate rule.'));

	if (hasOwn(options, 'adguard.url')) {
		adguardUrl = String(options['adguard.url'] || '').trim();
		adguardUrlParts = adguardUrl.match(/^(https?):\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::([0-9]{1,5}))?\/?$/i);
		if (!adguardUrlParts)
			throw new Error(_('AdGuard Home address must contain only the protocol, host, and optional port.'));
		if (adguardUrlParts[3] && !numericRange(adguardUrlParts[3], 1, 65535))
			throw new Error(_('AdGuard Home address must contain only the protocol, host, and optional port.'));
		if (adguardUrlParts[1].toLowerCase() === 'http' &&
			!/^(?:127\.0\.0\.1|localhost|\[::1\])$/i.test(adguardUrlParts[2]))
			throw new Error(_('Use HTTPS for AdGuard Home on another device. Unencrypted HTTP is allowed only on this router.'));
	}

	if (hasOwn(options, 'adguard.username') || hasOwn(options, 'adguard.password')) {
		adguardUsername = String(deps.sectionValue('adguard', 'username', '') || '').trim();
		adguardPassword = String(deps.sectionValue('adguard', 'password', '') || '');
		if (Boolean(adguardUsername) !== Boolean(adguardPassword))
			throw new Error(_('Enter both the AdGuard Home username and password, or leave both fields empty.'));
	}
}

function create(deps) {
	function ensureSection(section, type) {
		try {
			deps.uci.get('sheepfold', section);
		} catch (error) {
			deps.uci.set('sheepfold', section, type);
		}
	}

	function stageSection(section, type, options) {
		var keys = Object.keys(options);

		if (!keys.length)
			return;
		ensureSection(section, type);
		keys.forEach(function (option) {
			deps.uci.set('sheepfold', section, option, options[option]);
		});
	}

	function save(options) {
		var partitioned = partitionOptions(options);
		var globalOptions = partitioned.global;

		if (hasOwn(globalOptions, 'language'))
			globalOptions.language = deps.normalizeLanguage(globalOptions.language);

		Object.keys(globalOptions).forEach(function (option) {
			deps.uci.set('sheepfold', 'global', option, globalOptions[option]);
		});

		/* SHEEPFOLD_AI_BEGIN */
		if (hasOwn(globalOptions, 'deepseek_api_key') && String(globalOptions.deepseek_api_key || '').trim())
			deps.uci.set('sheepfold', 'global', 'ai_enabled', '1');
		if (hasOwn(globalOptions, 'gemini_api_key') && String(globalOptions.gemini_api_key || '').trim())
			deps.uci.set('sheepfold', 'global', 'ai_enabled', '1');
		if (hasOwn(globalOptions, 'child_ai_parental_consent'))
			deps.uci.set('sheepfold', 'global', 'child_ai_consent_version', 'child-ai-v1');
		/* SHEEPFOLD_AI_END */

		stageSection('usb', 'usb', partitioned.usb);

		if (hasOwn(partitioned.cloud, 'login') || hasOwn(partitioned.cloud, 'password')) {
			ensureSection('cloud', 'yandex_disk');
			deps.uci.set('sheepfold', 'cloud', 'authorized', '0');
		}
		stageSection('cloud', 'yandex_disk', partitioned.cloud);

		if (hasOwn(partitioned.gdrive, 'client_id') || hasOwn(partitioned.gdrive, 'client_secret') ||
			hasOwn(partitioned.gdrive, 'refresh_token')) {
			ensureSection('gdrive', 'google_drive');
			deps.uci.set('sheepfold', 'gdrive', 'authorized', '0');
		}
		stageSection('gdrive', 'google_drive', partitioned.gdrive);
		stageSection('adguard', 'integration', partitioned.adguard);

		return deps.save(['sheepfold']);
	}

	return {
		validate: function (options) {
			return validateDraft(options, {
				accessKeys: deps.accessKeys,
				sectionValue: deps.sectionValue
			});
		},
		save: save
	};
}

return baseclass.extend({
	create: create,
	validRamCachePath: validRamCachePath,
	normalizeAccessOrder: normalizeAccessOrder,
	partitionOptions: partitionOptions,
	validateDraft: validateDraft
});
