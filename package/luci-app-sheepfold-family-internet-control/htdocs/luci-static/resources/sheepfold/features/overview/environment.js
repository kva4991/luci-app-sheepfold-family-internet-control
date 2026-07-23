'use strict';
'require baseclass';

/* §frontmod §ovfinal1
 * Узкий адаптер окружения для контроллеров overview. Он централизует безопасное
 * чтение и примитивы представления, но не владеет состоянием функций или мутациями.
 */
function create(deps) {
	function safeGet(config, section, option, fallback) {
		try {
			var value = deps.uci.get(config, section, option);
			return value == null ? fallback : value;
		} catch (error) {
			return fallback;
		}
	}

	function sections(config, type) {
		try {
			return (type ? deps.uci.sections(config, type) : deps.uci.sections(config)) || [];
		} catch (error) {
			return [];
		}
	}

	function notify(message, level) {
		deps.ui.addNotification(null, E('p', {}, message), level || 'info');
	}

	function notifyCentered(message) {
		var toast = E('div', { 'class': 'sf-centered-toast' }, message);

		document.body.appendChild(toast);
		window.setTimeout(function () { toast.classList.add('sf-centered-toast-hide'); }, 1800);
		window.setTimeout(function () {
			if (toast.parentNode)
				toast.parentNode.removeChild(toast);
		}, 2400);
	}


	function read(path) {
		return deps.fs.read(path);
	}

	function write(path, value) {
		return deps.fs.write(path, value);
	}

	function exec(path, args) {
		return deps.fs.exec(path, args || []);
	}

	function run(args) {
		return deps.routerBackend.run(args || []);
	}

	function ensureOk(result, fallback) {
		return deps.routerBackend.ensureOk(result, fallback || _('Action failed.'));
	}

	function errorText(error, fallback) {
		return deps.routerBackend.errorText(error, fallback || _('Action failed.'));
	}

	function infoValue(value, fallback) {
		return deps.routerInfo.infoValue(value, fallback);
	}

	function identityIcon(device) {
		var protectedIdentity = !!(device && device.identityProtected);
		var title = protectedIdentity ?
			_('Stable device identity is available') :
			_('This device is protected mainly by its MAC address; MAC spoofing cannot be reliably detected yet');

		return deps.icons.deviceIdentity(protectedIdentity, title);
	}

	function qrCode(text) {
		return deps.pairingQr.render(text, {
			errorLabel: _('QR payload'),
			ariaLabel: _('Pairing')
		});
	}

	function settingLine(label, value) {
		return E('div', { 'class': 'sf-setting-line' }, [
			E('span', {}, label),
			E('code', {}, value)
		]);
	}

	function passwordRevealField(label, value) {
		var input = E('input', {
			'class': 'cbi-input-text sf-secret-input',
			'type': 'password',
			'readonly': 'readonly',
			'value': value || ''
		});
		var button = E('button', {
			'class': 'sf-icon-action sf-secret-toggle',
			'title': _('Show temporary password'),
			'aria-label': _('Show temporary password'),
			'click': function (event) {
				var visible;

				event.preventDefault();
				visible = input.type === 'password';
				input.type = visible ? 'text' : 'password';
				button.setAttribute('title', visible ? _('Hide temporary password') : _('Show temporary password'));
				button.setAttribute('aria-label', visible ? _('Hide temporary password') : _('Show temporary password'));
			}
		}, deps.icons.named('eye'));

		return E('label', { 'class': 'sf-field sf-secret-field' }, [
			E('span', {}, label),
			E('div', { 'class': 'sf-secret-row' }, [input, button])
		]);
	}

	return {
		get: safeGet,
		sections: sections,
		notify: notify,
		notifyCentered: notifyCentered,
		read: read,
		write: write,
		exec: exec,
		run: run,
		ensureOk: ensureOk,
		errorText: errorText,
		infoValue: infoValue,
		icon: deps.icons.named,
		iconButton: deps.icons.button,
		adminCrown: function () { return deps.icons.adminCrown(_('Admin device')); },
		staticLease: function () { return deps.icons.staticLease(_('Permanent IP lease')); },
		identityIcon: identityIcon,
		qrCode: qrCode,
		settingLine: settingLine,
		passwordRevealField: passwordRevealField
	};
}

return baseclass.extend({ create: create });
