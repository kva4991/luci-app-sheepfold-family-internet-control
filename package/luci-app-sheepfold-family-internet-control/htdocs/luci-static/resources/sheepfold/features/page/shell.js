'use strict';
'require baseclass';
'require view';
'require uci';

/* §frontmod §ovfinal1
 * Page shell owns only LuCI view lifecycle, tab navigation and panel composition.
 * Domain state and mutations are delegated to the injected controllers.
 */
function create(deps) {
	function logPath() {
		var value = deps.get('sheepfold', 'global', 'log_cache_path', deps.defaultLogCachePath) || deps.defaultLogCachePath;
		return /^\/tmp\/[A-Za-z0-9_./-]+$/.test(value) && value.indexOf('..') === -1 ? value : deps.defaultLogCachePath;
	}

	function loadRootPasswordStatus() {
		return deps.run(['root-password-status']).then(function (result) {
			var status = String(result && result.stdout || '').trim();
			deps.store.setRootPassword(status === 'set', status !== 'set' && status !== 'unset');
		}, function () {
			deps.store.setRootPassword(false, true);
		});
	}

	function currentBlocked() {
		var cached = deps.store.globalInternetBlocked();
		if (cached !== null)
			return cached;
		return deps.get('sheepfold', 'global', 'block_on_boot', '0') === '1';
	}

	function updateInternetButtons(page, blocked) {
		if (!page)
			return;
		page.querySelectorAll('.sf-internet-toggle').forEach(function (node) {
			var target = node.getAttribute('data-blocked') === '1';
			var active = target === blocked;
			node.classList.toggle('is-active', active);
			node.classList.toggle('is-inactive', !active);
			node.setAttribute('aria-pressed', active ? 'true' : 'false');
		});
	}

	function toggleInternet(blocked, button) {
		var command = blocked ? 'internet-disable' : 'internet-enable';
		var question = blocked ?
			_('Disable internet for every device except the allowlist?') :
			_('Enable internet and return to the configured device and schedule rules?');
		if (currentBlocked() === blocked)
			return Promise.resolve(false);
		if (!deps.confirm(question))
			return Promise.resolve(false);

		return deps.actions.execute({
			key: 'global-internet-toggle',
			button: button,
			args: [command],
			silent: true,
			errorMessage: blocked ? _('Could not disable internet.') : _('Could not enable internet.')
		}).then(function () {
			return deps.reloadConfig(['sheepfold']);
		}).then(function () {
			var actual = deps.get('sheepfold', 'global', 'block_on_boot', blocked ? '1' : '0') === '1';
			deps.store.setGlobalInternetBlocked(actual);
			updateInternetButtons(document.querySelector('.sf-page'), actual);
			deps.notify(actual ? _('Internet disabled.') : _('Internet enabled.'), actual ? 'warning' : 'info');
			return actual;
		}, function (error) {
			deps.notify(deps.errorText(error, blocked ? _('Could not disable internet.') : _('Could not enable internet.')), 'warning');
			return false;
		});
	}

	function internetButton(label, tone, blocked, active) {
		return E('button', {
			'class': 'sf-action sf-action-' + tone + ' sf-internet-toggle ' + (active === blocked ? 'is-active' : 'is-inactive'),
			'data-blocked': blocked ? '1' : '0',
			'data-sf-action-key': 'global-internet-toggle',
			'aria-pressed': active === blocked ? 'true' : 'false',
			'click': function (event) {
				event.preventDefault();
				toggleInternet(blocked, event.currentTarget);
			}
		}, label);
	}

	function deepLinkParams() {
		try {
			return new URLSearchParams(window.location.search || '');
		} catch (error) {
			return null;
		}
	}

	function switchTop(button, tab) {
		var page = button.closest('.sf-page');
		deps.navigation.selectTop(tab);
		page.querySelectorAll('.sf-tab[data-tab]').forEach(function (node) {
			node.classList.toggle('active', node.getAttribute('data-tab') === tab);
		});
		page.querySelectorAll('.sf-tab-panel').forEach(function (node) {
			node.hidden = node.getAttribute('data-tab') !== tab;
		});
	}

	function switchUserList(button, tab) {
		var panel = button.closest('.sf-panel');
		deps.navigation.selectUserList(tab);
		panel.querySelectorAll('.sf-user-list-tab').forEach(function (node) {
			node.classList.toggle('active', node.getAttribute('data-user-list-tab') === tab);
		});
		panel.querySelectorAll('.sf-user-list-panel').forEach(function (node) {
			node.hidden = node.getAttribute('data-user-list-panel') !== tab;
		});
	}

	function switchManagement(button, tab) {
		var panel = button.closest('.sf-panel');
		deps.navigation.selectManagement(tab);
		panel.querySelectorAll('.sf-management-tab').forEach(function (node) {
			node.classList.toggle('active', node.getAttribute('data-management-tab') === tab);
		});
		panel.querySelectorAll('.sf-management-panel').forEach(function (node) {
			node.hidden = node.getAttribute('data-management-panel') !== tab;
		});
	}

	function tabs(definitions, active, className, dataName, onSelect) {
		return E('div', { 'class': 'sf-tabs ' + (className || '') }, definitions.map(function (tab) {
			var attrs = {
				'class': 'sf-tab ' + (className ? className.replace(/-tabs\b/g, '-tab') : '') + (active === tab[0] ? ' active' : ''),
				'click': function (event) { event.preventDefault(); onSelect(event.currentTarget, tab[0]); }
			};
			attrs['data-' + dataName] = tab[0];
			return E('button', attrs, _(tab[1]));
		}));
	}

	function renderRootPasswordGate() {
		var status = deps.store.rootPassword();
		if (status.set)
			return '';
		return E('div', {
			'class': 'sf-root-password-gate',
			'role': 'alertdialog',
			'aria-modal': 'true'
		}, [E('div', { 'class': 'sf-root-password-card' }, [
			E('h3', {}, _('Protect the router with a password')),
			E('p', {}, status.failed ?
				_('Sheepfold could not verify the router root password. Settings remain locked for safety. Install the current Sheepfold package or set the router password and reload this page.') :
				_('The router root password is not set. Until you create it, anyone connected to the home network may be able to change router and Sheepfold settings.')),
			E('a', { 'class': 'sf-action sf-action-positive', 'href': L.url('admin/system/admin') }, _('Go to router password setup')),
			E('button', { 'class': 'sf-action sf-action-neutral', 'click': function () { window.location.reload(); } }, _('Check again'))
		])]);
	}

	function metric(label, value, tone, key, handler) {
		return E('button', {
			'class': 'sf-metric sf-metric-' + tone,
			'data-metric': key,
			'click': function (event) { event.preventDefault(); handler(event.currentTarget); }
		}, [E('span', {}, label), E('strong', {}, value)]);
	}

	var shell = view.extend({
		deepLinkHandled: false,
		uciLoadState: { sheepfold: false, wireless: false, system: false },

		load: function () {
			var self = this;
			return uci.load('sheepfold').then(function () {
				self.uciLoadState.sheepfold = true;
				return deps.i18n.installApplicationTranslator(deps.get('sheepfold', 'global', 'language', 'ru'));
			}, function () {
				self.uciLoadState.sheepfold = false;
				return deps.i18n.installApplicationTranslator('ru');
			}).then(function () {
				return Promise.all([
					uci.load('wireless').then(function () { self.uciLoadState.wireless = true; }, function () { self.uciLoadState.wireless = false; }),
					uci.load('system').then(function () { self.uciLoadState.system = true; }, function () { self.uciLoadState.system = false; }),
					uci.load('dhcp'),
					loadRootPasswordStatus(),
					deps.siteListStatus.load().catch(function () { return null; })
				]);
			}).then(function () {
				return Promise.all([
					deps.devices.readNow(),
					deps.fs.read(logPath()).catch(function () { return ''; })
				]);
			}).then(function (values) {
				deps.administrators.load();
				deps.emergency.load(deps.sections('sheepfold', deps.emergencySectionType), false);
				deps.logPanel.setText(values[1]);
			});
		},

		openUserListMetric: function (button, tab) {
			var page = button.closest('.sf-page');
			var top = page.querySelector('[data-tab="users"]');
			var child;
			if (top)
				switchTop(top, 'users');
			child = page.querySelector('[data-user-list-tab="' + tab + '"]');
			if (child)
				switchUserList(child, tab);
		},

		renderUserListPanel: function (tab, content) {
			return E('div', {
				'class': 'sf-user-list-panel sf-settings-panel',
				'data-user-list-panel': tab,
				'hidden': deps.navigation.snapshot().activeUserListTab === tab ? null : 'hidden'
			}, content);
		},

		renderDevices: function (embedded) { return deps.devices.renderDevices(embedded); },
		renderAllowlist: function (embedded) { return deps.devices.renderAllowlist(embedded); },
		renderBlocklist: function (embedded) { return deps.devices.renderBlocklist(embedded); },
		renderSchedules: function (embedded) { return deps.schedules.render(embedded); },
		renderGroups: function (embedded) { return deps.groups.render(embedded); },
		renderAdmins: function (embedded) { return deps.administrators.render(embedded); },
		renderSettings: function () { return deps.settings.render(); },

		renderManagementPanel: function (tab, content) {
			return E('div', {
				'class': 'sf-management-panel sf-settings-panel',
				'data-management-panel': tab,
				'hidden': deps.navigation.snapshot().activeManagementTab === tab ? null : 'hidden'
			}, content);
		},

		renderUsers: function () {
			var active = deps.navigation.snapshot().activeUserListTab;
			return E('div', { 'class': 'sf-panel' }, [
				tabs(deps.navigationModel.userListTabs(), active, 'sf-user-list-tabs', 'user-list-tab', switchUserList),
				this.renderUserListPanel('devices', this.renderDevices(true)),
				this.renderUserListPanel('allowlist', this.renderAllowlist(true)),
				this.renderUserListPanel('blocklist', this.renderBlocklist(true))
			]);
		},

		renderManagement: function () {
			var active = deps.navigation.snapshot().activeManagementTab;
			return E('div', { 'class': 'sf-panel' }, [
				tabs(deps.navigationModel.managementTabs(), active, 'sf-user-list-tabs sf-management-tabs', 'management-tab', switchManagement),
				this.renderManagementPanel('schedules', this.renderSchedules(true)),
				this.renderManagementPanel('groups', this.renderGroups(true)),
				this.renderManagementPanel('admins', this.renderAdmins(true))
			]);
		},

		renderDonation: function () {
			return E('div', { 'class': 'sf-panel' }, [
				E('div', { 'class': 'sf-panel-head' }, E('div', {}, E('p', {}, _('Support the project')))),
				E('div', { 'class': 'sf-flat-form' }, [
					E('p', {}, _('If Sheepfold becomes useful and you want to support development, donation links will be added here before the first public release.')),
					E('p', {}, _('Possible options:')),
					E('ul', {}, [
						E('li', {}, _('GitHub Sponsors for international audience;')),
						E('li', {}, _('Boosty or YooMoney for Russian-speaking users.'))
					])
				])
			]);
		},

		renderPanel: function (tab, content) {
			return E('section', {
				'class': 'sf-tab-panel',
				'data-tab': tab,
				'hidden': deps.navigation.snapshot().activeTab === tab ? null : 'hidden'
			}, content);
		},

		render: function () {
			var params = deepLinkParams();
			var state;
			var devices = deps.devices.devices();
			var blocked;
			var assetVersion = deps.get('sheepfold', 'global', 'ui_asset_version', '0.1.0');
			var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);
			var page;
			var self = this;

			deps.navigation.applyDeepLink(params);
			state = deps.navigation.snapshot();
			blocked = currentBlocked();
			deps.store.setActiveView(this);
			if (deps.get('sheepfold', 'global', 'router_led_control', 'router_default') === 'new_device_alert_until_luci_login')
				deps.fs.write('/tmp/sheepfold/new-device-alert.ack', 'luci\n').catch(function () { return null; });

			var header = E('div', { 'class': 'sf-header' }, [
				E('div', {}, [
					E('h2', {}, _('Sheepfold Family Internet Control')),
					E('p', {}, _("Manage family devices' internet access through this OpenWRT router."))
				]),
				E('div', { 'class': 'sf-header-actions' }, [
					internetButton(_('Internet enabled'), 'positive', false, blocked),
					internetButton(_('Internet disabled'), 'danger', true, blocked)
				])
			]);

			if (!deps.store.rootPassword().set) {
				return E('div', { 'class': 'sf-page' }, [
					E('link', { 'rel': 'stylesheet', 'href': cssHref }),
					header,
					renderRootPasswordGate()
				]);
			}

			page = E('div', { 'class': 'sf-page' }, [
				E('link', { 'rel': 'stylesheet', 'href': cssHref }),
				deps.tableStylesheet(assetVersion),
				header,
				E('div', { 'class': 'sf-metrics' }, [
					metric(_('Devices'), String(devices.length), 'neutral', 'devices', function (button) { self.openUserListMetric(button, 'devices'); }),
					metric(_('Allowlist'), String(devices.filter(function (device) { return device.status === 'allow'; }).length), 'positive', 'allowlist', function (button) { self.openUserListMetric(button, 'allowlist'); }),
					metric(_('Restricted'), String(devices.filter(function (device) { return device.status === 'restricted' || device.status === 'scheduled'; }).length), 'warning', 'restricted', function (button) { self.openUserListMetric(button, 'devices'); }),
					metric(_('Blocklist'), String(devices.filter(function (device) { return device.status === 'blocked'; }).length), 'danger', 'blocklist', function (button) { self.openUserListMetric(button, 'blocklist'); })
				]),
				tabs(deps.navigationModel.topTabs(), state.activeTab, '', 'tab', switchTop),
				E('div', { 'class': 'sf-panels' }, [
					this.renderPanel('users', this.renderUsers()),
					this.renderPanel('management', this.renderManagement()),
					this.renderPanel('wifi', deps.wifi.render()),
					this.renderPanel('logs', deps.logPanel.render()),
					this.renderPanel('settings', this.renderSettings()),
					this.renderPanel('donation', this.renderDonation())
				])
			]);

			if (!this.deepLinkHandled && params && params.get('view') === 'admins' && params.get('action') === 'pair') {
				var admin = deps.administrators.byDeepLink(params.get('admin'));
				if (admin) {
					this.deepLinkHandled = true;
					window.setTimeout(function () { deps.administrators.showSettings(admin); }, 0);
				}
			}
			return page;
		}
	});

	return shell;
}

return baseclass.extend({ create: create });
