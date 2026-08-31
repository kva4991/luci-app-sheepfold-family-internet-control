'use strict';
'require baseclass';
'require ui';

/* §homen01: подтверждение относится к показанной сети, а не к любому частному WAN */
function render(deps) {
	var status = null;
	var initial = '0';
	var select = E('select', { 'class': 'cbi-input-select', 'disabled': 'disabled', 'change': deps.changed });
	var note = E('p', { 'role': 'status', 'class': 'sf-note' }, _('Loading home network...'));
	var root = E('div', { 'class': 'sf-settings-section' }, [
		E('h3', {}, _('Parent app in the main home network')),
		E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, _('Allow access from the main home network')), select
		]), note,
		E('button', {
			'class': 'sf-action', 'type': 'button', 'title': _('Connection details'),
			'click': function () {
				ui.showModal(_('Connection details'), [
					E('p', {}, _('Enable this only when the WAN cable connects Sheepfold to your own main router. This permits only the parent app API from the displayed network, not LuCI or SSH. The main router and internet rules are not changed.')),
					E('p', {}, _('First open the paired app on Sheepfold Wi-Fi to save both addresses. Use the same phone MAC on both home networks. If the upstream address or gateway changes, confirm the network here again.')),
					E('div', { 'class': 'right' }, E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Close')))
				]);
			}
		}, [deps.icon('navigationInformation'), ' ', _('Connection details')])
	]);

	function applyStatus(value) {
		status = value;
		initial = value.enabled ? (value.state === 'trusted' ? '1' : 'changed') : '0';
		var choices = [E('option', { 'value': '0' }, _('Off')), E('option', { 'value': '1' }, _('Allow the displayed home network'))];
		if (initial === 'changed')
			choices.push(E('option', { 'value': 'changed', 'disabled': 'disabled' }, _('Network changed: confirmation required')));
		select.replaceChildren.apply(select, choices);
		select.value = initial;
		select.disabled = false;
		select.querySelector('option[value="1"]').disabled = !/^[a-f0-9]{64}$/.test(value.candidate || '');
		note.textContent = value.candidate ?
			_('Sheepfold address') + ': ' + value.address + '/' + value.prefix + '; ' + _('Main router') + ': ' + value.gateway :
			_('A directly connected private IPv4 home network was not found. Access stays closed.');
	}

	function response(result) {
		if (result.code !== 0)
			throw new Error(_('Could not confirm the home network. Reload settings and try again.'));
		return JSON.parse(result.stdout);
	}

	deps.registerSaver({
		isChanged: function () { return status && select.value !== initial; },
		save: function () {
			select.disabled = true;
			return deps.run(['home-network-configure', select.value, status.candidate || '']).then(response).then(function (value) {
				applyStatus(value);
			}).finally(function () {
				select.disabled = false;
			});
		},
		accept: function () { initial = select.value; }
	});
	deps.run(['home-network-status']).then(response).then(applyStatus).catch(function () {
		note.textContent = _('Could not read the home network. Reload settings.');
	});
	return root;
}

return baseclass.extend({ render: render });
