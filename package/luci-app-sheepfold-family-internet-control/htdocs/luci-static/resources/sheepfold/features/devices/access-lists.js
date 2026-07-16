'use strict';
'require baseclass';
'require sheepfold.features.devices.inventory as deviceInventory';

function updatedValues(currentValues, mac, enabled) {
	var normalizedMac = deviceInventory.normalizeMac(mac);
	var result = deviceInventory.listValues(currentValues).map(deviceInventory.normalizeMac).filter(Boolean);

	result = result.filter(function (value, index) {
		return result.indexOf(value) === index;
	});

	if (!normalizedMac)
		return result;

	if (enabled && result.indexOf(normalizedMac) === -1)
		result.push(normalizedMac);

	if (!enabled)
		result = result.filter(function (value) { return value !== normalizedMac; });

	return result;
}

function conflictingList(listSections, targetStatus, mac) {
	// Возвращаем конфликт вызывающему коду, а не «исправляем» его переносом MAC:
	// смена белого/чёрного списка устройств должна оставаться явным решением родителя. §lstxcl1
	if (targetStatus === 'allow' && deviceInventory.macInList(listSections, 'blocklist', mac))
		return 'blocklist';

	if (targetStatus === 'blocked' && deviceInventory.macInList(listSections, 'allowlist', mac))
		return 'allowlist';

	return '';
}

return baseclass.extend({
	updatedValues: updatedValues,
	conflictingList: conflictingList
});
