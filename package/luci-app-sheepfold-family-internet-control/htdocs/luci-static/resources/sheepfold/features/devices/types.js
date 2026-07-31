'use strict';
'require baseclass';
'require sheepfold.shared.icons as sharedIcons';

function definitions() {
	return [
		['unknown', _('Unknown device type'), 'deviceTypeUnknown'],
		['phone', _('Phone'), 'deviceTypePhone'],
		['tablet', _('Tablet'), 'deviceTypeTablet'],
		['computer', _('Computer'), 'deviceTypeComputer'],
		['tv', _('TV'), 'deviceTypeTelevision'],
		['media_player', _('Media player'), 'deviceTypeMediaPlayer'],
		['smart_watch', _('Smart watch'), 'deviceTypeSmartWatch'],
		['console', _('Game console'), 'deviceTypeGameConsole'],
		['printer', _('Printer'), 'deviceTypePrinter'],
		['server', _('Server'), 'deviceTypeServer'],
		['camera', _('Camera'), 'deviceTypeCamera'],
		['speaker', _('Smart speaker'), 'deviceTypeSmartSpeaker'],
		['vacuum', _('Robot vacuum'), 'deviceTypeRobotVacuum'],
		['smart_home', _('Smart home'), 'deviceTypeSmartHome'],
		['engineering', _('Engineering device'), 'deviceTypeEngineering'],
		['smart', _('Smart device'), 'deviceTypeSmartDevice'],
		['network', _('Network device'), 'deviceTypeNetwork'],
		['router', _('Router or access point'), 'deviceTypeRouter'],
		['network_switch', _('Network switch'), 'deviceTypeNetworkSwitch']
	].map(function (item) {
		return { value: item[0], label: item[1], iconName: item[2] };
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
	if (/(network switch|ethernet switch|managed switch|unmanaged switch|коммутатор|сетевой свитч)/.test(text)) return 'network_switch';
	if (/(playstation|ps4|ps5|xbox|nintendo switch|game console|игровая приставк)/.test(text)) return 'console';
	if (/(printer|print|epson|canon|hp-|принтер)/.test(text)) return 'printer';
	if (/(home[ -]?assistant|hassio|hass\.io|haos|home assistant green|home assistant yellow|openhab|adguard[ -]?home|adguardhome|samba|smb|cifs|файловый сервер|file server|nas|proxmox|pve|truenas|freenas|openmediavault|omv|synology|diskstation|qnap|unraid|plex server|jellyfin|emby|docker host|portainer|мини[ -]?сервер|домашний сервер|smlight|slzb|slzb-mr4u|zigbee2mqtt|zha coordinator|zigbee coordinator|zigbee gateway|zigbee bridge|matter bridge|thread border router|homekit bridge|smart home hub|smarthome hub|хаб умного дома|координатор zigbee|zigbee шлюз|шлюз zigbee|шлюз умного дома|philips hue bridge|hue bridge|ikea dirigera|dirigera|tradfri gateway|trådfri gateway|aqara hub|xiaomi gateway|mijia gateway|tuya gateway|sonoff zigbee bridge|hubitat|smartthings hub|aeotec hub|homey|fibaro home center|homematic|deconz|conbee|skyconnect|zwavejs|z-wave js|z-wave gateway|zwave gateway)/.test(text)) return 'server';
	if (/(nvr|dvr|xvr|hybrid recorder|video recorder|videoregistrar|videonablyudenie|videonablydenie|videonabludenie|video-nablyudenie|video-nablydenie|видеорегистратор|регистратор|cctv server|surveillance server|video server|сервер видеонаблюдения|ltv-rne|rne-\d|rvi-r|trassir|xmeye|ivms|hik-connect|smartpss|gdmss|idmss|unv.*nvr|uniview.*nvr|hikvision.*nvr|hiwatch.*nvr|hilook.*nvr|dahua.*nvr|beward.*nvr|optimus.*nvr|tantos.*nvr|polyvision.*nvr|hanwha.*nvr|wisenet.*nvr|axis.*nvr|vivotek.*nvr|tiandy.*nvr)/.test(text)) return 'server';
	if (/(camera|ip[-_ ]?cam|webcam|(^|[^a-z0-9])cam[0-9]+([^a-z0-9]|$)|(^|[^a-z0-9])cam[-_ ][0-9]+([^a-z0-9]|$)|камера)/.test(text)) return 'camera';
	if (/(alice|alisa|yandex|яндекс|алиса|station|станци[яи]|smart speaker|speaker|колонк|sonos|homepod|alexa|amazon echo|google home|sberboom|сбербум|маруся|marusya|капсул)/.test(text)) return 'speaker';
	if (/(vacuum|roborock|dreame|deebot|ecovacs|irobot|roomba|пылесос|miio|xiaomi-vacuum|viomi|ilife|eufy|yeedi)/.test(text)) return 'vacuum';
	if (/(warm floor|underfloor|floor heating|heated floor|терморегулятор|термоголовк|т[её]пл[ыо]й пол|теплый пол|тёплый пол|подогрев пола|heater relay|smart relay|relay|реле|выключател|switch module|wall switch|light switch|освещен|свет|ламп|dimmer|диммер|curtain|curtains|blind|blinds|shade|roller shade|штор|жалюзи|карниз|чайник|kettle|утюг|iron|socket|plug|розетк|tuya|ewelink|sonoff|shelly|aqara|mijia|xiaomi smart|yeelight|philips hue|nanoleaf|wled|led controller|контроллер led|контроллер света|датчик движения|motion sensor|door sensor|window sensor|датчик двери|датчик окна|leak sensor|датчик протечки|smoke sensor|датчик дыма|temperature sensor|датчик температуры|humidity sensor|датчик влажности|espressif|esp8266|esp32|esp32c3|esp32-c3|esp32s3|esp32-s3|tasmota|esphome)/.test(text)) return 'smart_home';
	if (/(zont|зонт|ectostroy|ectocontrol|эктоконтрол|myheat|teplocom|теплоком|xital|кситал|телеметрик|telemetrika|owen|овен|saures|boiler|kotel|кот[её]л|baxi|navien|vaillant|buderus|protherm|ariston|heating|thermostat|термостат|отоплен|контроллер|alarm|сигнализац)/.test(text)) return 'engineering';
	if (/(router|gateway|repeater|extender|openwrt|роутер|шлюз|точка доступа)/.test(text)) return 'router';

	return 'smart';
}

function icon(type) {
	var definition = byValue(type);

	return E('span', {
		'class': 'sf-device-type-icon',
		'title': definition.label,
		'aria-label': definition.label
	}, [sharedIcons.named(definition.iconName)]);
}

return baseclass.extend({
	definitions: definitions,
	byValue: byValue,
	options: options,
	displayedType: displayedType,
	infer: infer,
	icon: icon
});
