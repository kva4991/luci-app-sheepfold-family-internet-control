'use strict';
'require baseclass';

function svgIcon(paths) {
	var svgNs = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(svgNs, 'svg');

	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');

	paths.forEach(function (pathData) {
		var path = document.createElementNS(svgNs, 'path');

		path.setAttribute('d', pathData);
		svg.appendChild(path);
	});

	return svg;
}

function definitions() {
	return [
		['unknown', _('Unknown device type'), '?', ['M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3', 'M12 17h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z']],
		['phone', _('Phone'), '▯', ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2']],
		['tablet', _('Tablet'), '▭', ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M12 17h.01']],
		['computer', _('Computer'), '⌨', ['M3 4h18v11H3z', 'M8 21h8', 'M12 15v6']],
		['tv', _('TV'), '▣', ['M3 5h18v12H3z', 'M8 21h8', 'M12 17v4']],
		['media_player', _('Media player'), '▶', ['M4 5h16v14H4z', 'M10 9l6 3-6 3z']],
		['smart_watch', _('Smart watch'), '◫', ['M9 2h6l1 4h2v12h-2l-1 4H9l-1-4H6V6h2z', 'M9 7h6v10H9z', 'M12 9v3l2 1']],
		['console', _('Game console'), '✚', ['M7 10h10a5 5 0 0 1 4 8l-1 1a2 2 0 0 1-3-.4L15 16H9l-2 2.6a2 2 0 0 1-3 .4l-1-1a5 5 0 0 1 4-8z', 'M8 14h4', 'M10 12v4', 'M16 13h.01', 'M18 15h.01']],
		['printer', _('Printer'), '▤', ['M7 8V3h10v5', 'M6 17H4v-6h16v6h-2', 'M7 14h10v7H7z']],
		['server', _('Server'), '▦', ['M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 7h8', 'M8 11h8', 'M8 15h4', 'M16 15h.01', 'M16 18h.01', 'M8 18h4']],
		['camera', _('Camera'), '◉', ['M4 7h4l2-3h4l2 3h4v13H4z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']],
		['speaker', _('Smart speaker'), '♪', ['M8 6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z', 'M10 8h4', 'M10 11h4', 'M12 17h.01', 'M18 9c1.2 1.6 1.2 4.4 0 6', 'M20.5 7c2 2.8 2 7.2 0 10']],
		['vacuum', _('Robot vacuum'), '◌', ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 10h6', 'M9 14h6', 'M16 7l3-3']],
		['smart_home', _('Smart home'), '⌁', ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6', 'M8 11h.01', 'M16 11h.01']],
		['engineering', _('Engineering device'), '⚙', ['M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M9 8h6', 'M9 11h3', 'M7 20v2', 'M17 20v2', 'M12 18c-1.6-.8-2.4-1.9-2-3.2.3-1 1.2-1.6 1.7-2.8 1.6 1.1 3.3 2.4 3.3 4 0 1.2-1 2-3 2z']],
		['smart', _('Smart device'), '◇', ['M12 2l8 8-8 12-8-12z', 'M9 10h6', 'M9 14h6']],
		['network', _('Network device'), '⌂', ['M4 12h16', 'M7 8h10', 'M10 4h4', 'M6 16h.01', 'M12 16h.01', 'M18 16h.01', 'M6 20h12']]
	].map(function (item) {
		return { value: item[0], label: item[1], mark: item[2], paths: item[3] };
	});
}

function byValue(value) {
	var types = definitions();

	return types.filter(function (item) {
		return item.value === value;
	})[0] || types[0];
}

function options() {
	return definitions().map(function (item) {
		return [item.value, item.label];
	});
}

function displayedType(device, minConfidence) {
	var confidence = parseInt(device && device.detectionConfidence, 10);
	var threshold = parseInt(minConfidence, 10);

	if (isNaN(threshold))
		threshold = 70;

	if (device && !device.manualDeviceType && !isNaN(confidence) && confidence < threshold)
		return 'unknown';

	return device && device.deviceType ? device.deviceType : 'unknown';
}

function infer(item, configured) {
	var text = [configured && configured.name, configured && configured.group, item.staticName, item.hostname]
		.join(' ').toLowerCase();

	if (/(iphone|android|galaxy|redmi|pixel|phone|телефон|смартфон)/.test(text)) return 'phone';
	if (/(ipad|tablet|pad|планшет)/.test(text)) return 'tablet';
	if (/(desktop|laptop|notebook|macbook|pc-|компьютер|ноутбук)/.test(text)) return 'computer';
	if (/(apple watch|galaxy watch|pixel watch|mi watch|smart[ _-]?watch|smartwatch|wear os|wearos|amazfit|fitbit|garmin watch|huawei watch|honor watch|умные часы|смарт[ -]?часы)/.test(text)) return 'smart_watch';
	if (/(chromecast|mi box|android[ _-]?box|apple tv|fire tv|firetv|nvidia shield|roku|dune hd|kodi|media player|media[ _-]?player|streaming player|video player|видеоплеер|медиаплеер)/.test(text)) return 'media_player';
	if (/(tv|телевизор|androidtv|smarttv|smart[ _-]?tv)/.test(text)) return 'tv';
	if (/(playstation|ps4|ps5|xbox|switch|console|приставк)/.test(text)) return 'console';
	if (/(printer|print|epson|canon|hp-|принтер)/.test(text)) return 'printer';
	if (/(home[ -]?assistant|hassio|hass\.io|haos|home assistant green|home assistant yellow|openhab|adguard[ -]?home|adguardhome|samba|smb|cifs|файловый сервер|file server|nas|proxmox|pve|truenas|freenas|openmediavault|omv|synology|diskstation|qnap|unraid|plex server|jellyfin|emby|docker host|portainer|мини[ -]?сервер|домашний сервер|smlight|slzb|slzb-mr4u|zigbee2mqtt|zha coordinator|zigbee coordinator|zigbee gateway|zigbee bridge|matter bridge|thread border router|homekit bridge|smart home hub|smarthome hub|хаб умного дома|координатор zigbee|zigbee шлюз|шлюз zigbee|шлюз умного дома|philips hue bridge|hue bridge|ikea dirigera|dirigera|tradfri gateway|trådfri gateway|aqara hub|xiaomi gateway|mijia gateway|tuya gateway|sonoff zigbee bridge|hubitat|smartthings hub|aeotec hub|homey|fibaro home center|homematic|deconz|conbee|skyconnect|zwavejs|z-wave js|z-wave gateway|zwave gateway)/.test(text)) return 'server';
	if (/(nvr|dvr|xvr|hybrid recorder|video recorder|videoregistrar|videonablyudenie|videonablydenie|videonabludenie|video-nablyudenie|video-nablydenie|видеорегистратор|регистратор|cctv server|surveillance server|video server|сервер видеонаблюдения|ltv-rne|rne-\d|rvi-r|trassir|xmeye|ivms|hik-connect|smartpss|gdmss|idmss|unv.*nvr|uniview.*nvr|hikvision.*nvr|hiwatch.*nvr|hilook.*nvr|dahua.*nvr|beward.*nvr|optimus.*nvr|tantos.*nvr|polyvision.*nvr|hanwha.*nvr|wisenet.*nvr|axis.*nvr|vivotek.*nvr|tiandy.*nvr)/.test(text)) return 'server';
	if (/(camera|ip[-_ ]?cam|webcam|(^|[^a-z0-9])cam[0-9]+([^a-z0-9]|$)|(^|[^a-z0-9])cam[-_ ][0-9]+([^a-z0-9]|$)|камера)/.test(text)) return 'camera';
	if (/(alice|alisa|yandex|яндекс|алиса|station|станци[яи]|smart speaker|speaker|колонк|sonos|homepod|alexa|amazon echo|google home|sberboom|сбербум|маруся|marusya|капсул)/.test(text)) return 'speaker';
	if (/(vacuum|roborock|dreame|deebot|ecovacs|irobot|roomba|пылесос|miio|xiaomi-vacuum|viomi|ilife|eufy|yeedi)/.test(text)) return 'vacuum';
	if (/(warm floor|underfloor|floor heating|heated floor|терморегулятор|термоголовк|т[её]пл[ыо]й пол|теплый пол|тёплый пол|подогрев пола|heater relay|smart relay|relay|реле|выключател|switch module|wall switch|light switch|освещен|свет|ламп|dimmer|диммер|curtain|curtains|blind|blinds|shade|roller shade|штор|жалюзи|карниз|чайник|kettle|утюг|iron|socket|plug|розетк|tuya|ewelink|sonoff|shelly|aqara|mijia|xiaomi smart|yeelight|philips hue|nanoleaf|wled|led controller|контроллер led|контроллер света|датчик движения|motion sensor|door sensor|window sensor|датчик двери|датчик окна|leak sensor|датчик протечки|smoke sensor|датчик дыма|temperature sensor|датчик температуры|humidity sensor|датчик влажности|espressif|esp8266|esp32|esp32c3|esp32-c3|esp32s3|esp32-s3|tasmota|esphome)/.test(text)) return 'smart_home';
	if (/(zont|зонт|ectostroy|ectocontrol|эктоконтрол|myheat|teplocom|теплоком|xital|кситал|телеметрик|telemetrika|owen|овен|saures|boiler|kotel|кот[её]л|baxi|navien|vaillant|buderus|protherm|ariston|heating|thermostat|термостат|отоплен|контроллер|alarm|сигнализац)/.test(text)) return 'engineering';
	if (/(router|gateway|repeater|extender|openwrt|роутер|шлюз|точка)/.test(text)) return 'network';

	return 'smart';
}

function icon(type) {
	var definition = byValue(type);

	return E('span', {
		'class': 'sf-device-type-icon',
		'title': definition.label,
		'aria-label': definition.label
	}, [svgIcon(definition.paths)]);
}

return baseclass.extend({
	definitions: definitions,
	byValue: byValue,
	options: options,
	displayedType: displayedType,
	infer: infer,
	icon: icon
});
