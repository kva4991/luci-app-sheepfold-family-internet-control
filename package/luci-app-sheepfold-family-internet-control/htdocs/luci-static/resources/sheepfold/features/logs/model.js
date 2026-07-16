'use strict';
'require baseclass';

function maskMessage(message) {
	return String(message || '')
		.replace(/\b([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2})\b/gi, function (match, first, second, third, fourth, fifth, sixth) {
			return [first, second, third, 'xx', 'xx', sixth].join(':').toUpperCase();
		})
		.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x');
}

function parse(text) {
	return String(text || '').split(/\r?\n/).map(function (line) {
		var parts;

		line = line.trim();
		if (!line)
			return null;

		parts = line.split('\t');
		if (parts.length >= 2)
			return { time: parts.shift(), message: parts.join('\t') };

		return { time: '', message: line };
	}).filter(Boolean);
}

function parseTime(value) {
	var match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);

	if (!match)
		return null;

	return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]));
}

function byPeriod(entries, period, fromValue, toValue) {
	var now = new Date();
	var from = null;
	var to = null;

	if (period === 'hour')
		from = new Date(now.getTime() - 60 * 60 * 1000);
	else if (period === 'week')
		from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	else if (period === 'custom') {
		from = fromValue ? new Date(fromValue) : null;
		to = toValue ? new Date(toValue) : null;
	}

	if (period === 'all')
		return entries.slice();

	return entries.filter(function (entry) {
		var time = parseTime(entry.time);

		return !!time && (!from || time >= from) && (!to || time <= to);
	});
}

function phraseOptions() {
	return [
		['', _('All messages')],
		['new_device', _('New device detected')],
		['manual_add', _('Device added manually')],
		['allowlist_add', _('Device added to allowlist')],
		['blocklist_add', _('Device added to blocklist')],
		['auto_group', _('Device auto-assigned to a group')],
		['router_access_blocked', _('Router settings access blocked')],
		['wan_down', _('Router internet lost')],
		['wan_up', _('Router internet restored')],
		['wifi_on', _('Wi-Fi enabled by Sheepfold')],
		['wifi_off', _('Wi-Fi disabled by Sheepfold')],
		['wps', _('WPS pairing window')],
		['global_block', _('Global internet block toggled')]
	];
}

function phrasePattern(key) {
	var patterns = {
		new_device: /Обнаружено новое устройство/i,
		manual_add: /Устройство добавлено вручную/i,
		allowlist_add: /Устройство добавлено в белый список/i,
		blocklist_add: /Устройство добавлено в чёрный список|Устройство заблокировано/i,
		auto_group: /автоматически добавлено в группу/i,
		router_access_blocked: /пыталось открыть настройки роутера/i,
		wan_down: /У роутера пропал интернет/i,
		wan_up: /Интернет на роутере восстановлен/i,
		wifi_on: /Wi-Fi включён Sheepfold/i,
		wifi_off: /Wi-Fi отключён Sheepfold/i,
		wps: /WPS-подключение|Окно WPS-добавления/i,
		global_block: /Глобальная блокировка интернета/i
	};

	return patterns[key] || null;
}

function matchesPhrase(entry, key) {
	var pattern;

	if (!key)
		return true;

	pattern = phrasePattern(key);
	return pattern ? pattern.test(String(entry.message || '')) : true;
}

function normalizeMac(value) {
	var compact = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();

	if (compact.length !== 12)
		return '';

	return compact.match(/.{2}/g).join(':');
}

function matchesNeedle(entry, needle, kind) {
	var message;

	needle = String(needle || '').trim();
	if (!needle)
		return true;

	message = String(entry.message || '');
	if (kind === 'mac') {
		var normalized = normalizeMac(needle).toLowerCase();
		return normalized ? message.toLowerCase().indexOf(normalized) !== -1 : true;
	}

	if (kind === 'ip')
		return message.indexOf(needle) !== -1;

	return message.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
}

function filterView(entries, filters) {
	return entries.filter(function (entry) {
		var time = parseTime(entry.time);
		var from = filters.from ? new Date(filters.from) : null;
		var to = filters.to ? new Date(filters.to) : null;

		if ((from || to) && (!time || (from && time < from) || (to && time > to)))
			return false;

		return matchesNeedle(entry, filters.ip, 'ip') &&
			matchesNeedle(entry, filters.mac, 'mac') &&
			matchesNeedle(entry, filters.deviceName, 'name') &&
			matchesPhrase(entry, filters.phrase);
	});
}

function maskedExport(entries) {
	if (!entries.length)
		return _('Log is empty.') + '\n';

	return entries.map(function (entry) {
		return entry.time + ' ' + maskMessage(_(entry.message));
	}).join('\n') + '\n';
}

return baseclass.extend({
	maskMessage: maskMessage,
	parse: parse,
	parseTime: parseTime,
	byPeriod: byPeriod,
	phraseOptions: phraseOptions,
	matchesPhrase: matchesPhrase,
	matchesNeedle: matchesNeedle,
	filterView: filterView,
	maskedExport: maskedExport
});
