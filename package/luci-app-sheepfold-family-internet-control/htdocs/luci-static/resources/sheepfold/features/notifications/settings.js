'use strict';
/* Настройка касается только доставки уведомлений. Событие смены SIM остаётся
 * в локальном административном журнале во всех режимах. §simchg1 */
'require baseclass';

function render(deps) {
	return E('div', { 'class': 'sf-flat-form' }, [
		E('p', { 'class': 'sf-section-intro' },
			_('The child Android app can notice a change of active SIM subscriptions and report it to this router. Android does not always provide the phone number, so a notification may say that the number is unavailable.')),
		deps.selectField(
			_('Notify administrators about SIM card changes'),
			'sim_change_notifications',
			'new_only',
			[
				['all', _('Yes, about every change')],
				['new_only', _('Only when changed to a new SIM card (default)')],
				['off', _('No')]
			],
			null,
			null,
			_('The first SIM found after child-app installation is also written to the journal and notified in the first two modes. Returning to a previously known SIM creates a phone notification only in the first mode.')
		),
		E('p', { 'class': 'sf-note' },
			_('The child app needs Android phone-state permission. Sheepfold does not read calls, SMS messages, ICCID, IMSI, or IMEI.')),
		E('hr', { 'class': 'sf-settings-divider' }),
		E('p', { 'class': 'sf-section-intro' },
			_('The child Android app can report the first connection to each new Wi-Fi network. The router stores a bounded local list and sends an administrator notification.')),
		deps.selectField(
			_('Notify administrators about new Wi-Fi networks of a child device'),
			'child_wifi_network_notifications',
			'off',
			[
				['with_location', _('Yes, with the phone location at connection time')],
				['network_only', _('Yes, without location')],
				['off', _('No (default)')]
			],
			null,
			null,
			_('Location is the last available phone position, not a verified address of the Wi-Fi access point. If Android cannot provide a recent position, the notification contains only the network name.')
		),
		E('p', { 'class': 'sf-note' },
			_('SSID is stored locally, while BSSID is converted to a one-way fingerprint on the phone and is not sent to the router. Android location and nearby-Wi-Fi permissions are required.')),
		E('p', { 'class': 'sf-note' },
			_('When the home router is unavailable, the child app keeps up to 100 prepared reports on the phone and sends them after returning home. Android background limits mean that very short connections may be missed.')),
		E('button', {
			'type': 'button',
			'class': 'sf-action sf-action-danger',
			'click': function () { deps.clearWifiHistory(); }
		}, _('Clear saved Wi-Fi network history'))
	]);
}

return baseclass.extend({ render: render });
