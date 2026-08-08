'use strict';
'require baseclass';

/* §autoact1
 * Главный режим автоматизации является профилем нескольких UCI-полей. Это
 * оставляет backend простым и совместимым с прежними конфигами, но не позволяет
 * скрытому интерфейсу обещать автоматизацию при ручных значениях ниже.
 */
function maximumAutomationDraft() {
	return {
		automation_mode: 'maximum',
		new_device_policy: 'allow',
		auto_configure: '1',
		detection_mode: 'full',
		no_restrictions_auto_assign: '1',
		personal_devices_auto_assign: '1',
		device_monitoring_mode: 'automatic'
	};
}

function automationModeDraft(value) {
	return value === 'selective' ? { automation_mode: 'selective' } : maximumAutomationDraft();
}

function automaticSetupDraft(value) {
	var mode = value === 'reduced' ? 'reduced' : 'full';

	return {
		auto_configure: value === 'disabled' ? '0' : '1',
		detection_mode: mode,
		no_restrictions_auto_assign: value === 'disabled' ? '0' : '1'
	};
}

function applicationPortField(deps) {
	var currentValue = deps.value('app_port', '5201');
	var input = E('input', {
		'class': 'cbi-input-text',
		'type': 'number',
		'min': '1',
		'max': '65535',
		'value': currentValue
	});

	function updateDraft(event) {
		if (event && event.key && event.key !== 'Enter')
			return;
		if (event && event.key)
			event.preventDefault();
		deps.setOption('app_port', String(input.value || '').trim());
	}

	input.addEventListener('input', updateDraft);
	input.addEventListener('keydown', updateDraft);

	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, _('Application HTTPS port')),
		input,
		E('small', {}, _('Used by Android app and pairing QR codes.'))
	]);
}

function automaticSetupField(deps) {
	var enabled = deps.value('auto_configure', '1') === '1';
	var value = !enabled ? 'disabled' :
		deps.value('detection_mode', 'full') === 'reduced' ? 'reduced' : 'full';
	var select = E('select', {
		'class': 'cbi-input-select',
		'data-setting-option': 'automatic_setup',
		'change': function (event) {
			var nextValue = event.currentTarget.value;
			deps.setOptions(automaticSetupDraft(nextValue));
			if (deps.detectionTools)
				deps.detectionTools.setMode(nextValue);
		}
	}, [
		E('option', { 'value': 'disabled', 'selected': value === 'disabled' ? 'selected' : null }, _('Disabled')),
		E('option', { 'value': 'full', 'selected': value === 'full' ? 'selected' : null }, _('Full automatic setup')),
		E('option', { 'value': 'reduced', 'selected': value === 'reduced' ? 'selected' : null }, _('Reduced automatic setup'))
	]);

	if (deps.detectionTools)
		deps.detectionTools.setMode(value);

	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, _('New device automatic setup')),
		select,
		E('small', {}, _('Full mode can use port checks when available. Reduced mode avoids heavy checks but still can automatically add confidently detected home infrastructure devices to No restrictions.'))
	]);
}

function setAutomationControlValue(container, option, value) {
	var control = container.querySelector('[data-setting-option="' + option + '"]');
	if (control)
		control.value = value;
}

function automationModeField(deps, childContainer) {
	var currentValue = deps.value('automation_mode', 'maximum') === 'selective' ? 'selective' : 'maximum';
	var select = E('select', {
		'class': 'cbi-input-select',
		'data-setting-option': 'automation_mode',
		'change': function (event) {
			var nextValue = event.currentTarget.value === 'selective' ? 'selective' : 'maximum';
			deps.setOptions(automationModeDraft(nextValue));
			childContainer.hidden = nextValue === 'maximum' ? 'hidden' : null;
			if (nextValue === 'maximum') {
				setAutomationControlValue(childContainer, 'new_device_policy', 'allow');
				setAutomationControlValue(childContainer, 'automatic_setup', 'full');
				setAutomationControlValue(childContainer, 'device_monitoring_mode', 'automatic');
				if (deps.detectionTools)
					deps.detectionTools.setMode('full');
			}
		}
	}, [
		E('option', { 'value': 'maximum', 'selected': currentValue === 'maximum' ? 'selected' : null }, _('Maximum automation')),
		E('option', { 'value': 'selective', 'selected': currentValue === 'selective' ? 'selected' : null }, _('Selective automation'))
	]);

	childContainer.hidden = currentValue === 'maximum' ? 'hidden' : null;

	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, _('Mode')),
		select,
		E('small', {}, _('Maximum automation applies the recommended automatic behavior to all settings below. Selective automation lets you configure each setting separately.'))
	]);
}


function countryProfileField(deps) {
	var current = deps.value('country_profile', 'ru');
	var values = [
		['ru', _('Russia')],
		['by', _('Belarus')],
		['cn', _('China')],
		['other', _('Other country')]
	];
	var select = E('select', {
		'class': 'cbi-input-select',
		'change': function (event) {
			var nextValue = event.currentTarget.value;
			deps.setOption('country_profile', nextValue);
			if (deps.timeSettings)
				deps.timeSettings.setCountry(nextValue);
		}
	}, values.map(function (item) {
		return E('option', {
			'value': item[0],
			'selected': item[0] === current ? 'selected' : null
		}, item[1]);
	}));

	if (deps.timeSettings)
		deps.timeSettings.setCountry(current);

	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, _('Router country')),
		select,
		E('small', {}, _('Selects emergency-useful sites and country recommendations. Existing OpenWrt timezone settings are never overwritten automatically.'))
	]);
}

function render(deps) {
	var fields = [];
	var automationChildren;
	var automaticFields = [
		deps.selectField(_('New device behavior'), 'new_device_policy', 'allow', [
			['allow', _('Allow internet by default')],
			['restrict_until_configured', _('Restrict until configured')]
		]),
		automaticSetupField(deps)
	];

	if (deps.detectionTools)
		automaticFields.push(deps.detectionTools.render());
	automaticFields.push(deps.selectField(_('Device monitoring and setup'), 'device_monitoring_mode', 'automatic', [
		['automatic', _('Automatic (recommended)')],
		['manual', _('Manual')]
	], null, null, _('When a known MAC appears with strongly different trusted DHCP, mDNS, or UPnP identifiers, automatic mode temporarily blocks that connection at device-blocklist level. Manual mode restricts it until a parent decides. The saved rights of the original device are not changed.')));
	automationChildren = E('div', { 'class': 'sf-flat-form sf-automation-settings' }, automaticFields);

	if (deps.timeSetupNotice)
		fields.push(typeof deps.timeSetupNotice === 'function' ? deps.timeSetupNotice() : deps.timeSetupNotice);
	fields = fields.concat([
		deps.selectField(_('Application language'), 'language', 'ru', [
			['ru', _('Russian')],
			['en', _('English')],
			['zh_Hans', _('Chinese (Simplified)')]
		], null, null, _('Applies only to Sheepfold. Does not change the router LuCI language. The page reloads after Save.')),
		countryProfileField(deps),
		applicationPortField(deps),
		deps.divider(_('Automation actions')),
		automationModeField(deps, automationChildren),
		automationChildren
	]);

	fields.push(
		deps.selectField(_('Update check and installation'), 'update_check_install_mode', 'weekly', [
			['daily', _('Every day')],
			['weekly', _('Every week')],
			['monthly', _('Every month')],
			['never', _('Never')]
		], null, null, _('Defines how often Sheepfold checks for a stable release. Installation still requires an explicit confirmation.')),
		deps.selectField(_('Blocklist emergency-useful sites access'), 'domain_allowlist_for_blocklist', '1', [
			['1', _('Yes')],
			['0', _('No')]
		], null, null, _('Allows blocklisted devices to access only sites added to the emergency-useful sites list. Router access remains blocked.')),
		deps.textareaField(
			_('Blocked internet page text shown instead of websites'),
			'blocked_page_text',
			_('Internet is temporarily unavailable by family rules.'),
			_('Settings saved.'),
			_('Could not save settings.'),
			null,
			2
		)
	);

	return E('div', { 'class': 'sf-flat-form' }, fields);
}

return baseclass.extend({
	maximumAutomationDraft: maximumAutomationDraft,
	automationModeDraft: automationModeDraft,
	automaticSetupDraft: automaticSetupDraft,
	render: render
});
