'use strict';
'require baseclass';
'require ui';

/* §frontmod §settingview1
 * Композиция Misc владеет только DOM и переходами черновика. Все реальные записи,
 * reload и backend side effects выполняются переданными адаптерами общей кнопки Save.
 */
function create(deps) {
	function confirmWifiAutoDisable(timeValue) {
		return new Promise(function (resolve) {
			var remaining = 10;
			var countdown = E('strong', {}, String(remaining));
			var confirmButton;
			var timer;
			var resolved = false;

			function done(confirmed) {
				if (resolved)
					return;
				resolved = true;
				if (timer)
					window.clearInterval(timer);
				ui.hideModal();
				resolve(confirmed);
			}

			confirmButton = E('button', {
				'class': 'btn cbi-button cbi-button-positive',
				'disabled': 'disabled',
				'click': function (event) {
					event.preventDefault();
					done(true);
				}
			}, _('I understand the risk, continue') + ' (' + remaining + ')');

			timer = window.setInterval(function () {
				remaining -= 1;
				countdown.textContent = String(Math.max(remaining, 0));
				confirmButton.textContent = remaining > 0 ?
					_('I understand the risk, continue') + ' (' + remaining + ')' :
					_('I understand the risk, continue');

				if (remaining <= 0) {
					confirmButton.disabled = false;
					window.clearInterval(timer);
				}
			}, 1000);

			ui.showModal(_('Wi-Fi auto-disable warning'), [
				E('div', { 'class': 'sf-warning-modal' }, [
					E('p', {}, _('When Wi-Fi turns off, you will not be able to turn it back on from a phone connected only by Wi-Fi. Configure messenger control or a WPS button action so you can enable Wi-Fi outside the schedule if needed.')),
					E('p', {}, [
						E('strong', {}, _('Auto-disable time') + ': '),
						E('span', {}, timeValue)
					]),
					E('p', {}, [
						E('span', {}, _('Confirmation will be available in') + ' '),
						countdown,
						E('span', {}, ' ' + _('seconds'))
					])
				]),
				E('div', { 'class': 'right sf-modal-actions' }, [
					E('button', {
						'class': 'btn cbi-button',
						'click': function (event) {
							event.preventDefault();
							done(false);
						}
					}, _('Cancel')),
					confirmButton
				])
			]);
		});
	}

	function timeAutomationField(label, modeOption, timeOption, defaultTime) {
		var currentMode = deps.value(modeOption, 'never');
		var currentTime = deps.value(timeOption, defaultTime);
		var modeName = 'sf-' + modeOption;
		var neverRadio = E('input', {
			'type': 'radio',
			'name': modeName,
			'value': 'never',
			'checked': currentMode !== 'time' ? 'checked' : null
		});
		var timeRadio = E('input', {
			'type': 'radio',
			'name': modeName,
			'value': 'time',
			'checked': currentMode === 'time' ? 'checked' : null
		});
		var timeInput = E('input', {
			'class': 'cbi-input-text sf-time-input',
			'type': 'time',
			'value': currentTime || defaultTime
		});

		function updateDraft() {
			var options = {};
			options[modeOption] = timeRadio.checked ? 'time' : 'never';
			options[timeOption] = timeInput.value || defaultTime;
			deps.setOptions(options);
		}

		neverRadio.addEventListener('change', updateDraft);
		timeRadio.addEventListener('change', updateDraft);
		timeInput.addEventListener('focus', function () {
			timeRadio.checked = true;
			updateDraft();
		});
		timeInput.addEventListener('input', updateDraft);
		timeInput.addEventListener('keydown', function (event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				timeRadio.checked = true;
				updateDraft();
			}
		});

		return E('div', { 'class': 'sf-field sf-field-wide sf-radio-time-field' }, [
			E('span', {}, label),
			E('label', { 'class': 'sf-inline-option' }, [
				neverRadio,
				E('span', {}, _('Never'))
			]),
			E('label', { 'class': 'sf-inline-option' }, [
				timeRadio,
				E('span', {}, _('At time')),
				timeInput
			]),
			E('small', {}, _('Applies to all Wi-Fi radios on the router. Real switching must require confirmation and be performed by the router backend.'))
		]);
	}

	function accessPriorityField() {
		return E('div', { 'class': 'sf-priority-editor' }, [
			E('strong', {}, _('Internet access rule priority')),
			E('p', { 'class': 'alert-message notice' },
				_('The order is temporarily fixed so that the router always applies exactly what the interface shows.')),
			E('div', { 'class': 'sf-priority-list' }, deps.accessSteps.map(function (step, index) {
				return E('div', { 'class': 'sf-priority-row' }, [
					E('strong', { 'class': 'sf-priority-num' }, String(index + 1)),
					E('span', { 'class': 'sf-priority-name' }, _(step[1]))
				]);
			}))
		]);
	}

	function scheduleConflictPolicyField() {
		var current = deps.value('schedule_conflict_internet', 'off') === 'on' ? 'on' : 'off';
		var choices = [
			['off', _('Off')],
			['on', _('On')]
		].map(function (item) {
			return E('label', { 'class': 'sf-action-choice sf-conflict-choice sf-conflict-choice-' + item[0] }, [
				E('input', {
					'type': 'radio',
					'name': 'sf-schedule-conflict-internet',
					'value': item[0],
					'checked': current === item[0] ? 'checked' : null,
					'change': function (event) {
						if (event.currentTarget.checked)
							deps.setOption('schedule_conflict_internet', item[0]);
					}
				}),
				E('span', {}, item[1])
			]);
		});

		return E('div', { 'class': 'sf-field sf-field-wide sf-conflict-policy-field' }, [
			E('span', {}, _('When internet enable and disable schedules conflict, internet will be')),
			E('div', { 'class': 'sf-action-choices' }, choices),
			E('small', {}, _('The conflict will still be shown in the interface and written to the journal. Device schedules remain more specific than group schedules.'))
		]);
	}

	function siteBlacklistModeField() {
		return deps.fields.saveSelectGlobalField(_('Site blacklist'), 'site_blocklist_mode', 'except_allowlist_admins', [
			['disabled', _('Disabled')],
			['all', _('Enabled for everyone')],
			['except_allowlist_admins', _('Enabled for everyone except allowlist and administrators')]
		]);
	}

	function siteListsUpdateIntervalField() {
		return deps.fields.saveSelectGlobalField(_('Site list update from allowlist and blocklist sources'), 'site_lists_update_interval', 'weekly', [
			['daily', _('Every day')],
			['3days', _('Every 3 days')],
			['weekly', _('Once a week')]
		]);
	}

	function wpsActionField(label, option) {
		return deps.fields.saveSelectGlobalField(label, option, 'router_default', [
			['router_default', _('Router default behavior')],
			['allow_wifi_connection', _('Allow Wi-Fi connection')],
			['allow_wifi_and_allowlist', _('Allow Wi-Fi connection and add devices to allowlist (dangerous)')],
			['disable_wifi', _('Disable Wi-Fi')]
		], null, null, [
			E('span', {}, _('Adding devices to allowlist through the WPS button is dangerous because after pressing it, for 30 seconds any device can connect to Wi-Fi and get into the allowlist.')),
			E('br'),
			E('span', {}, _('While WPS connection is allowed, all router LEDs should blink using the 1010000 pattern for 30 seconds. One tick is half a second.'))
		]);
	}

	function ledControlField() {
		var currentValue = deps.value('router_led_control', 'router_default');
		var hint = E('small', {
			'hidden': currentValue === 'new_device_alert_until_luci_login' ? null : 'hidden'
		}, _('When a new device connects, router LEDs will turn on. After a successful LuCI password login or after any admin views the new-device notification on the phone, restore the router default LED behavior immediately.'));
		var select = E('select', {
			'class': 'cbi-input-select',
			'change': function (event) {
				var nextValue = event.currentTarget.value;
				hint.hidden = nextValue === 'new_device_alert_until_luci_login' ? null : 'hidden';
				deps.setOption('router_led_control', nextValue);
			}
		}, [
			['router_default', _('Router default behavior')],
			['off_forever', _('Turn off all LEDs permanently')],
			['new_device_alert_until_luci_login', _('New device LED alert until LuCI login')]
		].map(function (item) {
			return E('option', {
				'value': item[0],
				'selected': item[0] === currentValue ? 'selected' : null
			}, item[1]);
		}));

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, _('Router LED control')),
			select,
			hint
		]);
	}

	function render() {
		return E('div', { 'class': 'sf-flat-form sf-misc-actions' }, [
			deps.fields.settingsDivider(_('Wi-Fi settings')),
			timeAutomationField(_('Enable Wi-Fi automatically'), 'wifi_auto_enable_mode', 'wifi_auto_enable_time', '07:00'),
			timeAutomationField(_('Disable Wi-Fi automatically'), 'wifi_auto_disable_mode', 'wifi_auto_disable_time', '23:00'),
			deps.fields.settingsDivider(_('Router time and NTP')),
			deps.timeSettings(),
			deps.fields.settingsDivider(_('Network compatibility')),
			deps.ipv6Field(),
			deps.fields.settingsDivider(_('WPS button')),
			wpsActionField(_('WPS short button press'), 'wps_short_press_action'),
			wpsActionField(_('WPS long button press'), 'wps_long_press_action'),
			deps.fields.settingsDivider(_('Router LEDs')),
			ledControlField(),
			deps.fields.settingsDivider(_('Access priority')),
			accessPriorityField(),
			scheduleConflictPolicyField(),
			deps.fields.settingsDivider(_('Site list sources')),
			siteListsUpdateIntervalField(),
			deps.fields.globalTextareaOptionField(
				_('Whitelist sources'),
				'site_allowlist_sources',
				deps.defaultSiteAllowlistSources,
				null,
				null,
				_('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
			),
			siteBlacklistModeField(),
			deps.fields.globalTextareaOptionField(
				_('Site blacklist sources'),
				'site_blocklist_sources',
				deps.defaultSiteBlocklistSources,
				null,
				null,
				_('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
			),
			deps.siteStatus(),
			deps.fields.settingsDivider(_('Other actions')),
			deps.fields.saveSelectGlobalField(_('Export mode'), 'export_mode', 'safe', [
				['safe', _('Readable JSON without secrets')],
				['encrypted', _('Encrypted full backup')]
			]),
			E('div', { 'class': 'sf-action-stack' }, [
				E('button', {
					'class': 'sf-action sf-action-neutral',
					'click': function (event) {
						event.preventDefault();
						deps.importSettings();
					}
				}, _('Import all settings and user list')),
				E('button', {
					'class': 'sf-action sf-action-neutral',
					'click': function (event) {
						event.preventDefault();
						deps.exportSettings();
					}
				}, _('Export all settings and user list')),
				deps.updateRow(),
				deps.rebootButton()
			])
		]);
	}

	return {
		confirmWifiAutoDisable: confirmWifiAutoDisable,
		timeAutomationField: timeAutomationField,
		accessPriorityField: accessPriorityField,
		scheduleConflictPolicyField: scheduleConflictPolicyField,
		render: render
	};
}

return baseclass.extend({ create: create });
