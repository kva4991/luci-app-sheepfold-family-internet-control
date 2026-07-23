'use strict';
'require baseclass';

/* §frontmod §ovfinal1 §wifitgl1
 * Wi-Fi controller owns wireless-card composition and editor lifecycle. Wireless
 * UCI commit and reload semantics remain in wifi/persistence.js.
 */
function create(deps) {
	var editor = deps.editor.create({
		setOption: deps.persistence.setOption,
		unsetOption: deps.persistence.unsetOption,
		persist: deps.persistence.persist,
		confirm: deps.confirm,
		notify: deps.notify,
		errorText: deps.errorText
	});

	function readNetworks() {
		return deps.cards.readNetworks(deps.sections('wireless', 'wifi-iface'), deps.get);
	}

	function bandBadge(kind) {
		var labels = { '2g': '2.4', '5g': '5', '6g': '6' };
		var titles = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' };

		if (!kind || !labels[kind])
			return '';
		return E('span', {
			'class': 'sf-wifi-band sf-wifi-band-' + kind,
			'title': titles[kind],
			'aria-label': titles[kind]
		}, [
			deps.svg([
				'M2 8c5-5 15-5 20 0',
				'M5 11c3.5-3.5 10.5-3.5 14 0',
				'M8 14c2-2 6-2 8 0',
				'M11 17h2'
			]),
			E('span', { 'class': 'sf-wifi-band-label' }, labels[kind])
		]);
	}

	function title(network, powerControl) {
		var content = [E('span', { 'class': 'sf-wifi-title-text' }, network.title || _('Network'))];
		var badge = bandBadge(network.bandKind);
		if (badge)
			content.push(badge);
		if (powerControl)
			content.push(powerControl);
		return E('span', { 'class': 'sf-wifi-title-row' }, content);
	}

	function color(index) {
		var palette = deps.palette();
		return palette[index % palette.length];
	}

	function box(network, index) {
		return deps.cards.networkBox(network, index, {
			qrPayload: deps.payload.build,
			qrCode: deps.qrCode,
			registerEditor: editor.register,
			cardColor: color,
			title: title
		});
	}

	function render() {
		var networks = readNetworks();
		editor.clear();
		return E('div', { 'class': 'sf-panel' }, [
			networks.length ?
				E('div', { 'class': 'sf-grid two' }, networks.map(box)) :
				E('div', { 'class': 'sf-note sf-note-warning' },
					_('No active Wi-Fi networks were found in the router wireless config.')),
			networks.length ? editor.saveBar() : ''
		]);
	}

	return {
		readNetworks: readNetworks,
		bandBadge: bandBadge,
		title: title,
		box: box,
		render: render,
		editor: editor
	};
}

return baseclass.extend({ create: create });
