'use strict';
'require view';
'require ui';
'require uci';
'require fs';
'require sheepfold.i18n as sheepfoldI18n';
'require sheepfold.core.backend.router as routerBackend';
'require sheepfold.core.security.random as secureRandom';
'require sheepfold.features.administrators.model as administratorModel';
'require sheepfold.features.administrators.view as administratorView';
'require sheepfold.features.devices.access-lists as deviceAccessLists';
'require sheepfold.features.devices.inventory as deviceInventory';
'require sheepfold.features.devices.selection as deviceSelection';
'require sheepfold.features.devices.table as deviceTableModel';
'require sheepfold.features.devices.types as deviceTypes';
'require sheepfold.features.emergency.sites as emergencySiteModel';
'require sheepfold.features.feedback.panel as feedbackPanel';
'require sheepfold.features.groups.model as groupModel';
'require sheepfold.features.groups.view as groupView';
'require sheepfold.features.logs.model as logModel';
'require sheepfold.features.messenger.settings as messengerSettings';
'require sheepfold.features.pairing.qr as pairingQr';
'require sheepfold.features.router.info as routerInfo';
'require sheepfold.features.router.maintenance as routerMaintenance';
'require sheepfold.features.schedules.model as scheduleModel';
'require sheepfold.features.schedules.view as scheduleView';
'require sheepfold.features.settings.backup as settingsBackupModel';
'require sheepfold.features.settings.draft as settingsDraftModel';
'require sheepfold.features.sites.status as siteListStatus';
'require sheepfold.features.wifi.cards as wifiCards';
'require sheepfold.features.wifi.payload as wifiPayload';
'require sheepfold.shared.forms as sharedForms';
'require sheepfold.shared.icons as sharedIcons';

var devices = [];
var NOT_CONFIGURED_GROUP = 'Not configured';
var defaultLogCachePath = '/tmp/sheepfold/events.log';
var defaultSiteAllowlistSources = [
	'UT1 child | https://dsi.ut-capitole.fr/blacklists/download/child.tar.gz'
].join('\n');
var defaultSiteBlocklistSources = [
	'HaGeZi NSFW | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/nsfw.txt',
	'HaGeZi Gambling mini | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/gambling.mini.txt',
	'HaGeZi Threat Intelligence mini | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.mini.txt',
	'URLhaus malware domains | https://urlhaus.abuse.ch/downloads/hostfile/'
].join('\n');
// Это целевая схема будущего настраиваемого порядка. Аварийно-полезные домены
// остаются отдельным исключением, а ручной blocklist всегда сильнее автоматики. §84azytj
var accessSteps = [
        ['blocklist', 'Blocklist'],
        ['admin_devices', 'Admin devices'],
        ['no_restrictions', 'No restrictions group'],
        ['allowlist', 'Allowlist'],
        ['global_block', 'Global internet block'],
        ['temp_access', 'Temporary access'],
        ['device_schedule', 'Device schedule'],
        ['group_schedule', 'Group schedule'],
        ['default_access', 'Default access']
];
var defaultOrder = accessSteps.map(function (item) { return item[0]; });

var emergencySites = [];
var savedEmergencySites = [];

var admins = [
        {
                id: '1',
                name: 'Родитель',
                login: 'SuperParent',
                role: 'owner',
                deviceIds: []
        }
];

var logEntries = [];
var logViewFilters = {
        from: '',
        to: '',
        ip: '',
        mac: '',
        deviceName: '',
        phrase: ''
};
var wifiNetworkEditors = [];
var wifiIsSaving = false;
var activeOverviewView = null;

// Проверка выполняется backend-ом по /etc/shadow. До ответа работаем fail-closed:
// настройки семейного контроля не должны открываться на роутере без root-пароля.
var rootPasswordIsSet = false;
var rootPasswordCheckFailed = false;
// Настройки на этой странице сначала живут в черновике, а не сразу пишутся в UCI.
// Так родитель явно нажимает "Сохранить", получает одно понятное уведомление,
// а LuCI не копит неожиданную плашку "не принятые изменения" после каждого select/input.
var settingsDraft = settingsDraftModel.create(updateSettingsSaveButtons);
var tabs = [
        ['users', 'User lists'],
        ['management', 'User management'],
        ['wifi', 'Wi-Fi'],
        ['logs', 'Logs'],
        ['settings', 'Settings'],
        ['donation', 'Donation']
];

var settingsTabsPrimary = [
        ['info', 'Information'],
        ['general', 'General'],
        ['integrations', 'Integrations'],
        ['messenger', 'Messenger'],
        ['emergency', 'Emergency-useful sites'],
        ['misc', 'Misc'],
        ['feedback', 'Feedback / suggestions']
];

var settingsTabsSecondary = [
        /* SHEEPFOLD_AI_BEGIN */
        ['ai', 'AI assistant'],
        /* SHEEPFOLD_AI_END */
        ['storage', 'Router memory management']
];

function isKnownSettingsTab(tab) {
        return settingsTabsPrimary.some(function (item) { return item[0] === tab; }) ||
                settingsTabsSecondary.some(function (item) { return item[0] === tab; });
}

var userListTabs = [
        ['devices', 'All devices'],
        ['allowlist', 'Allowlist'],
        ['blocklist', 'Blocklist']
];

var managementTabs = [
        ['schedules', 'Schedules'],
        ['groups', 'Groups'],
        ['admins', 'Administrators']
];

function notify(message, level) {
        ui.addNotification(null, E('p', {}, message), level || 'info');
}

function notifyCentered(message) {
        var toast = E('div', { 'class': 'sf-centered-toast' }, message);

        document.body.appendChild(toast);
        window.setTimeout(function () {
                toast.classList.add('sf-centered-toast-hide');
        }, 1800);
        window.setTimeout(function () {
                if (toast.parentNode)
                        toast.parentNode.removeChild(toast);
        }, 2400);
}

function logCachePath() {
        return safeUciGet('sheepfold', 'global', 'log_cache_path', defaultLogCachePath) || defaultLogCachePath;
}

function validRamCachePath(path) {
        return /^\/tmp\/[A-Za-z0-9_./-]+$/.test(path || '') && path.indexOf('..') === -1 && path.charAt(path.length - 1) !== '/';
}

function resetSettingsDraft() {
        settingsDraft.reset();
}

function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
}

function settingValue(option, defaultValue) {
        return settingsDraft.has(option) ?
                settingsDraft.get(option) :
                safeUciGet('sheepfold', 'global', option, defaultValue || '');
}

function updateSettingsSaveButtons() {
        var dirty = settingsDraft.isDirty();

        document.querySelectorAll('[data-settings-save]').forEach(function (button) {
                button.disabled = settingsDraft.isSaving() ? true : null;
                button.classList.toggle('sf-action-muted', !dirty);
        });

        document.querySelectorAll('[data-settings-dirty-note]').forEach(function (node) {
                node.hidden = dirty ? null : 'hidden';
        });
}

function markSettingsDraftChanged() {
        updateSettingsSaveButtons();
}

function setSettingsDraftOption(option, value) {
        settingsDraft.set(option, value);
}

function setSettingsDraftSectionOption(section, option, value) {
        settingsDraft.setSection(section, option, value);
}

function sectionSettingValue(section, option, defaultValue) {
        var key = section + '.' + option;

        if (settingsDraft.has(key))
                return settingsDraft.get(key);

        return safeUciGet('sheepfold', section, option, defaultValue || '');
}

function setSettingsDraftOptions(options) {
        settingsDraft.setMany(options);
}

function registerSettingsSpecialSaver(saver) {
        settingsDraft.registerSaver(saver);
}

function sameObjectValues(left, right) {
        return settingsDraftModel.sameValues(left, right);
}

function appDiscoveryJson(port) {
        return JSON.stringify({
                service: 'sheepfold',
                name: 'Sheepfold Family Internet Control',
                routerName: 'OpenWRT Sheepfold',
                appPort: String(port),
                apiPath: '/cgi-bin/sheepfold-api',
                apiBase: '/cgi-bin/sheepfold-api',
                version: safeUciGet('sheepfold', 'global', 'ui_asset_version', '0.1.0')
        }, null, 2) + '\n';
}

function validateSettingsDraft(options) {
        var portNumber;

        if (hasOwn(options, 'log_cache_path') && !validRamCachePath(options.log_cache_path))
                throw new Error(_('Cache file path must start with /tmp/ and contain only letters, numbers, dot, slash, underscore, and hyphen.'));

        if (hasOwn(options, 'app_port')) {
                portNumber = parseInt(options.app_port, 10);
                if (!options.app_port || String(portNumber) !== String(options.app_port) || portNumber < 1 || portNumber > 65535)
                        throw new Error(_('Enter a port from 1 to 65535.'));
        }

        if (hasOwn(options, 'usb.device') && options['usb.device'] && !/^\/dev\/[A-Za-z0-9._-]+$/.test(options['usb.device']))
                throw new Error(_('USB partition device path') + ': /dev/...');

        /* SHEEPFOLD_AI_BEGIN */
        if (hasOwn(options, 'ai_rate_limit_requests')) {
                portNumber = parseInt(options.ai_rate_limit_requests, 10);
                if (!options.ai_rate_limit_requests || String(portNumber) !== String(options.ai_rate_limit_requests) || portNumber < 1 || portNumber > 1000)
                        throw new Error(_('Requests per device') + ': 1–1000');
        }

        if (hasOwn(options, 'ai_rate_limit_window_seconds')) {
                portNumber = parseInt(options.ai_rate_limit_window_seconds, 10);
                if (!options.ai_rate_limit_window_seconds || String(portNumber) !== String(options.ai_rate_limit_window_seconds) || portNumber < 60 || portNumber > 86400)
                        throw new Error(_('Rate limit window, seconds') + ': 60–86400');
        }
        /* SHEEPFOLD_AI_END */

        if (hasOwn(options, 'access_priority') &&
                normalizeAccessOrder(options.access_priority).join(' ') !== String(options.access_priority).trim())
                throw new Error(_('Access priority contains an unknown or duplicate rule.'));
}

function applySettingsSideEffects(options) {
        var chain = Promise.resolve();

        if (hasOwn(options, 'site_lists_update_interval'))
                chain = chain.then(function () {
                        return routerControl(['site-lists-cron-apply']);
                });

        if (hasOwn(options, 'site_blocklist_mode') ||
                hasOwn(options, 'site_allowlist_sources') ||
                hasOwn(options, 'site_blocklist_sources') ||
                hasOwn(options, 'integration_mode'))
				chain = chain.then(function () {
					return routerControl(['site-lists-apply']).then(function (result) {
						ensureRouterControlOk(result, _('Could not apply site list policy.'));
						return siteListStatus.load(true).catch(function () { return null; });
					});
				});

        if (hasOwn(options, 'router_led_control'))
                chain = chain.then(function () {
                        return routerControl(['led-apply']);
                });

        if (hasOwn(options, 'schedule_conflict_internet'))
                chain = chain.then(function () {
                        return routerControl(['schedule-sync']);
                });

        if (hasOwn(options, 'new_device_policy'))
                chain = chain.then(function () {
                        return routerControl(['schedule-sync']);
                });

        if (hasOwn(options, 'domain_allowlist_for_blocklist') && !emergencySitesChanged())
                chain = chain.then(function () {
                        return routerControl(['emergency-sites-apply']);
                });

        if (hasOwn(options, 'app_port'))
                chain = chain.then(function () {
                        return fs.write('/www/.well-known/sheepfold.json', appDiscoveryJson(options.app_port)).catch(function () {});
                }).then(function () {
                        return fs.exec('/etc/init.d/sheepfold', ['restart']).catch(function () {});
                });

        /* SHEEPFOLD_AI_BEGIN */
        if (hasOwn(options, 'ai_individual_logs') && options.ai_individual_logs === '1')
                chain = chain.then(function () {
                        return fs.exec('/usr/libexec/sheepfold/sheepfold-openssl-ensure', []).then(function (result) {
                                if (result.code !== 0)
                                        throw new Error(_('OpenSSL check failed. Per-device AI logs stay disabled.'));
                        });
                });
        /* SHEEPFOLD_AI_END */

        if (hasOwn(options, 'language'))
                chain = chain.then(function () {
                        return new Promise(function (resolve) {
                                window.setTimeout(function () {
                                        window.location.reload();
                                        resolve();
                                }, 600);
                        });
                });

        return chain;
}

function saveSettingsNow() {
        var options = settingsDraft.snapshot();
        var specialSavers = settingsDraft.dirtySavers();

        if (!Object.keys(options).length && !specialSavers.length) {
                notify(_('No settings changes to save.'), 'info');
                return Promise.resolve();
        }

        try {
                validateSettingsDraft(options);
        } catch (error) {
                notify(error.message, 'warning');
                return Promise.reject(error);
        }

        settingsDraft.setSaving(true);
        updateSettingsSaveButtons();

        // Сначала сохраняем простые option из вкладок настроек, затем выполняем side effects
        // вроде перезапуска локального API-порта. В обратном порядке UI мог бы показать
        // успешное сохранение, хотя сервис ещё читает старую конфигурацию.
        return saveGlobalOptions(options).then(function () {
                return applySettingsSideEffects(options);
        }).then(function () {
                var chain = Promise.resolve();

                specialSavers.forEach(function (saver) {
                        chain = chain.then(function () {
                                return saver.save();
                        });
                });

                return chain;
        }).then(function () {
                settingsDraft.clearOptions();
                specialSavers.forEach(function (saver) {
                        if (saver.accept)
                                saver.accept();
                });
                notifyCentered(_('Settings saved successfully.'));
        }, function (error) {
                notify(_('Could not save settings.') + ' ' + commandErrorText(error, ''), 'warning');
                return Promise.reject(error);
        }).finally(function () {
                settingsDraft.setSaving(false);
                updateSettingsSaveButtons();
        });
}

function settingsSaveBar(top) {
        return E('div', { 'class': 'sf-settings-save-bar' + (top ? ' sf-settings-save-bar-top' : '') }, [
                E('span', {
                        'class': 'sf-settings-dirty-note',
                        'data-settings-dirty-note': '1',
                        'hidden': 'hidden'
                }, _('Settings have unsaved changes. Press Save to apply them.')),
                E('button', {
                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                        'data-settings-save': '1',
                        'click': function (ev) {
                                var mode;
                                var time;

                                ev.preventDefault();

                                mode = settingsDraft.has('wifi_auto_disable_mode') ?
                                        settingsDraft.get('wifi_auto_disable_mode') :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_mode', 'never');
                                time = settingsDraft.has('wifi_auto_disable_time') ?
                                        settingsDraft.get('wifi_auto_disable_time') :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_time', '23:00');

                                if ((settingsDraft.has('wifi_auto_disable_mode') || settingsDraft.has('wifi_auto_disable_time')) && mode === 'time') {
                                        confirmWifiAutoDisable(time).then(function (confirmed) {
                                                if (confirmed)
                                                        saveSettingsNow();
                                        });
                                        return;
                                }

                                saveSettingsNow();
                        }
                }, _('Save settings'))
        ]);
}

function acknowledgeNewDeviceLedAlert(source) {
        if (safeUciGet('sheepfold', 'global', 'router_led_control', 'router_default') !== 'new_device_alert_until_luci_login')
                return;

        fs.write('/tmp/sheepfold/new-device-alert.ack', String(source || 'luci') + '\n').catch(function () {});
}

var NEW_DEVICE_BADGE_SECONDS = 86400;

function badge(status) {
        var labels = {
                allow: _('Allowlist'),
                blocked: _('Blocklist'),
                scheduled: _('Scheduled'),
                restricted: _('Restricted'),
                new: _('New'),
                journal: _('Journal')
        };

        return E('span', { 'class': 'sf-badge sf-badge-' + status }, labels[status] || status);
}

function deviceFirstSeenAt(configured) {
        var firstSeen = configured && configured.first_seen_at ? parseInt(configured.first_seen_at, 10) : 0;

        if (firstSeen > 0)
                return firstSeen;

        if (configured && configured.detection_updated_at)
                return parseInt(configured.detection_updated_at, 10) || 0;

        return 0;
}

function deviceShowsNewBadge(configured, status) {
        if (status !== 'new')
                return false;

        var firstSeen = deviceFirstSeenAt(configured);

        if (!firstSeen)
                return true;

        return (Math.floor(Date.now() / 1000) - firstSeen) < NEW_DEVICE_BADGE_SECONDS;
}

function deviceStatusBadge(status, configured) {
        if (status === 'allow' || status === 'blocked' || status === 'scheduled' || status === 'restricted')
                return status;

        return deviceShowsNewBadge(configured, status) ? 'new' : '';
}

function metric(label, value, tone, handler, key) {
        return E('button', {
                'class': 'sf-metric sf-metric-' + tone,
                'data-metric': key || '',
                'click': function (ev) {
                        ev.preventDefault();
                        if (handler)
                                handler(ev.currentTarget);
                }
        }, [
                E('span', {}, label),
                E('strong', {}, value)
        ]);
}

function refreshUserListsWithoutPageReload() {
        var page = document.querySelector('.sf-page');
        var panelDefinitions;

        if (!page || !activeOverviewView)
                return;

        panelDefinitions = {
                devices: activeOverviewView.renderDevices(true),
                allowlist: activeOverviewView.renderAllowlist(true),
                blocklist: activeOverviewView.renderBlocklist(true)
        };

        Object.keys(panelDefinitions).forEach(function (tab) {
                var current = page.querySelector('[data-user-list-panel="' + tab + '"]');
                var replacement;

                if (!current)
                        return;

                replacement = activeOverviewView.renderUserListPanel(tab, panelDefinitions[tab]);
                current.replaceWith(replacement);
        });

        [
                ['devices', devices.length],
                ['allowlist', devices.filter(function (device) { return device.status === 'allow'; }).length],
                ['blocklist', devices.filter(function (device) { return device.status === 'blocked'; }).length],
                ['restricted', devices.filter(function (device) {
                        return device.status === 'restricted' || device.status === 'scheduled';
                }).length]
        ].forEach(function (item) {
                var value = page.querySelector('[data-metric="' + item[0] + '"] strong');
                if (value)
                        value.textContent = String(item[1]);
        });
}

function actionButton(label, tone, message) {
        return E('button', {
                'class': 'sf-action sf-action-' + tone,
                'click': function (ev) {
                        ev.preventDefault();
                        notify(message || _('This action is a visual prototype only.'), tone === 'danger' ? 'warning' : 'info');
                }
        }, label);
}

function routerControl(args) {
        return routerBackend.run(args);
}

function loadRootPasswordStatus() {
        return routerControl(['root-password-status']).then(function (result) {
                var status = String(result && result.stdout || '').trim();

                rootPasswordIsSet = status === 'set';
                rootPasswordCheckFailed = status !== 'set' && status !== 'unset';
        }).catch(function () {
                rootPasswordIsSet = false;
                rootPasswordCheckFailed = true;
        });
}

function ensureRouterControlOk(result, fallback) {
        return routerBackend.ensureOk(result, fallback || _('Action failed.'));
}

function parseKeyValueOutput(text) {
        return routerBackend.parseKeyValues(text);
}

function commandErrorText(error, fallback) {
        return routerBackend.errorText(error, fallback || _('Action failed.'));
}

function formatPingMs(value) {
        return routerInfo.formatPingMs(value);
}

function formatInternetProbeLine(host, pingMs) {
        return routerInfo.probeLine(host, pingMs);
}

function internetStatusDetails(values) {
        return routerInfo.internetDetails(values);
}

function routerInfoHasData(values) {
        return routerInfo.hasData(values);
}

function routerControlWithTimeout(args, timeoutMs) {
        return routerBackend.withTimeout(args, timeoutMs, _('Router command timed out.'));
}

function loadRouterInformation(force) {
        return routerInfo.load(force);
}

function rebootRouterButton() {
        return routerMaintenance.rebootButton(notify);
}

function updateAppButton() {
        return routerMaintenance.updateButton(notify);
}

function updateVersionStatusText(version, status) {
        return routerMaintenance.versionStatusText(version, status);
}

function updateAppRow() {
        return routerMaintenance.updateRow(notify);
}

function infoValue(value, fallback) {
        return routerInfo.infoValue(value, fallback);
}

function translatedStatus(value) {
        return routerInfo.translatedStatus(value);
}

function packageVersionStatusLabel(status) {
        return routerInfo.packageStatus(status);
}

function formatInstalledPackageInfo(installed, version, versionStatus) {
        return routerInfo.packageInfo(installed, version, versionStatus);
}

function informationRow(label, value) {
        return routerInfo.row(label, value);
}

function renderWifiModulesInfo(values) {
        return routerInfo.wifiModules(values);
}

function renderRouterInfoContent(body, values) {
        return routerInfo.renderContent(body, values);
}

function routerInfoLoadingSpinner() {
        return routerInfo.spinner();
}

function paintRouterInformationPanel(body, refreshButton) {
        return routerInfo.paint(body, refreshButton);
}

function routerInformationPanel() {
        return routerInfo.panel();
}

function maskLogMessage(message) {
        return logModel.maskMessage(message);
}

function parseRamLog(text) {
        return logModel.parse(text);
}

function renderLogRows(entries) {
        entries = entries || filterLogEntriesForView(logViewFilters);

        if (!entries.length)
                return [E('div', { 'class': 'sf-log-empty' }, logEntries.length ? _('No log entries match the current filters.') : _('Log is empty.'))];

        // Файл журнала остаётся append-only в естественном порядке для экспорта и отладки,
        // а в интерфейсе новые события показываем сверху, чтобы родитель сразу видел последнее.
        return entries.slice().reverse().map(function (entry) {
                return E('div', {}, [
                        E('time', {}, entry.time),
                        E('span', {}, _(entry.message))
                ]);
        });
}

function maskedLogExportText() {
        return maskedLogExportTextForEntries(logEntries);
}

function parseLogTime(value) {
        return logModel.parseTime(value);
}

function filterLogEntriesByPeriod(period, fromValue, toValue) {
        return logModel.byPeriod(logEntries, period, fromValue, toValue);
}

function logMessagePhraseOptions() {
        return logModel.phraseOptions();
}

function logEntryMatchesPhrase(entry, phraseKey) {
        return logModel.matchesPhrase(entry, phraseKey);
}

function logEntryMatchesNeedle(entry, needle, kind) {
        return logModel.matchesNeedle(entry, needle, kind);
}

function filterLogEntriesForView(filters) {
        return logModel.filterView(logEntries, filters || logViewFilters);
}

function renderLogFilterControls(onChange) {
        var fromField = inputControl(_('From'), logViewFilters.from, { 'type': 'datetime-local' });
        var toField = inputControl(_('To'), logViewFilters.to, { 'type': 'datetime-local' });
        var ipField = inputControl(_('IP address'), logViewFilters.ip);
        var macField = inputControl(_('MAC address'), logViewFilters.mac);
        var deviceField = inputControl(_('Device name'), logViewFilters.deviceName);
        var phraseField = selectControl(_('Message type'), logViewFilters.phrase, logMessagePhraseOptions());

        function syncFilters() {
                logViewFilters.from = fromField.input.value;
                logViewFilters.to = toField.input.value;
                logViewFilters.ip = ipField.input.value.trim();
                logViewFilters.mac = macField.input.value.trim();
                logViewFilters.deviceName = deviceField.input.value.trim();
                logViewFilters.phrase = phraseField.input.value;
                onChange();
        }

        [fromField, toField, ipField, macField, deviceField, phraseField].forEach(function (field) {
                field.input.addEventListener('change', syncFilters);
                field.input.addEventListener('input', syncFilters);
        });

        return E('div', { 'class': 'sf-log-filters' }, [
                fromField.node,
                toField.node,
                ipField.node,
                macField.node,
                deviceField.node,
                phraseField.node,
                E('div', { 'class': 'sf-log-filter-actions' }, [
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        logViewFilters = {
                                                from: '',
                                                to: '',
                                                ip: '',
                                                mac: '',
                                                deviceName: '',
                                                phrase: ''
                                        };
                                        fromField.input.value = '';
                                        toField.input.value = '';
                                        ipField.input.value = '';
                                        macField.input.value = '';
                                        deviceField.input.value = '';
                                        phraseField.input.value = '';
                                        onChange();
                                }
                        }, _('Reset filters'))
                ])
        ]);
}

function createLogFilterUi(onChange) {
        var expanded = false;
        var filtersWrap = E('div', {
                'class': 'sf-log-filters-wrap',
                'hidden': 'hidden'
        }, renderLogFilterControls(onChange));
        var toggleButton = E('button', {
                'class': 'sf-action sf-action-neutral',
                'click': function (ev) {
                        ev.preventDefault();
                        expanded = !expanded;
                        filtersWrap.hidden = expanded ? null : 'hidden';
                        toggleButton.classList.toggle('sf-action-positive', expanded);
                }
        }, _('Filter'));

        return {
                toggleButton: toggleButton,
                filtersWrap: filtersWrap
        };
}

function maskedLogExportTextForEntries(entries) {
        return logModel.maskedExport(entries);
}

function showLogExportModal() {
        var periodField = selectControl(_('Export period'), 'week', [
                ['hour', _('Last hour')],
                ['week', _('Last week')],
                ['custom', _('Custom period')],
                ['all', _('All time')]
        ]);
        var fromField = inputControl(_('From'), '', { 'type': 'datetime-local' });
        var toField = inputControl(_('To'), '', { 'type': 'datetime-local' });
        var customRange = E('div', { 'class': 'sf-grid two', 'hidden': 'hidden' }, [
                fromField.node,
                toField.node
        ]);

        function updateRangeVisibility() {
                customRange.hidden = periodField.input.value === 'custom' ? null : 'hidden';
        }

        periodField.input.addEventListener('change', updateRangeVisibility);
        updateRangeVisibility();

        ui.showModal(_('Export log'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        periodField.node,
                        customRange
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var period = periodField.input.value;
                                        var entries = filterLogEntriesByPeriod(period, fromField.input.value, toField.input.value);
                                        var stamp = new Date().toISOString().replace(/[:.]/g, '-');

                                        if (!entries.length)
                                                notify(_('No log entries for selected period.'), 'warning');

                                        downloadTextFile('sheepfold-log-masked-' + period + '-' + stamp + '.txt', maskedLogExportTextForEntries(entries));
                                        notify(_('Masked log export has been saved.'), 'info');
                                        ui.hideModal();
                                }
                        }, _('Export selected period'))
                ])
        ]);
}

function downloadTextFile(filename, text) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.setTimeout(function () {
                window.URL.revokeObjectURL(url);
        }, 0);
}

function backupSectionsByConfig() {
        return {
                sheepfold: safeUciSections('sheepfold'),
                dhcp: safeUciSections('dhcp', 'host'),
                wireless: safeUciSections('wireless').filter(function (section) {
                        return section['.type'] === 'wifi-device' || section['.type'] === 'wifi-iface';
                })
        };
}

function sheepfoldSettingsPayload(includeSecrets) {
        return settingsBackupModel.build(backupSectionsByConfig(), includeSecrets, new Date().toISOString());
}

function sheepfoldSettingsExportText(includeSecrets) {
        return JSON.stringify(sheepfoldSettingsPayload(!!includeSecrets), null, 2) + '\n';
}

function backupErrorMessage(error) {
        var code = error && error.message || '';

        if (code === 'password_too_short')
                return _('Use at least 12 characters for the backup password.');
        if (code === 'conflicting_device_lists')
                return _('The backup contains a device in both the allowlist and the blocklist.');
        if (code === 'global_section_missing' || code === 'required_lists_missing')
                return _('The backup does not contain the required Sheepfold sections.');
        if (code === 'encryption_unavailable')
                return _('This browser cannot create or open an encrypted backup.');
        if (code === 'unencrypted_secrets_forbidden')
                return _('A backup containing passwords or tokens must be encrypted.');
        if (/^(invalid_|duplicate_|too_many_|option_value_|named_section_)/.test(code))
                return _('Import file format is not recognized.');
        return _('Could not import settings. The previous settings were kept.');
}

function exportSafeSettings() {
        var stamp = new Date().toISOString().replace(/[:.]/g, '-');

        downloadTextFile('sheepfold-settings-' + stamp + '.json', sheepfoldSettingsExportText(false));
        notify(_('Settings export saved.'), 'info');
}

function showEncryptedSettingsExport() {
        var password = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'new-password' });
        var repeat = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'new-password' });
        var status = E('p', { 'class': 'sf-muted' });
        var saveButton;

        saveButton = E('button', {
                'class': 'btn cbi-button cbi-button-positive',
                'click': function () {
                        var stamp;

                        if (password.value.length < 12) {
                                status.textContent = _('Use at least 12 characters for the backup password.');
                                return;
                        }
                        if (password.value !== repeat.value) {
                                status.textContent = _('Backup passwords do not match.');
                                return;
                        }

                        saveButton.disabled = true;
                        status.textContent = _('Encrypting backup...');
                        settingsBackupModel.encrypt(sheepfoldSettingsPayload(true), password.value).then(function (envelope) {
                                stamp = new Date().toISOString().replace(/[:.]/g, '-');
                                downloadTextFile('sheepfold-full-backup-' + stamp + '.json', JSON.stringify(envelope, null, 2) + '\n');
                                password.value = '';
                                repeat.value = '';
                                ui.hideModal();
                                notify(_('Encrypted full backup saved.'), 'info');
                        }, function (error) {
                                saveButton.disabled = false;
                                status.textContent = backupErrorMessage(error);
                        });
                }
        }, _('Create encrypted backup'));

        ui.showModal(_('Encrypted full backup'), [
                E('p', {}, _('This backup contains passwords and tokens. Keep the file and its password separately. Without the password, the backup cannot be restored.')),
                E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Backup password')), password]),
                E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Repeat backup password')), repeat]),
                status,
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
                        saveButton
                ])
        ]);
}

function exportSettingsAndUsers() {
        if (settingValue('export_mode', 'safe') === 'encrypted')
                showEncryptedSettingsExport();
        else
                exportSafeSettings();
}

function importedSectionByName(sections, name) {
        return (sections || []).filter(function (section) { return section.name === name; })[0] || null;
}

function stageImportedConfig(config, importedSections, currentSections, managedTypes) {
        var existingSections = safeUciSections(config);
        var importedByName = Object.create(null);

        importedSections.forEach(function (section) { importedByName[section.name] = section; });
        existingSections.forEach(function (section) {
                var managed = !managedTypes || managedTypes.indexOf(section['.type']) !== -1;
                var imported = importedByName[section['.name']];

                if (managed && (!imported || imported.type !== section['.type']))
                        uci.remove(config, section['.name']);
        });

        importedSections.forEach(function (section) {
                var existing = existingSections.filter(function (candidate) {
                        return candidate['.name'] === section.name && candidate['.type'] === section.type;
                })[0];
                var previous = importedSectionByName(currentSections, section.name);
                var actualName = section.name;

                if (!existing) {
                        actualName = uci.add(config, section.type, section.name) || section.name;
                        if (actualName !== section.name)
                                throw new Error('named_section_not_supported');
                } else {
                        Object.keys(existing).forEach(function (option) {
                                if (option.charAt(0) !== '.')
                                        uci.unset(config, actualName, option);
                        });
                }

                Object.keys(section.options).forEach(function (option) {
                        var value = section.options[option];

                        // Обычный JSON не содержит секретов. На том же роутере берём их
                        // из снимка до импорта, а на новом оставляем поле ненастроенным.
                        if (value === settingsBackupModel.secretPlaceholder) {
                                if (!previous || !Object.prototype.hasOwnProperty.call(previous.options, option))
                                        return;
                                value = previous.options[option];
                        }
                        uci.set(config, actualName, option, value);
                });
        });
}

function stageImportedPayload(payload, previousPayload) {
        stageImportedConfig('sheepfold', payload.configs.sheepfold, previousPayload.configs.sheepfold, null);
        stageImportedConfig('dhcp', payload.configs.dhcp, previousPayload.configs.dhcp, ['host']);
        stageImportedConfig('wireless', payload.configs.wireless, previousPayload.configs.wireless, ['wifi-device', 'wifi-iface']);
}

function applyImportedPayload(payload) {
        var previous = settingsBackupModel.validate(sheepfoldSettingsPayload(true));
        var originalError;

        try {
                stageImportedPayload(payload, previous);
        } catch (error) {
                try { stageImportedPayload(previous, previous); } catch (ignored) { /* Состояние ещё не сохранено. */ }
                return Promise.reject(error);
        }

        return saveUciChanges(['sheepfold', 'dhcp', 'wireless']).catch(function (error) {
                originalError = error;
                // Возвращаем предыдущий снимок через тот же UCI-механизм. Ошибка отката
                // не должна скрыть исходную причину, которую увидит пользователь.
                try { stageImportedPayload(previous, previous); } catch (ignored) { return Promise.reject(originalError); }
                return saveUciChanges(['sheepfold', 'dhcp', 'wireless']).then(function () {
                        return Promise.reject(originalError);
                }, function () {
                        return Promise.reject(originalError);
                });
        }).then(function () {
                return routerControl(['settings-import-applied']).then(function (result) {
                        try {
                                ensureRouterControlOk(result, _('Settings were restored, but router services could not be refreshed.'));
                                return { servicesRefreshed: true };
                        } catch (error) {
                                return { servicesRefreshed: false };
                        }
                }, function () {
                        return { servicesRefreshed: false };
                });
        });
}

function showImportConfirmation(payload) {
        var info = settingsBackupModel.summary(payload);
        var status = E('p', { 'class': 'sf-muted' });
        var applyButton;

        applyButton = E('button', {
                'class': 'btn cbi-button cbi-button-positive',
                'click': function () {
                        applyButton.disabled = true;
                        status.textContent = _('Applying backup...');
                        applyImportedPayload(payload).then(function (result) {
                                settingsDraft.reset();
                                ui.hideModal();
                                notifyCentered(_('Settings imported successfully. The page will reload.'));
                                if (!result.servicesRefreshed)
                                        notify(_('Settings were restored, but router services could not be refreshed.'), 'warning');
                                window.setTimeout(function () { window.location.reload(); }, 1200);
                        }, function (error) {
                                applyButton.disabled = false;
                                status.textContent = backupErrorMessage(error);
                        });
                }
        }, _('Import and apply'));

        ui.showModal(_('Import all settings and user list'), [
                E('p', {}, _('The backup contains: %s devices, %s groups, %s schedules, %s administrators, %s static DHCP leases and %s Wi-Fi sections.')
                        .replace('%s', info.devices).replace('%s', info.groups).replace('%s', info.schedules)
                        .replace('%s', info.administrators).replace('%s', info.dhcpHosts).replace('%s', info.wifiSections)),
                E('div', { 'class': 'sf-note sf-note-warning' }, [
                        E('strong', {}, _('Existing Sheepfold settings, static DHCP leases and Wi-Fi settings will be replaced.')),
                        E('br'),
                        info.containsSecrets ?
                                _('The encrypted backup contains secrets.') :
                                _('This backup does not contain secrets. Existing matching secrets will be kept; missing ones must be entered again.'),
                        E('br'),
                        _('Wi-Fi may restart and temporarily disconnect this device.')
                ]),
                status,
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
                        applyButton
                ])
        ]);
}

function showEncryptedImport(envelope) {
        var password = E('input', { 'class': 'cbi-input-password', 'type': 'password', 'autocomplete': 'current-password' });
        var status = E('p', { 'class': 'sf-muted' });
        var openButton;

        openButton = E('button', {
                'class': 'btn cbi-button cbi-button-positive',
                'click': function () {
                        openButton.disabled = true;
                        status.textContent = _('Decrypting backup...');
                        settingsBackupModel.decrypt(envelope, password.value).then(function (payload) {
                                password.value = '';
                                showImportConfirmation(payload);
                        }, function () {
                                openButton.disabled = false;
                                status.textContent = _('Could not decrypt the backup. Check the password and file.');
                        });
                }
        }, _('Decrypt and check'));

        ui.showModal(_('Open encrypted backup'), [
                E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Backup password')), password]),
                status,
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
                        openButton
                ])
        ]);
}

function importSettingsAndUsers() {
        var input = E('input', {
                'type': 'file',
                'accept': 'application/json,.json',
                'change': function () {
                        var file = input.files && input.files[0];
                        var reader;

                        if (!file)
                                return;
                        if (file.size > 5 * 1024 * 1024) {
                                notify(_('The backup file is too large.'), 'warning');
                                return;
                        }

                        reader = new FileReader();
                        reader.onload = function () {
                                var parsed;
                                var payload;

                                try {
                                        parsed = JSON.parse(String(reader.result || ''));
                                        if (parsed.format === settingsBackupModel.encryptedFormat) {
                                                showEncryptedImport(parsed);
                                                return;
                                        }
                                        payload = settingsBackupModel.validate(parsed);
                                        if (payload.containsSecrets)
                                                throw new Error('unencrypted_secrets_forbidden');
                                } catch (error) {
                                        notify(backupErrorMessage(error), 'warning');
                                        return;
                                }
                                showImportConfirmation(payload);
                        };
                        reader.onerror = function () {
                                notify(_('Could not read import file.'), 'warning');
                        };
                        reader.readAsText(file);
                }
        });

        input.click();
}

function svgIcon(paths, attrs) {
        return sharedIcons.svg(paths, attrs);
}

function adminDeviceIcon() {
        return sharedIcons.adminDevice(_('Admin device'));
}

function adminCrownIcon() {
        return sharedIcons.adminCrown(_('Admin device'));
}

function staticLeaseIcon() {
        return sharedIcons.staticLease(_('Permanent IP lease'));
}

function deviceTypeDefinitions() {
        return deviceTypes.definitions();
}

function deviceTypeByValue(value) {
        return deviceTypes.byValue(value);
}

function displayDeviceType(device) {
        return deviceTypes.displayedType(
                device,
                safeUciGet('sheepfold', 'global', 'detector_min_device_type_confidence', '70')
        );
}

function deviceTypeOptions() {
        return deviceTypes.options();
}

function inferDeviceType(item, configured) {
        return deviceTypes.infer(item, configured);
}

function deviceTypeIcon(type) {
        return deviceTypes.icon(type);
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
                'click': function (ev) {
                        var visible;

                        ev.preventDefault();
                        visible = input.type === 'password';
                        input.type = visible ? 'text' : 'password';
                        button.setAttribute('title', visible ? _('Hide temporary password') : _('Show temporary password'));
                        button.setAttribute('aria-label', visible ? _('Hide temporary password') : _('Show temporary password'));
                }
        }, iconSvg('eye'));

        return E('label', { 'class': 'sf-field sf-secret-field' }, [
                E('span', {}, label),
                E('div', { 'class': 'sf-secret-row' }, [
                        input,
                        button
                ])
        ]);
}

function qrCode(text) {
        return pairingQr.render(text, {
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

function pairingPayload(routerAddress, port, login, code) {
        return 'SF1|h=' + routerAddress + '|p=' + port + '|u=' + login + '|c=' + code;
}

function administratorSectionName(admin) {
        var login = String(admin && admin.login || '').trim();
        var existing = safeUciSections('sheepfold', 'administrator').filter(function (section) {
                return String(section.login || '').trim() === login;
        })[0];
        var preferredName;

        if (existing)
                return existing['.name'];

        preferredName = login === 'SuperParent' ? 'owner' :
                'admin_' + login.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

        if (!preferredName || preferredName === 'admin_')
                preferredName = 'admin_' + String(admin && admin.id || Date.now()).toLowerCase().replace(/[^a-z0-9_]+/g, '_');

        return ensureSection('sheepfold', 'administrator', preferredName);
}

function activateAdministratorPairingCode(admin, code) {
        return routerControl([
                'activate-admin-pairing-code',
                admin.login || '',
                code || '',
                admin.name || admin.login || '',
                '600'
        ]);
}

function pairingStatusForAdministrator(admin, since) {
        return routerControl([
                'admin-pairing-status',
                admin.login || '',
                String(since || 0)
        ]).then(function (result) {
                return parseKeyValueOutput(result.stdout || '');
        });
}

function upsertPairedAdminDevice(admin, status) {
        var mac = normalizeMac(status.mac);
        var device = null;
        var nextId;

        if (!mac)
                return null;

        devices.some(function (candidate) {
                if (normalizeMac(candidate.mac) === mac) {
                        device = candidate;
                        return true;
                }

                return false;
        });

        if (!device) {
                nextId = String(status.device_id || devices.length + 1);
                device = {
                        id: nextId,
                        name: status.device_name || mac,
                        ip: status.ip || '',
                        mac: mac,
                        group: NOT_CONFIGURED_GROUP,
                        status: 'allow',
                        note: _('Admin device'),
                        adminDevice: true,
                        adminOwner: status.admin_name || admin.name || '',
                        adminLogin: status.admin_login || admin.login || '',
                        deviceType: 'phone'
                };
                devices.push(device);
        }

        device.name = status.device_name || device.name || mac;
        device.ip = status.ip || device.ip || '';
        device.status = 'allow';
        device.adminDevice = true;
        device.adminOwner = status.admin_name || admin.name || '';
        device.adminLogin = status.admin_login || admin.login || '';

        if ((admin.deviceIds || []).indexOf(device.id) === -1)
                admin.deviceIds = (admin.deviceIds || []).concat([device.id]);

        return device;
}

function updateAdminTableRow(admin) {
        document.querySelectorAll('.sf-admin-row').forEach(function (row) {
                if (row.getAttribute('data-admin-login') === String(admin.login || ''))
                        row.replaceWith(adminTableRow(admin));
        });
}

function startAdminPairingWatcher(admin, since) {
        var startedAt = Date.now();
        var timer = null;
        var stopped = false;

        function stop() {
                stopped = true;
                if (timer)
                        window.clearTimeout(timer);
        }

        function check() {
                if (stopped)
                        return;

                if (Date.now() - startedAt > 10 * 60 * 1000) {
                        stop();
                        return;
                }

                pairingStatusForAdministrator(admin, since).then(function (status) {
                        var device;

                        if (stopped)
                                return;

                        if (status.paired === '1') {
                                device = upsertPairedAdminDevice(admin, status);
                                updateAdminTableRow(admin);
                                ui.hideModal();
                                notifyCentered('К администратору ' + (status.admin_name || admin.name || admin.login) +
                                        ' успешно привязалось устройство "' + ((device && device.name) || status.device_name || status.mac || '') + '"');
                                stop();
                                return;
                        }

                        timer = window.setTimeout(check, 2000);
                }, function () {
                        if (!stopped)
                                timer = window.setTimeout(check, 3000);
                });
        }

        timer = window.setTimeout(check, 1500);

        return stop;
}

function generatePairingCode() {
        return secureRandom.pairingCode();
}

function generateUrlToken(length) {
        return secureRandom.urlToken(length);
}

function currentRouterAddress() {
        return window.location.hostname || String(window.location.host || '').split(':')[0] || '192.168.1.1';
}

function quickAllowlistUrl(token) {
        return window.location.protocol + '//' + currentRouterAddress() + '/q/' + encodeURIComponent(token);
}

function readRouterDevicesNow() {
        return Promise.all([
                fs.read('/tmp/dhcp.leases').catch(function () {
                        return '';
                }),
                fs.read('/proc/net/arp').catch(function () {
                        return '';
                })
        ]).then(function (results) {
                devices = buildRouterDevices(results[0], results[1]);
                return devices;
        });
}

function quickCandidateKey(device) {
        return normalizeMac(device.mac) || device.ip || device.name;
}

function quickCandidateAgeText(ageMs) {
        var seconds = Math.max(0, Math.floor(ageMs / 1000));
        var minutes;

        if (seconds < 60)
                return seconds + ' ' + _('seconds ago');

        minutes = Math.floor(seconds / 60);

        if (minutes === 1)
                return _('minute ago');

        return minutes + ' ' + _('minutes ago');
}

function renderQuickCandidateRow(candidate, onAdd) {
        return E('tr', {}, [
                E('td', {}, [
                        E('strong', {}, candidate.device.name || '-'),
                        E('small', {}, _('Connected after quick add started.'))
                ]),
                E('td', {}, candidate.device.ip || '-'),
                E('td', {}, candidate.device.mac || '-'),
                E('td', {}, quickCandidateAgeText(Date.now() - candidate.firstSeenAt)),
                E('td', {}, E('button', {
                        'class': 'sf-action sf-action-positive',
                        'disabled': candidate.added ? 'disabled' : null,
                        'click': function (ev) {
                                ev.preventDefault();
                                onAdd(candidate, ev.currentTarget);
                        }
                }, candidate.added ? _('Candidate added to allowlist. Save changes to apply.') : _('Add')))
        ]);
}

function renderQuickCandidateTable(candidates, onAdd) {
        return E('table', { 'class': 'sf-quick-table' }, [
                E('thead', {}, E('tr', {}, [
                        E('th', {}, _('Device')),
                        E('th', {}, 'IP'),
                        E('th', {}, 'MAC'),
                        E('th', {}, _('Seen')),
                        E('th', {}, _('Actions'))
                ])),
                E('tbody', {}, candidates.map(function (candidate) {
                        return renderQuickCandidateRow(candidate, onAdd);
                }))
        ]);
}

function ipSortValue(ip) {
        var parts = String(ip || '').split('.').map(function (part) {
                return parseInt(part, 10);
        });

        if (parts.length !== 4 || parts.some(function (part) { return isNaN(part); }))
                return -1;

        return (((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function deviceSortHeader(label, key) {
        return deviceTableModel.sortHeader(label, key, {
                className: 'sf-device-sort',
                tableSelector: '.sf-device-table',
                rowSelector: '.sf-device-row:not(.sf-device-head)',
                buttonSelector: '.sf-device-sort'
        });
}

function filterDeviceTable(table, needle) {
        deviceTableModel.filter(table, needle);
}

function adminSortHeader(label, key) {
        return deviceTableModel.sortHeader(label, key, {
                className: 'sf-device-sort sf-admin-sort',
                tableSelector: '.sf-admin-table',
                rowSelector: '.sf-admin-row:not(.sf-admin-head)',
                buttonSelector: '.sf-admin-sort'
        });
}

function showPairingModal(device) {
        var routerAddress = currentRouterAddress();
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var apiPath = '/cgi-bin/sheepfold-api';
        var apiUrl = 'https://' + routerAddress + ':' + port + apiPath;
        var pairingCode = device.pairingCode || generatePairingCode();
        var pairingPayloadText = pairingPayload(routerAddress, port, device.adminLogin || 'SuperParent', pairingCode);

        ui.showModal(_('Pairing settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayloadText),
                                E('p', {}, _('Scan this QR code with the Android app to connect it to this router.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                E('h4', {}, _('Manual setup')),
                                settingLine(_('Router address'), routerAddress),
                                settingLine(_('Sheepfold API URL'), apiUrl),
                                settingLine(_('Administrator login'), device.adminLogin || 'SuperParent'),
                                settingLine(_('Pairing code'), pairingCode),
                                settingLine(_('Token lifetime'), _('10 minutes')),
                                settingLine(_('QR payload'), pairingPayloadText),
                                settingLine(_('Wi-Fi MAC check'), _('Use the real device MAC for this home Wi-Fi network.')),
                                E('div', { 'class': 'sf-note sf-note-warning' }, _('Android must require the real device MAC for this home Wi-Fi network before continuing setup.'))
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Close'))
                ])
        ]);
}

function showAdminSettingsModal(admin) {
        var routerAddress = currentRouterAddress();
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var apiPath = '/cgi-bin/sheepfold-api';
        var apiUrl = 'https://' + routerAddress + ':' + port + apiPath;
        var temporaryPassword = admin.temporaryPassword || generatePairingCode();
        var pairingPayloadText = pairingPayload(routerAddress, port, admin.login, temporaryPassword);
        var pairingStartedAt = Math.floor(Date.now() / 1000);
        var stopPairingWatcher = null;
        var accessRequests = checkboxControl(
                _('May child devices send this administrator requests for 30 more minutes of internet?'),
                !!admin.allowChildAccessRequests,
                _('Disabled by default. A request only notifies the parent and never grants internet automatically.')
        );

        admin.temporaryPassword = temporaryPassword;
        activateAdministratorPairingCode(admin, temporaryPassword).then(function () {
                stopPairingWatcher = startAdminPairingWatcher(admin, pairingStartedAt);
        }).catch(function () {
                notify(_('Could not save settings.'), 'warning');
        });

        ui.showModal(_('Administrator settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayloadText),
                                E('p', {}, _('Scan this QR code in the Android app for quick setup.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                field(_('Admin name'), admin.name),
                                field(_('Login'), admin.login),
                                passwordRevealField(_('Temporary password'), temporaryPassword),
                                settingLine(_('Sheepfold API URL'), apiUrl),
                                settingLine(_('Server IP address'), routerAddress),
                                settingLine(_('Port'), port),
                                accessRequests.node
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        if (stopPairingWatcher)
                                                stopPairingWatcher();
                                        ui.hideModal();
                                }
                        }, _('Close')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        admin.allowChildAccessRequests = accessRequests.input.checked;
                                        stageAdministrator(admin);
                                        saveUciChanges(['sheepfold']).then(function () {
                                                notifyCentered(_('Settings saved successfully.'));
                                                if (stopPairingWatcher)
                                                        stopPairingWatcher();
                                                ui.hideModal();
                                        }).catch(function () {
                                                notify(_('Could not save settings.'), 'warning');
                                        });
                                }
                        }, _('Save'))
                ])
        ]);
}

function pairingButton(device) {
        return E('button', {
                'class': 'sf-action sf-action-pairing',
                'click': function (ev) {
                        ev.preventDefault();
                        showPairingModal(device);
                }
        }, [adminDeviceIcon(), E('span', {}, _('Pairing'))]);
}

function listDeviceCanBeAdded(device, targetStatus) {
        var mac = normalizeMac(device && device.mac);

        if (!mac)
                return false;

        if (targetStatus === 'blocked')
                return !isAdminDevice(device) &&
                        device.status !== 'blocked' &&
                        device.status !== 'allow' &&
                        !macInSheepfoldList('allowlist', mac);

        return device.status !== 'allow' &&
                device.status !== 'blocked' &&
                !macInSheepfoldList('allowlist', mac) &&
                !macInSheepfoldList('blocklist', mac);
}

function listDeviceCandidateTable(targetStatus, onSelect) {
        var rows = devices.filter(function (device) {
                return listDeviceCanBeAdded(device, targetStatus);
        });

        if (!rows.length)
                return E('div', { 'class': 'sf-note sf-note-warning' }, _('No devices available to add.'));

        return E('div', { 'class': 'sf-add-device-candidates' }, [
                E('strong', {}, _('Available devices')),
                E('table', { 'class': 'sf-quick-table sf-add-device-table' }, [
                        E('thead', {}, [
                                E('tr', {}, [
                                        E('th', {}, _('ID')),
                                        E('th', {}, _('Device')),
                                        E('th', {}, _('IP address')),
                                        E('th', {}, _('MAC address')),
                                        E('th', {}, _('Actions'))
                                ])
                        ]),
                        E('tbody', {}, rows.map(function (device) {
                                return E('tr', {}, [
                                        E('td', {}, formattedDeviceDisplayId(device)),
                                        E('td', {}, [
                                                E('strong', {}, device.name || _('Unknown device')),
                                                E('small', {}, displayGroupName(device.group))
                                        ]),
                                        E('td', {}, device.ip || '-'),
                                        E('td', { 'class': 'sf-mono' }, device.mac || '-'),
                                        E('td', {}, [
                                                E('button', {
                                                        'class': 'sf-action sf-action-positive',
                                                        'click': function (ev) {
                                                                ev.preventDefault();
                                                                onSelect(device);
                                                        }
                                                }, _('Select'))
                                        ])
                                ]);
                        }))
                ])
        ]);
}

function grantDeviceTemporaryAccess(device, minutes) {
        var mac = normalizeMac(device && device.mac);
        var duration = Number(minutes || 0);

        if (!mac)
                return Promise.reject(new Error(_('Invalid MAC address')));

        if (!duration || duration < 1)
                return Promise.reject(new Error(_('Temporary access duration is invalid.')));

        if (!window.confirm(
                _('Grant temporary internet access to %s for %s minutes?')
                        .replace('%s', infoValue(device.name || device.hostname || mac))
                        .replace('%s', String(duration))
        ))
                return Promise.resolve(null);

        return routerControl(['device-temp-access', mac, String(duration)]).then(function (result) {
                ensureRouterControlOk(result, _('Could not grant temporary access.'));
                notify(_('Temporary access granted.'), 'info');
                return load();
        }, function (error) {
                notify(commandErrorText(error, _('Could not grant temporary access.')), 'warning');
        });
}

function setDeviceBackendStatus(device, status) {
        var mac = normalizeMac(device && device.mac);

        if (!mac)
                return Promise.reject(new Error(_('Invalid MAC address')));

        if (status === 'allow')
                return routerControl(['device-allow', mac]).then(function (result) {
                        return ensureRouterControlOk(result, _('Could not add device to allowlist.'));
                });

        if (status === 'blocked')
                return routerControl(['device-block', mac]).then(function (result) {
                        return ensureRouterControlOk(result, _('Could not add device to blocklist.'));
                });

        return routerControl([
                'set-device-status',
                mac,
                status,
                device.name || device.hostname || mac,
                device.ip || '',
                normalizeGroupName(device.group) || NOT_CONFIGURED_GROUP,
                device.deviceType || 'smart'
        ]).then(function (result) {
                return ensureRouterControlOk(result, _('Could not update device status.'));
        });
}

function persistDeviceListMembership(selectedDevices, targetStatus) {
        var isAllowlist = targetStatus === 'allow';
        var listSections = safeUciSections('sheepfold', 'list');
        var device;
        var conflict;
        var mac;
        var sectionName;
        var i;

        for (i = 0; i < selectedDevices.length; i++) {
                device = selectedDevices[i];
                mac = normalizeMac(device && device.mac);

                if (!mac)
                        return Promise.reject(new Error(_('Invalid MAC address')));

                conflict = deviceAccessLists.conflictingList(listSections, targetStatus, mac);

                if (conflict === 'blocklist' || isAllowlist && device.status === 'blocked')
                        return Promise.reject(new Error(_('This device is in the blocklist. Remove it from the blocklist first.')));

                if (conflict === 'allowlist' || !isAllowlist && device.status === 'allow')
                        return Promise.reject(new Error(_('This device is in the allowlist. Remove it from the allowlist first.')));
        }

        selectedDevices.forEach(function (item) {
                mac = normalizeMac(item.mac);
                sectionName = ensureSheepfoldDeviceSection(item);

                uci.set('sheepfold', sectionName, 'mac', mac);
                uci.set('sheepfold', sectionName, 'name', item.name || item.hostname || mac);
                uci.set('sheepfold', sectionName, 'ip', item.ip || '');
                uci.set('sheepfold', sectionName, 'group', normalizeGroupName(item.group) || NOT_CONFIGURED_GROUP);
                uci.set('sheepfold', sectionName, 'device_type', item.deviceType || 'smart');
                uci.set('sheepfold', sectionName, 'status', isAllowlist ? 'allow' : 'blocked');

                updateMacList(isAllowlist ? 'allowlist' : 'blocklist', mac, true);
        });

        return saveSheepfoldAccessChanges();
}

function showManualListDeviceModal(targetStatus) {
        var isAllowlist = targetStatus === 'allow';
        var title = isAllowlist ? _('Add device to allowlist') : _('Add device to blocklist');
        var selector = createDeviceSelectionBox({
                filter: function (device) {
                        return listDeviceCanBeAdded(device, targetStatus);
                }
        });
        var actionRow;

        function saveSelectedDevices() {
                var selectedDevices = selector.selectedDevices();

                if (!selectedDevices.length) {
                        notify(_('No devices selected'), 'warning');
                        return;
                }

                persistDeviceListMembership(selectedDevices, targetStatus).then(function () {
                        // UCI уже подтверждён роутером; обновляем только связанные таблицы,
                        // чтобы добавление в список не перезапускало всю страницу LuCI.
                        selectedDevices.forEach(function (device) {
                                device.status = targetStatus;
                        });
                        notify(isAllowlist ? _('Device added to allowlist.') : _('Device added to blocklist.'), 'info');
                        ui.hideModal();
                        refreshUserListsWithoutPageReload();
                }, function (error) {
                        notify(commandErrorText(error, _('Could not add device.')), 'warning');
                });
        }

        function modalActions() {
                return E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': saveSelectedDevices
                        }, _('Save'))
                ]);
        }

        actionRow = modalActions();

        ui.showModal(title, [
                E('div', { 'class': 'sf-binding-modal' }, [
                        actionRow,
                        selector.node
                ]),
                modalActions()
        ]);
}

function showManualDeviceModal() {
        var nameField = siteInputField(_('Device name'), '');
        var macField = siteInputField(_('MAC address'), '');
        var ipField = siteInputField(_('IP address'), '');
        var typeField = deviceTypeSelectControl(_('Device type'), 'smart');

        ui.showModal(_('Add device'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        nameField.node,
                        macField.node,
                        ipField.node,
                        typeField.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var mac = normalizeMac(macField.input.value);

                                        if (!mac) {
                                                notify(_('Enter a valid MAC address.'), 'warning');
                                                return;
                                        }

                                        setDeviceBackendStatus({
                                                mac: mac,
                                                name: nameField.input.value.trim() || mac,
                                                ip: ipField.input.value.trim(),
                                                group: NOT_CONFIGURED_GROUP,
                                                deviceType: typeField.input.value
                                        }, 'restricted').then(function () {
                                                notify(_('Device added.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function (error) {
                                                notify(commandErrorText(error, _('Could not add device.')), 'warning');
                                        });
                                }
                        }, _('Save'))
                ])
        ]);
}

function manualListDeviceButton(targetStatus) {
        return E('button', {
                'class': 'sf-action sf-action-positive',
                'click': function (ev) {
                        ev.preventDefault();
                        showManualListDeviceModal(targetStatus);
                }
        }, _('Add device'));
}

function showQuickAllowlistModal() {
        var networks = readWifiNetworksFromUci();
        var wifiPayload = networks.length ?
                wifiQrPayload(networks[0].ssid, networks[0].password, networks[0].encryption) :
                'WIFI:T:nopass;S:;;';
        var allowlistToken = generateUrlToken(18);
        var allowlistUrl = quickAllowlistUrl(allowlistToken);
        var progressFill = E('span', { 'class': 'sf-quick-progress-fill' });
        var permitButton;
        var timer = null;
        var refreshTimer = null;
        var startSequence = 0;
        var secondsTotal = 30;
        var windowStartedAt = 0;
        var windowExpiresAt = 0;
        var baselineKeys = {};
        var candidateMap = {};
        var candidatesNode = E('div', { 'class': 'sf-quick-candidates' });
        var permitTitle;
        var permitHint;

        devices.forEach(function (device) {
                baselineKeys[quickCandidateKey(device)] = true;
        });

        function candidateList() {
                return Object.keys(candidateMap).map(function (key) {
                        return candidateMap[key];
                }).sort(function (left, right) {
                        return right.firstSeenAt - left.firstSeenAt;
                });
        }

        function renderCandidates() {
                var candidates = candidateList();

                candidatesNode.replaceChildren(renderQuickCandidateTable(candidates, function (candidate, button) {
                        button.disabled = true;
                        persistDeviceListMembership([candidate.device], 'allow').then(function () {
                                candidate.added = true;
                                button.textContent = _('Device added to allowlist.');
                                notify(_('Device added to allowlist.'), 'info');
                        }, function (error) {
                                button.disabled = false;
                                notify(commandErrorText(error, _('Could not add device.')), 'warning');
                        });
                }));
        }

        function refreshCandidates() {
                if (!windowStartedAt || Date.now() > windowExpiresAt)
                        return Promise.resolve();

                return readRouterDevicesNow().then(function (currentDevices) {
                        currentDevices.forEach(function (device) {
                                var key = quickCandidateKey(device);

                                if (!key || baselineKeys[key] || candidateMap[key] || device.status === 'blocked' || device.status === 'allow')
                                        return;

                                candidateMap[key] = {
                                        device: device,
                                        firstSeenAt: Date.now()
                                };
                        });

                        renderCandidates();
                });
        }

        function startWindow() {
                var remaining = secondsTotal;
                var sequence = ++startSequence;

                if (timer)
                        window.clearInterval(timer);
                if (refreshTimer)
                        window.clearInterval(refreshTimer);

                permitButton.classList.remove('expired');
                permitTitle.textContent = _('Adding allowed');
                permitHint.textContent = _('Click to restart the 30 second window.');
                windowStartedAt = Date.now();
                windowExpiresAt = windowStartedAt + secondsTotal * 1000;
                baselineKeys = {};

                renderCandidates();
                readRouterDevicesNow().then(function (currentDevices) {
                        if (sequence !== startSequence)
                                return;

                        currentDevices.forEach(function (device) {
                                baselineKeys[quickCandidateKey(device)] = true;
                        });

                        refreshCandidates();
                        refreshTimer = window.setInterval(refreshCandidates, 3000);
                });

                function tick() {
                        var percent = Math.max(0, remaining / secondsTotal * 100);

                        progressFill.style.width = percent + '%';

                        if (remaining <= 0) {
                                window.clearInterval(timer);
                                timer = null;
                                if (refreshTimer) {
                                        window.clearInterval(refreshTimer);
                                        refreshTimer = null;
                                }
                                permitButton.classList.add('expired');
                                permitTitle.textContent = _('Adding window expired');
                                permitHint.textContent = _('Click to restart the 30 second window.');
                        }

                        remaining--;
                }

                tick();
                timer = window.setInterval(tick, 1000);
        }

        permitTitle = E('strong', {}, _('Adding allowed'));
        permitHint = E('small', {}, _('Click to restart the 30 second window.'));
        permitButton = E('button', {
                'class': 'sf-action sf-action-positive sf-quick-permit',
                'click': function (ev) {
                        ev.preventDefault();
                        startWindow();
                }
        }, [
                progressFill,
                permitTitle,
                permitHint
        ]);

        ui.showModal(_('Quick allowlist add'), [
                E('div', { 'class': 'sf-modal-quick' }, [
                        E('div', { 'class': 'sf-modal-quick-top' }, [
                                E('div', { 'class': 'sf-qr-wrap' }, [
                                        E('h4', {}, _('Wi-Fi access QR')),
                                        qrCode(wifiPayload),
                                        E('p', {}, _('Scan Wi-Fi QR, then add newly connected devices manually.'))
                                ]),
                                E('div', { 'class': 'sf-qr-wrap sf-qr-divider' }, [
                                        E('h4', {}, _('Allowlist request QR')),
                                        qrCode(allowlistUrl),
                                        E('p', {}, _('After connecting to Wi-Fi, scan this QR to request allowlist access from this phone.')),
                                        settingLine(_('One-time allowlist link'), allowlistUrl)
                                ]),
                                E('div', { 'class': 'sf-quick-side' }, [
                                        permitButton,
                                        E('div', { 'class': 'sf-note' }, _('Quick mode only collects candidates. A parent still presses Add for every device.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-quick-candidates-wrap' }, [
                                E('h4', {}, _('Newly connected devices')),
                                candidatesNode
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        if (timer)
                                                window.clearInterval(timer);
                                        if (refreshTimer)
                                                window.clearInterval(refreshTimer);
                                        ui.hideModal();
                                }
                        }, _('Close'))
                ])
        ]);

        startWindow();
}

function quickAllowlistButton() {
        return E('button', {
                'class': 'sf-action sf-action-positive',
                'click': function (ev) {
                        ev.preventDefault();
                        showQuickAllowlistModal();
                }
        }, _('Quick add to allowlist'));
}

function renderEmergencySiteList() {
        var lists = document.querySelectorAll('.sf-domain-list');

        for (var i = 0; i < lists.length; i++)
                lists[i].replaceChildren.apply(lists[i], emergencySites.map(domainCard));
}

function emergencySitesChanged() {
        return !emergencySiteModel.same(emergencySites, savedEmergencySites);
}

function registerEmergencySitesSaver() {
        registerSettingsSpecialSaver({
                isChanged: emergencySitesChanged,
                save: function () {
                        emergencySites = emergencySiteModel.stage(uci, 'sheepfold', emergencySites);
                        return saveUciChanges(['sheepfold']).then(function () {
                                return routerControl(['emergency-sites-apply']);
                        });
                },
                accept: function () {
                        savedEmergencySites = emergencySiteModel.clone(emergencySites);
                }
        });
}

function siteInputField(label, value) {
        var input = E('input', { 'class': 'cbi-input-text', 'value': value || '' });

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input
                ])
        };
}

function siteTextareaField(label, value) {
        var input = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || '');

        return {
                input: input,
                node: E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, label),
                        input
                ])
        };
}

function showSiteModal(site) {
        var isEdit = !!site;
        var current = site || ['', '', ''];
        var urlField = siteInputField(_('URL address'), current[0]);
        var nameField = siteInputField(_('Name'), current[1]);
        var descriptionField = siteTextareaField(_('Description'), current[2]);

        ui.showModal(isEdit ? _('Edit site') : _('Add site'), [
                E('div', { 'class': 'sf-site-modal' }, [
                        urlField.node,
                        nameField.node,
                        descriptionField.node,
                        E('div', { 'class': 'sf-note sf-note-warning' },
                                _('Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.'))
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var url = emergencySiteModel.normalizeDomain(urlField.input.value);
                                        var name = nameField.input.value.trim();
                                        var description = descriptionField.input.value.trim();

                                        if (!url) {
                                                notify(_('Enter a valid domain name, for example gosuslugi.ru.'), 'warning');
                                                return;
                                        }
                                        if (emergencySites.some(function (candidate) {
                                                return candidate !== site && candidate[0] === url;
                                        })) {
                                                notify(_('This domain is already in the emergency-useful sites list.'), 'warning');
                                                return;
                                        }

                                        if (isEdit) {
                                                site[0] = url;
                                                site[1] = name;
                                                site[2] = description;
                                        } else {
                                                emergencySites.push([url, name, description, '']);
                                        }

                                        renderEmergencySiteList();
                                        markSettingsDraftChanged();
                                        notify(_('Site prepared. Press Save settings to apply it.'), 'info');
                                        ui.hideModal();
                                }
                        }, _('Save'))
                ])
        ]);
}

function deleteSite(site) {
        var index = emergencySites.indexOf(site);

        if (index === -1)
                return;

        emergencySites.splice(index, 1);
        renderEmergencySiteList();
        markSettingsDraftChanged();
        notify(_('Site removal prepared. Press Save settings to apply it.'), 'info');
        ui.hideModal();
}

function showDeleteSiteModal(site) {
        ui.showModal(_('Delete site'), [
                E('div', { 'class': 'sf-site-modal' }, [
                        E('p', {}, _('Delete this site?')),
                        E('strong', {}, site[0]),
                        E('small', {}, _('This site will be removed from the emergency-useful list.'))
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-negative',
                                'click': function () {
                                        deleteSite(site);
                                }
                        }, _('Delete'))
                ])
        ]);
}

function domainCard(site) {
        return E('div', { 'class': 'sf-domain' }, [
                E('div', { 'class': 'sf-domain-actions sf-domain-actions-top' }, [
                        iconButton(_('Edit site'), 'gear', 'neutral', function () {
                                showSiteModal(site);
                        })
                ]),
                E('strong', {}, site[0]),
                E('span', {}, site[1]),
                E('small', {}, site[2]),
                E('div', { 'class': 'sf-domain-actions sf-domain-actions-bottom' }, [
                        iconButton(_('Delete site'), 'trash', 'danger', function () {
                                showDeleteSiteModal(site);
                        })
                ])
        ]);
}

function deviceDisplayId(device) {
        var match = String(device.id || '').match(/^(\d+)$/);

        return match ? String(parseInt(match[1], 10)) : String(devices.indexOf(device) + 1);
}

function formattedDeviceDisplayId(device) {
        return '#' + deviceDisplayId(device);
}

var DEFAULT_GROUP_SECTION_IDS = ['no_restrictions', 'child_1', 'personal_devices'];
var LEGACY_GROUP_ALIASES = {
        'No restrictions': 'no_restrictions',
        'Без ограничений': 'no_restrictions',
        '不受限制': 'no_restrictions',
        'First child': 'child_1',
        'Child number 1': 'child_1',
        'Первый ребёнок': 'child_1',
        'Ребёнок номер 1': 'child_1',
        '第一个孩子': 'child_1',
        'Personal devices': 'personal_devices',
        'Персональные устройства': 'personal_devices',
        '个人设备': 'personal_devices'
};

function defaultGroupDisplayName(sectionId, fallback) {
        var stored = safeUciGet('sheepfold', sectionId, 'name', '');

        return String(stored || fallback || '').trim();
}

function noRestrictionsGroupName() {
        return defaultGroupDisplayName('no_restrictions', 'No restrictions');
}

function childGroupName() {
        return defaultGroupDisplayName('child_1', _('First child'));
}

function personalDevicesGroupName() {
        return defaultGroupDisplayName('personal_devices', _('Personal devices'));
}

function normalizeGroupName(groupName) {
        var trimmed = String(groupName || '').trim();

        if (!trimmed || trimmed === NOT_CONFIGURED_GROUP || trimmed === 'Не настроено')
                return NOT_CONFIGURED_GROUP;

        if (LEGACY_GROUP_ALIASES[trimmed])
                return defaultGroupDisplayName(LEGACY_GROUP_ALIASES[trimmed], trimmed);

        return trimmed;
}

function displayGroupName(groupName) {
        var normalized = normalizeGroupName(groupName);

        if (!normalized || normalized === NOT_CONFIGURED_GROUP)
                return _('Not configured');

        return normalized;
}

function sheepfoldGroupOptions() {
        var options = [[NOT_CONFIGURED_GROUP, _('Not configured')]];

        safeUciSections('sheepfold', 'group').forEach(function (section) {
                var name = normalizeGroupName(section.name);

                if (!name)
                        return;

                options.push([name, name]);
        });

        return options;
}

function supplementGroupedDevicesFromUci(grouped) {
        var devicesByMac = {};

        devices.forEach(function (device) {
                devicesByMac[device.mac] = device;
        });

        safeUciSections('sheepfold', 'device').forEach(function (section) {
                var mac = normalizeMac(section.mac);
                var groupName;
                var deviceEntry;
                var alreadyListed;

                if (!mac || reservedSheepfoldListSection(section['.name']))
                        return;

                groupName = section.group ? normalizeGroupName(section.group) : '';
                if (!groupName || groupName === NOT_CONFIGURED_GROUP)
                        return;

                if (!grouped[groupName])
                        grouped[groupName] = [];

                alreadyListed = grouped[groupName].some(function (device) {
                        return device.mac === mac;
                });

                if (alreadyListed)
                        return;

                deviceEntry = devicesByMac[mac] || {
                        id: generatedSectionName('device', mac),
                        name: section.name || mac,
                        mac: mac,
                        group: groupName
                };

                grouped[groupName].push(deviceEntry);
        });
}

function ensureDefaultGroupSections(grouped, groupSections) {
        DEFAULT_GROUP_SECTION_IDS.forEach(function (sectionId) {
                var section = safeUciSections('sheepfold', 'group').find(function (item) {
                        return item['.name'] === sectionId;
                });

                if (!section)
                        return;

                var displayName = normalizeGroupName(section.name || defaultGroupDisplayName(sectionId, sectionId));

                if (!grouped[displayName])
                        grouped[displayName] = [];
                groupSections[displayName] = section;
        });
}

function markNoRestrictionsAutoExcluded(sectionName) {
        if (!sectionName)
                return;

        uci.set('sheepfold', sectionName, 'no_restrictions_auto_excluded', '1');
        uci.set('sheepfold', sectionName, 'auto_group_assigned', '0');
}

function markPersonalDevicesAutoExcluded(sectionName) {
        if (!sectionName)
                return;

        uci.set('sheepfold', sectionName, 'personal_devices_auto_excluded', '1');
        uci.set('sheepfold', sectionName, 'auto_group_assigned', '0');
}

function deviceById(id) {
        for (var i = 0; i < devices.length; i++) {
                if (devices[i].id === id)
                        return devices[i];
        }

        return null;
}

function isAdminDevice(device) {
        if (!device)
                return false;

        if (device.adminDevice)
                return true;

        return admins.some(function (admin) {
                return (admin.deviceIds || []).indexOf(device.id) !== -1;
        });
}

function idNumber(value) {
        var match = String(value || '').match(/(\d+)$/);

        return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function firstAdminBySmallestId() {
        return admins.slice().sort(function (left, right) {
                return idNumber(left.id) - idNumber(right.id);
        })[0] || null;
}

function adminByDeepLinkValue(value) {
        if (!value || value === 'first')
                return firstAdminBySmallestId();

        for (var i = 0; i < admins.length; i++) {
                if (admins[i].id === value || admins[i].login === value || admins[i].name === value)
                        return admins[i];
        }

        return null;
}

function adminDeviceList(admin) {
        var selectedById = {};
        var selected = [];

        (admin.deviceIds || []).map(deviceById).filter(Boolean).forEach(function (device) {
                selectedById[device.id] = true;
                selected.push(device);
        });

        devices.forEach(function (device) {
                if (!device || selectedById[device.id])
                        return;

                if (device.adminDevice && (
                        device.adminLogin === admin.login ||
                        device.adminOwner === admin.name
                )) {
                        selectedById[device.id] = true;
                        selected.push(device);
                }
        });

        admin.deviceIds = selected.map(function (device) {
                return device.id;
        });

        if (!selected.length)
                return E('span', { 'class': 'sf-muted' }, _('No devices selected'));

        return E('div', { 'class': 'sf-admin-device-list' }, selected.map(function (device) {
                return E('div', {}, [
                        E('span', { 'class': 'sf-admin-device-list-id' }, formattedDeviceDisplayId(device)),
                        E('span', {}, device.name)
                ]);
        }));
}

function adminAssignedDeviceIds(exceptAdmin) {
        var assigned = {};

        admins.forEach(function (admin) {
                if (exceptAdmin && admin.id === exceptAdmin.id)
                        return;

                (admin.deviceIds || []).forEach(function (id) {
                        assigned[id] = true;
                });
        });

        devices.forEach(function (device) {
                if (!device || !device.adminDevice)
                        return;

                if (exceptAdmin && (
                        device.adminLogin === exceptAdmin.login ||
                        device.adminOwner === exceptAdmin.name
                ))
                        return;

                assigned[device.id] = true;
        });

        return assigned;
}

function adminDeviceCanBeBound(device) {
        return device &&
                device.status !== 'blocked' &&
                !macInSheepfoldList('blocklist', device.mac);
}

function createDeviceSelectionBox(options) {
        return deviceSelection.create(Object.assign({}, options, {
                devices: options.devices || devices,
                displayId: deviceDisplayId,
                formattedId: formattedDeviceDisplayId,
                groupName: displayGroupName
        }));
}

function groupAutoColor(groupName) {
        return groupModel.automaticColor(groupName);
}

function groupColorPalette() {
        return groupModel.palette();
}

function validGroupColor(color) {
        return groupModel.validColor(color);
}

function usedGroupColors(exceptGroupName) {
        var used = {};

        safeUciSections('sheepfold', 'group').forEach(function (section) {
                var name = normalizeGroupName(section.name);
                var color = String(section.color || '').toLowerCase();

                if (name === exceptGroupName || !validGroupColor(color))
                        return;

                used[color] = true;
        });

        return used;
}

function nextAvailableGroupColor(groupName, exceptGroupName) {
        var used = usedGroupColors(exceptGroupName);
        return groupModel.nextColor(groupName, used);
}

function groupColor(groupName, section) {
        return section && validGroupColor(section.color) ? section.color : nextAvailableGroupColor(groupName, groupName);
}

function groupSectionName(groupName) {
        return 'group_' + groupModel.hash(groupName).toString(16);
}

function groupSectionByName(groupName) {
        var normalized = normalizeGroupName(groupName);
        var result = null;

        safeUciSections('sheepfold', 'group').forEach(function (section) {
                if (!result && normalizeGroupName(section.name) === normalized)
                        result = section;
        });

        return result;
}

function ensureGroupSection(groupName, section) {
        if (section && section['.name'])
                return section['.name'];

        return ensureSection('sheepfold', 'group', groupSectionName(groupName));
}

function scheduleDefinitions() {
        return safeUciSections('sheepfold', 'schedule').map(function (section) {
                return [section['.name'], section.name || _('Unnamed schedule')];
        });
}

function scheduleCheckboxes(selectedSchedules) {
        var selected = {};
        var nodes;

        selectedSchedules.forEach(function (value) {
                selected[value] = true;
        });

        nodes = scheduleDefinitions().map(function (item) {
                var checkbox = E('input', {
                        'type': 'checkbox',
                        'checked': selected[item[0]] ? 'checked' : null,
                        'change': function (ev) {
                                selected[item[0]] = ev.currentTarget.checked;
                        }
                });

                return E('label', { 'class': 'sf-check-field' }, [
                        checkbox,
                        E('span', {}, item[1])
                ]);
        });

        return {
                node: E('div', { 'class': 'sf-schedule-list' }, nodes),
                values: function () {
                        return scheduleDefinitions().filter(function (item) {
                                return selected[item[0]];
                        }).map(function (item) {
                                return item[0];
                        });
                }
        };
}

function schedulesConflict(values) {
        return values.length > 1;
}

function savedScheduleConflictInternetValue() {
        return settingValue('schedule_conflict_internet', 'off') === 'on' ? 'on' : 'off';
}

function draftScheduleConflictInternetValue() {
        if (settingsDraft.has('schedule_conflict_internet'))
                return settingsDraft.get('schedule_conflict_internet') === 'on' ? 'on' : 'off';

        return savedScheduleConflictInternetValue();
}

function scheduleConflictResultText() {
        // Редактор расписания сохраняется отдельно от общей страницы настроек.
        // Поэтому здесь показываем применённое UCI-значение, а не несохранённый переключатель из Settings.
        return savedScheduleConflictInternetValue() === 'on' ?
                _('According to the conflict setting, internet will be on.') :
                _('According to the conflict setting, internet will be off.');
}

function showScheduleConflictDisclaimer(onContinue, details) {
        var seconds = 10;
        var countdown = E('strong', {}, String(seconds));
        var button = E('button', {
                'class': 'btn cbi-button cbi-button-positive',
                'disabled': 'disabled',
                'click': function () {
                        ui.hideModal();
                        onContinue();
                }
        }, _('I understand the risk, continue'));
        var timer = window.setInterval(function () {
                seconds--;
                countdown.textContent = String(Math.max(0, seconds));

                if (seconds <= 0) {
                        window.clearInterval(timer);
                        button.disabled = false;
                }
        }, 1000);

        ui.showModal(_('Schedule conflict'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        E('div', { 'class': 'sf-note sf-note-warning' }, _('Selected schedules may conflict with each other. Saving is allowed, but review the rules carefully.')),
                        details ? E('p', {}, details) : '',
                        E('p', {}, [
                                _('Confirmation will be available in'),
                                ' ',
                                countdown
                        ])
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        window.clearInterval(timer);
                                        ui.hideModal();
                                }
                        }, _('Cancel')),
                        button
                ])
        ]);
}

var scheduleDays = [
        ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
        ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']
];

function setUciList(section, option, values) {
        uci.unset('sheepfold', section, option);
        // LuCI принимает весь UCI-list массивом. Повторные set() перезаписали бы
        // предыдущее значение и оставили только последний день или устройство.
        if (values.length)
                uci.set('sheepfold', section, option, values);
}

function refreshSchedulePanel() {
        var page = document.querySelector('.sf-page');
        var current;
        var next;

        if (!page || !activeOverviewView)
                return;
        current = page.querySelector('[data-management-panel="schedules"]');
        if (!current)
                return;
        next = activeOverviewView.renderManagementPanel('schedules', activeOverviewView.renderSchedules(true));
        current.replaceWith(next);
}

function scheduleDayText(section) {
        return scheduleModel.dayText(section, listOptionValues, scheduleDays);
}

function scheduleTimeText(section) {
        return scheduleModel.timeText(section, listOptionValues);
}

function scheduleTargetText(section) {
        var targets = listOptionValues(section.targets);
        var mode = section.target_type || 'group';
        var names = [];

        if (mode === 'group') {
                safeUciSections('sheepfold', 'group').forEach(function (group) {
                        if (targets.indexOf(group['.name']) !== -1)
                                names.push(group.name || group['.name']);
                });
        } else {
                targets.forEach(function (id) {
                        var device = deviceById(id);
                        if (device)
                                names.push(formattedDeviceDisplayId(device) + ' ' + (device.name || device.mac));
                });
        }
        return names.join(', ') || _('No targets selected');
}

function scheduleTargetKeys(mode, targets) {
        var keys = [];
        var groupNames = [];

        if (mode !== 'group')
                return targets.map(function (id) { return 'device:' + id; });

        safeUciSections('sheepfold', 'group').forEach(function (group) {
                if (targets.indexOf(group['.name']) === -1)
                        return;
                keys.push('group:' + group['.name']);
                groupNames.push(normalizeGroupName(group.name));
        });
        devices.forEach(function (device) {
                if (groupNames.indexOf(normalizeGroupName(device.group)) !== -1)
                        keys.push('device:' + device.id);
        });
        return keys;
}

function scheduleHasConflict(draft, ownName) {
        var draftKeys = scheduleTargetKeys(draft.targetType, draft.targets);
        var draftWins = scheduleModel.windows(draft.weekdays || [], draft.timeRanges || [], scheduleDays);
        var match = null;

        safeUciSections('sheepfold', 'schedule').some(function (section) {
                var otherKeys;
                var otherWins;
                var sameTarget;

                if (section['.name'] === ownName || section.enabled === '0' || section.action === draft.action)
                        return false;
                otherKeys = scheduleTargetKeys(section.target_type || 'group', listOptionValues(section.targets));
                sameTarget = otherKeys.some(function (key) { return draftKeys.indexOf(key) !== -1; });
                // Сравниваем недельные окна, а не только одинаковые названия дней:
                // понедельник 22:00–02:00 пересекается со вторником 01:00–03:00.
                otherWins = scheduleModel.windows(listOptionValues(section.weekdays), scheduleModel.ranges(section, listOptionValues), scheduleDays);
                if (sameTarget && scheduleModel.windowsOverlap(draftWins, otherWins)) {
                        match = section.name || _('Unnamed schedule');
                        return true;
                }
                return false;
        });
        return match;
}

function showScheduleEditor(section, copyMode) {
        var ownName = !copyMode && section ? section['.name'] : '';
        var draft = {
                name: copyMode ? (section.name || '') + ' ' + _('copy') : section && section.name || '',
                description: section && section.description || '',
                enabled: section ? section.enabled !== '0' : true,
                action: section && section.action === 'allow' ? 'allow' : 'block',
                targetType: section && section.target_type === 'device' ? 'device' : 'group',
                targets: section ? listOptionValues(section.targets) : [],
                weekdays: section ? listOptionValues(section.weekdays) : ['mon', 'tue', 'wed', 'thu', 'fri'],
                timeRanges: section ? scheduleRanges(section) : [{ start: '21:00', end: '07:00' }]
        };
        var nameInput = E('input', { 'class': 'cbi-input-text', 'value': draft.name, 'maxlength': '80' });
        var descInput = E('textarea', { 'class': 'cbi-input-textarea', 'rows': '2', 'maxlength': '240' }, draft.description);
        var enabledBox = E('input', { 'type': 'checkbox', 'checked': draft.enabled ? 'checked' : null });
        var targetBox = E('div', { 'class': 'sf-schedule-targets' });
        var rangeBox = E('div', { 'class': 'sf-time-ranges' });
        var dayBox = E('div', { 'class': 'sf-day-row' });
        var preview = E('div', { 'class': 'sf-note sf-schedule-preview' });
        var modeSelect;

        function selectedDays() {
                return Array.prototype.slice.call(dayBox.querySelectorAll('[data-schedule-day]:checked')).map(function (node) {
                        return node.value;
                });
        }

        function updatePreview() {
                draft.name = nameInput.value.trim();
                draft.description = descInput.value.trim();
                draft.enabled = enabledBox.checked;
                draft.targetType = modeSelect.value;
                draft.weekdays = selectedDays();
                preview.textContent = (draft.action === 'allow' ? _('Allow internet') : _('Block internet')) +
                        ' · ' + (draft.enabled ? _('Enabled') : _('Disabled')) +
                        ' · ' + scheduleDayText({ weekdays: draft.weekdays }) +
                        ' · ' + scheduleTimeText({ time_ranges: draft.timeRanges.map(function (run) { return run.start + '-' + run.end; }) });
        }

        function renderTargets() {
                var entries;

                if (draft.targetType === 'group') {
                        entries = safeUciSections('sheepfold', 'group').map(function (group) {
                                return [group['.name'], group.name || group['.name']];
                        });
                } else {
                        entries = devices.filter(function (device) {
                                return !device.adminDevice && device.status !== 'allow' && device.status !== 'blocked';
                        }).map(function (device) {
                                return [String(device.id), formattedDeviceDisplayId(device) + ' ' + (device.name || device.mac)];
                        });
                }
                targetBox.replaceChildren.apply(targetBox, entries.map(function (item) {
                        return E('label', { 'class': 'sf-check-field' }, [
                                E('input', {
                                        'type': 'checkbox',
                                        'value': item[0],
                                        'checked': draft.targets.indexOf(item[0]) !== -1 ? 'checked' : null,
                                        'change': function () {
                                                draft.targets = Array.prototype.slice.call(targetBox.querySelectorAll('input:checked')).map(function (node) {
                                                        return node.value;
                                                });
                                                updatePreview();
                                        }
                                }),
                                E('span', {}, item[1])
                        ]);
                }));
                if (!entries.length)
                        targetBox.appendChild(E('p', { 'class': 'sf-muted' }, _('No suitable devices or groups.')));
        }

        function renderRanges() {
                rangeBox.replaceChildren.apply(rangeBox, draft.timeRanges.map(function (run, index) {
                        var startInput = E('input', { 'type': 'time', 'value': run.start });
                        var endInput = E('input', { 'type': 'time', 'value': run.end });

                        startInput.addEventListener('change', function () { run.start = startInput.value; updatePreview(); });
                        endInput.addEventListener('change', function () { run.end = endInput.value; updatePreview(); });
                        return E('div', { 'class': 'sf-time-row' }, [
                                startInput,
                                E('span', {}, '—'),
                                endInput,
                                E('button', {
                                        'class': 'sf-icon-btn sf-icon-danger',
                                        'title': _('Remove time interval'),
                                        'disabled': draft.timeRanges.length === 1 ? 'disabled' : null,
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                draft.timeRanges.splice(index, 1);
                                                renderRanges();
                                                updatePreview();
                                        }
                                }, '×')
                        ]);
                }));
        }

        function persistSchedule() {
                var secName = ownName || ensureSection('sheepfold', 'schedule', 'schedule_' + Date.now().toString(36));

                uci.set('sheepfold', secName, 'name', draft.name);
                uci.set('sheepfold', secName, 'description', draft.description);
                uci.set('sheepfold', secName, 'enabled', draft.enabled ? '1' : '0');
                uci.set('sheepfold', secName, 'action', draft.action);
                uci.set('sheepfold', secName, 'target_type', draft.targetType);
                setUciList(secName, 'targets', draft.targets);
                setUciList(secName, 'weekdays', draft.weekdays);
                setUciList(secName, 'time_ranges', draft.timeRanges.map(function (run) { return run.start + '-' + run.end; }));
                saveUciChanges(['sheepfold']).then(function () {
                        return routerControl(['schedule-sync']);
                }).then(function () {
                        ui.hideModal();
                        notify(_('Schedule saved.'), 'info');
                        refreshSchedulePanel();
                }, function () {
                        notify(_('Could not save schedule.'), 'warning');
                });
        }

        function validateAndSave() {
                var conflict;

                updatePreview();
                if (!draft.name || !draft.targets.length || !draft.weekdays.length || draft.timeRanges.some(function (run) {
                        return timeToMinutes(run.start) < 0 || timeToMinutes(run.end) < 0 || run.start === run.end;
                })) {
                        notify(_('Enter a name, select targets and days, and set a valid time interval.'), 'warning');
                        return;
                }
                conflict = scheduleHasConflict(draft, ownName);
                if (conflict) {
                        showScheduleConflictDisclaimer(persistSchedule,
                                _('This rule overlaps the opposite rule:') + ' «' + conflict + '». ' + scheduleConflictResultText());
                        return;
                }
                persistSchedule();
        }

        modeSelect = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        draft.targetType = ev.currentTarget.value;
                        draft.targets = [];
                        renderTargets();
                        updatePreview();
                }
        }, [
                E('option', { 'value': 'group', 'selected': draft.targetType === 'group' ? 'selected' : null }, _('Groups')),
                E('option', { 'value': 'device', 'selected': draft.targetType === 'device' ? 'selected' : null }, _('Individual devices'))
        ]);

        var actionNodes = ['allow', 'block'].map(function (action) {
                return E('label', { 'class': 'sf-action-choice sf-action-choice-' + action }, [
                        E('input', {
                                'type': 'radio',
                                'name': 'schedule_action',
                                'value': action,
                                'checked': draft.action === action ? 'checked' : null,
                                'change': function () { draft.action = action; updatePreview(); }
                        }),
                        E('span', {}, action === 'allow' ? _('Allow internet') : _('Block internet'))
                ]);
        });
        var dayNodes = scheduleDays.map(function (item) {
                return E('label', { 'class': 'sf-day-chip' }, [
                        E('input', {
                                'type': 'checkbox',
                                'data-schedule-day': '1',
                                'value': item[0],
                                'checked': draft.weekdays.indexOf(item[0]) !== -1 ? 'checked' : null,
                                'change': updatePreview
                        }),
                        E('span', {}, _(item[1]))
                ]);
        });
        dayBox.replaceChildren.apply(dayBox, dayNodes);

        nameInput.addEventListener('input', updatePreview);
        descInput.addEventListener('input', updatePreview);
        enabledBox.addEventListener('change', updatePreview);
        renderTargets();
        renderRanges();
        updatePreview();

        ui.showModal(ownName ? _('Edit schedule') : _('Add schedule'), [
                E('div', { 'class': 'sf-schedule-editor' }, [
                        E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Schedule name')), nameInput]),
                        E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Description')), descInput]),
                        E('label', { 'class': 'sf-toggle-line' }, [enabledBox, E('span', {}, _('Schedule enabled'))]),
                        E('div', { 'class': 'sf-action-choices' }, actionNodes),
                        E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, _('Apply to')), modeSelect]),
                        targetBox,
                        E('strong', {}, _('Days of week')),
                        dayBox,
                        E('strong', {}, _('Time intervals')),
                        rangeBox,
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        draft.timeRanges.push({ start: '15:00', end: '16:00' });
                                        renderRanges();
                                        updatePreview();
                                }
                        }, _('Add time interval')),
                        preview
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
                        E('button', { 'class': 'btn cbi-button-positive', 'click': validateAndSave }, _('Save'))
                ])
        ]);
}

function setScheduleEnabled(section, enabled) {
        uci.set('sheepfold', section['.name'], 'enabled', enabled ? '1' : '0');
        saveUciChanges(['sheepfold']).then(function () {
                return routerControl(['schedule-sync']);
        }).then(function () {
                notify(enabled ? _('Schedule enabled.') : _('Schedule disabled.'), 'info');
                refreshSchedulePanel();
        }, function () {
                notify(_('Could not change schedule state.'), 'warning');
        });
}

function deleteSchedule(section) {
        if (!window.confirm(_('Delete schedule?') + ' «' + (section.name || _('Unnamed schedule')) + '»'))
                return;
        uci.remove('sheepfold', section['.name']);
        saveUciChanges(['sheepfold']).then(function () {
                return routerControl(['schedule-sync']);
        }).then(function () {
                notify(_('Schedule deleted.'), 'info');
                refreshSchedulePanel();
        }, function () {
                notify(_('Could not delete schedule.'), 'warning');
        });
}

function bedtimeEditor() {
        var saved = safeUciGet('sheepfold', 'global', 'bedtime', '21:00');
        var timeInput = E('input', { 'type': 'time', 'value': saved });

        return E('div', { 'class': 'sf-bedtime-row' }, [
                E('label', { 'class': 'sf-field' }, [
                        E('span', {}, _('Default bedtime')),
                        timeInput,
                        E('small', {}, _('Used by the "until bedtime" quick action.'))
                ]),
                E('button', {
                        'class': 'sf-action sf-action-positive',
                        'click': function (ev) {
                                ev.preventDefault();
                                if (timeToMinutes(timeInput.value) < 0) {
                                        notify(_('Enter a valid bedtime.'), 'warning');
                                        return;
                                }
                                uci.set('sheepfold', 'global', 'bedtime', timeInput.value);
                                saveUciChanges(['sheepfold']).then(function () {
                                        notify(_('Bedtime saved.'), 'info');
                                }, function () {
                                        notify(_('Could not save bedtime.'), 'warning');
                                });
                        }
                }, _('Save'))
        ]);
}

function showGroupSettingsModal(groupName, section, onSave) {
        var nameField = inputControl(_('Group name'), groupName, section && section.protected === '1' ? { 'readonly': 'readonly' } : {});
        var colorField = inputControl(_('Group color'), groupColor(groupName, section), { 'type': 'color' });
        var currentDeviceIds = devices.filter(function (device) {
                return normalizeGroupName(device.group) === groupName;
        }).map(function (device) {
                return device.id;
        });
        var deviceSelector = createDeviceSelectionBox({
                selectedIds: currentDeviceIds
        });
        var scheduleSelector = scheduleCheckboxes(listOptionValues(section && section.schedules));
        var allowlistOnlyField = checkboxControl(
                _('Allow only selected whitelist sources for this group'),
                section && section.allowlist_only === '1',
                _('Devices in this group will be limited to domains from the selected whitelist sources and manually allowed emergency-useful sites.')
        );
        /* SHEEPFOLD_AI_BEGIN */
        var activityLogField = checkboxControl(
                _('Enable activity journal for all devices in this group'),
                section && section.activity_log_enabled === '1',
                _('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
        /* SHEEPFOLD_AI_END */
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        function saveGroupSettings() {
                var oldName = groupName;
                var newName = normalizeGroupName(nameField.input.value.trim());
                var color = colorField.input.value;
                var sectionName;
                var selectedDevices;
                var membershipChanges;
                var changesByMac = {};
                var selectedSchedules = scheduleSelector.values();

                conflictNote.hidden = true;
                conflictNote.textContent = '';

                if (!newName) {
                        showError(_('Group name is required.'));
                        return;
                }

                if (newName !== oldName && safeUciSections('sheepfold', 'group').some(function (item) {
                        return normalizeGroupName(item.name || item['.name']) === newName;
                })) {
                        showError(_('This group already exists.'));
                        return;
                }

                if (!validGroupColor(color))
                        color = groupAutoColor(newName);

                selectedDevices = deviceSelector.selectedDevices();
                membershipChanges = groupModel.membershipChanges(
                        devices,
                        oldName,
                        newName,
                        selectedDevices.map(function (device) { return device.id; }),
                        normalizeGroupName
                );
                membershipChanges.forEach(function (change) {
                        changesByMac[normalizeMac(change.device.mac)] = change;
                });
                sectionName = ensureGroupSection(oldName, section);
                uci.set('sheepfold', sectionName, 'name', newName);
                uci.set('sheepfold', sectionName, 'color', color);
                uci.set('sheepfold', sectionName, 'schedules', selectedSchedules);
                uci.set('sheepfold', sectionName, 'allowlist_only', allowlistOnlyField.input.checked ? '1' : '0');
                /* SHEEPFOLD_AI_BEGIN */
                uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');
                /* SHEEPFOLD_AI_END */
                if (!section)
                        uci.set('sheepfold', sectionName, 'protected', '0');

                safeUciSections('sheepfold', 'device').forEach(function (deviceSection) {
                        var change = changesByMac[normalizeMac(deviceSection.mac)];

                        if (change) {
                                uci.set('sheepfold', deviceSection['.name'], 'group', change.nextGroup || NOT_CONFIGURED_GROUP);

                                if (oldName === noRestrictionsGroupName() && !change.linked)
                                        markNoRestrictionsAutoExcluded(deviceSection['.name']);
                                if (oldName === personalDevicesGroupName() && !change.linked)
                                        markPersonalDevicesAutoExcluded(deviceSection['.name']);
                        }
                });

                selectedDevices.forEach(function (device) {
                        var sectionDeviceName = ensureSheepfoldDeviceSection(device);

                        uci.set('sheepfold', sectionDeviceName, 'mac', normalizeMac(device.mac));
                        uci.set('sheepfold', sectionDeviceName, 'name', device.name || device.mac);
                        uci.set('sheepfold', sectionDeviceName, 'ip', device.ip || '');
                        uci.set('sheepfold', sectionDeviceName, 'group', newName);
                        if (oldName === noRestrictionsGroupName() && newName !== noRestrictionsGroupName())
                                markNoRestrictionsAutoExcluded(sectionDeviceName);
                        if (oldName === personalDevicesGroupName() && newName !== personalDevicesGroupName())
                                markPersonalDevicesAutoExcluded(sectionDeviceName);
                });

                saveSheepfoldAccessChanges().then(function () {
                        // Карточки групп читают локальный inventory. Синхронизируем его после
                        // успешного commit, чтобы обновить только панель и не перезагружать LuCI.
                        membershipChanges.forEach(function (change) {
                                change.device.group = change.nextGroup || NOT_CONFIGURED_GROUP;
                        });
                        notify(_('Group saved.'), 'info');
                        if (onSave)
                                onSave();
                        ui.hideModal();
                }, function () {
                        notify(_('Could not save group.'), 'warning');
                });
        }

        ui.showModal(_('Group settings'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                colorField.node
                        ]),
                        E('strong', {}, _('Group schedules')),
                        scheduleSelector.node,
                        allowlistOnlyField.node,
                        /* SHEEPFOLD_AI_BEGIN */
                        activityLogField ? activityLogField.node : '',
                        /* SHEEPFOLD_AI_END */
                        E('strong', {}, _('Assigned devices')),
                        deviceSelector.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        if (schedulesConflict(scheduleSelector.values())) {
                                                showScheduleConflictDisclaimer(saveGroupSettings);
                                                return;
                                        }

                                        saveGroupSettings();
                                }
                        }, _('Save'))
                ])
        ]);
}

function showAddGroupModal(existingNames, onSave) {
        var nameField = inputControl(_('Group name'), '');
        var colorField = inputControl(_('Group color'), nextAvailableGroupColor(_('Custom')), { 'type': 'color' }, _('Automatic color'));
        var personalField = checkboxControl(_('Personal group'), false, _('Only devices belonging to one person can be added to this group.'));
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        ui.showModal(_('Add group'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                colorField.node
                        ]),
                        personalField.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var groupName = normalizeGroupName(nameField.input.value.trim());
                                        var color = colorField.input.value;
                                        var sectionName;

                                        conflictNote.hidden = true;
                                        conflictNote.textContent = '';

                                        if (!groupName) {
                                                showError(_('Group name is required.'));
                                                return;
                                        }

                                        if (existingNames[groupName]) {
                                                showError(_('This group already exists.'));
                                                return;
                                        }

                                        if (!validGroupColor(color))
                                                color = nextAvailableGroupColor(groupName);

                                        sectionName = ensureGroupSection(groupName, null);
                                        uci.set('sheepfold', sectionName, 'name', groupName);
                                        uci.set('sheepfold', sectionName, 'color', color);
                                        uci.set('sheepfold', sectionName, 'protected', '0');
                                        uci.set('sheepfold', sectionName, 'auto_assignable', '0');
                                        uci.set('sheepfold', sectionName, 'allowlist_only', '0');
                                        /* SHEEPFOLD_AI_BEGIN */
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
                                        /* SHEEPFOLD_AI_END */
                                        uci.set('sheepfold', sectionName, 'personal', personalField.input.checked ? '1' : '0');

                                        saveUciChanges(['sheepfold']).then(function () {
                                                notify(_('Group created.'), 'info');
                                                if (onSave)
                                                        onSave();
                                                ui.hideModal();
                                        }, function () {
                                                notify(_('Could not create group.'), 'warning');
                                        });
                                }
                        }, _('Save'))
                ])
        ]);
}

function nextAdminId() {
        return administratorModel.nextId(admins, idNumber);
}

function loadAdministratorsFromUci() {
        var sections = safeUciSections('sheepfold', 'administrator');

        if (!sections.length)
                return;

        admins = administratorModel.fromSections(sections, devices, idNumber);
}

function stageAdministrator(admin) {
        var sectionName = administratorSectionName(admin);

        uci.set('sheepfold', sectionName, 'id', String(admin.id));
        uci.set('sheepfold', sectionName, 'display_name', admin.name || '');
        uci.set('sheepfold', sectionName, 'login', admin.login || '');
        uci.set('sheepfold', sectionName, 'allow_child_access_requests', admin.allowChildAccessRequests ? '1' : '0');
        // Роль остаётся внутренней защитной меткой backend и не показывается родителю в UI.
        uci.set('sheepfold', sectionName, 'role', admin.login === 'SuperParent' ? 'owner' : 'admin');
}

function adminLoginExists(login) {
        return administratorModel.loginExists(admins, login);
}

function adminTableRow(admin) {
        var devicesCell = E('div', {}, adminDeviceList(admin));

        return E('div', {
                'class': 'sf-admin-row',
                'data-admin-login': admin.login || '',
                'data-sort-name': admin.name || '',
                'data-sort-login': admin.login || ''
        }, [
                E('div', {}, [
                        E('strong', {}, admin.name)
                ]),
                E('div', { 'class': 'sf-mono' }, admin.login),
                devicesCell,
                E('div', { 'class': 'sf-row-actions' }, [
                        iconButton(_('Configure'), 'gear', 'neutral', function () {
                                showAdminSettingsModal(admin);
                        }),
                        iconButton(_('Bind devices'), 'link', 'neutral', function () {
                                showAdminDeviceBindingModal(admin, function () {
                                        devicesCell.replaceChildren(adminDeviceList(admin));
                                });
                        })
                ])
        ]);
}

function showAddAdministratorModal(onAdd) {
        var nameField = inputControl(_('Admin name'), '');
        var loginField = inputControl(_('Login'), '');
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });
        var assignedToAnyAdmin = adminAssignedDeviceIds(null);
        var selector = createDeviceSelectionBox({
                filter: function (device) {
                        return adminDeviceCanBeBound(device) && !assignedToAnyAdmin[device.id];
                }
        });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        function saveAdministrator() {
                var name = nameField.input.value.trim();
                var login = loginField.input.value.trim();
                var admin;

                conflictNote.hidden = true;
                conflictNote.textContent = '';

                if (!name || !login) {
                        showError(_('Name and login are required.'));
                        return;
                }

                if (adminLoginExists(login)) {
                        showError(_('This login is already used.'));
                        return;
                }

                admin = {
                        id: nextAdminId(),
                        name: name,
                        login: login,
                        deviceIds: selector.selectedIds(),
                        temporaryPassword: generatePairingCode(),
                        allowChildAccessRequests: false
                };

                admins.push(admin);
                stageAdministrator(admin);
                applyAdminDeviceBindings(admin, selector.selectedDevices(), []).then(function () {
                        if (onAdd)
                                onAdd(admin);
                        notify(_('Administrator added.'), 'info');
                        ui.hideModal();
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
                }, function (error) {
                        notify(error && error.message ? error.message : _('Could not save device settings.'), 'warning');
                });
        }

        function modalActions() {
                return E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        saveAdministrator();
                                }
                        }, _('Save'))
                ]);
        }

        ui.showModal(_('Add administrator'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                loginField.node
                        ]),
                        modalActions(),
                        E('strong', {}, _('Assigned devices')),
                        selector.node
                ]),
                modalActions()
        ]);
}

function showAdminDeviceBindingModal(admin, onSave) {
        var assignedToOtherAdmin = adminAssignedDeviceIds(admin);
        var selector = createDeviceSelectionBox({
                selectedIds: admin.deviceIds || [],
                filter: function (device) {
                        return adminDeviceCanBeBound(device) && !assignedToOtherAdmin[device.id];
                }
        });
        var actionRow;

        function saveBindings() {
                var previousIds = admin.deviceIds || [];
                var selectedDevices = selector.selectedDevices();

                admin.deviceIds = selector.selectedIds();
                applyAdminDeviceBindings(admin, selectedDevices, previousIds).then(function () {
                        if (onSave)
                                onSave();
                        ui.hideModal();
                        notify(_('Device bindings saved.'), 'info');
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
                }, function (error) {
                        admin.deviceIds = previousIds;
                        notify(error && error.message ? error.message : _('Could not save device settings.'), 'warning');
                });
        }

        function modalActions() {
                return E('div', { 'class': 'sf-modal-actions right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': saveBindings
                        }, _('Save'))
                ]);
        }

        actionRow = modalActions();

        ui.showModal(_('Assign devices to administrator') + ' ' + admin.name, [
                E('div', { 'class': 'sf-binding-modal' }, [
                        E('div', { 'class': 'sf-section-intro' }, [
                                E('p', {}, _('Select administrator devices') + ' ' + admin.name + '. ' + _('Selected administrator devices can manage Sheepfold.')),
                                E('p', {}, _('Blocklisted devices are not available for binding.')),
                                /* SHEEPFOLD_AI_BEGIN */
                                E('p', {}, _('When a device is assigned to an administrator, Sheepfold removes it from ordinary groups and schedules, disables activity logging for it, and adds it to the allowlist.')),
                                /* SHEEPFOLD_AI_END */
                                E('p', {}, _('Administrator devices are removed from ordinary groups and schedules and added to the allowlist.'))
                        ]),
                        actionRow,
                        selector.node
                ]),
                modalActions()
        ]);
}

function showDeviceSettingsModal(device) {
        var knownGroups = sheepfoldGroupOptions();
        var knownGroupValues = knownGroups.map(function (item) { return item[0]; });
        var groupIsCustom = device.group && knownGroupValues.indexOf(device.group) === -1;
        var nameField = inputControl(_('Device name'), device.name);
        var ipField = inputControl(_('IP address'), device.ip);
        var groupField = selectControl(_('Group'), groupIsCustom ? '__custom' : device.group, knownGroups.concat([
                ['__custom', _('Custom')]
        ]));
        var customGroupField = inputControl(_('Use custom group'), groupIsCustom ? device.group : '');
        var typeField = deviceTypeSelectControl(_('Device type'), displayDeviceType(device));
        var statusField = selectControl(_('Access mode'), device.status, [
                ['new', _('Not configured')],
                ['allow', _('Allowlist')],
                ['blocked', _('Blocklist')],
                ['scheduled', _('Scheduled')],
                ['restricted', _('Restricted')]
        ]);
        var staticLeaseField = checkboxControl(
                device.staticLease ? _('Permanent DHCP lease') : _('Create permanent DHCP lease'),
                device.staticLease,
                device.staticLease ? _('Existing permanent DHCP lease will be updated, not removed.') : '',
                device.staticLease ? { 'disabled': 'disabled' } : null
        );
        /* SHEEPFOLD_AI_BEGIN */
        var activityLogField = checkboxControl(
                _('Enable activity journal for this device'),
                device.activityLogEnabled,
                _('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
        /* SHEEPFOLD_AI_END */
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });
        var infoLines = E('div', { 'class': 'sf-device-info-lines' }, [
                settingLine(_('ID'), formattedDeviceDisplayId(device)),
                settingLine(_('MAC address'), device.mac),
                settingLine(_('Hostname'), device.hostname || '-'),
                settingLine(_('Detection source'), device.sourceLabel || '-')
        ]);

        function updateCustomGroupVisibility() {
                customGroupField.node.hidden = groupField.input.value === '__custom' ? null : 'hidden';
        }

        groupField.input.addEventListener('change', updateCustomGroupVisibility);
        updateCustomGroupVisibility();

        ui.showModal(_('Device settings'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        infoLines,
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                ipField.node,
                                typeField.node,
                                groupField.node,
                                customGroupField.node,
                                statusField.node,
                                staticLeaseField.node,
                                /* SHEEPFOLD_AI_BEGIN */
                                activityLogField.node
                                /* SHEEPFOLD_AI_END */
                        ])
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, _('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var sectionName;
                                        var staticSectionName;
                                        var name = nameField.input.value.trim() || device.name;
                                        var ip = ipField.input.value.trim();
                                        var group = groupField.input.value === '__custom' ?
                                                customGroupField.input.value.trim() :
                                                groupField.input.value;
                                        var oldGroup = normalizeGroupName(device.group);
                                        var newGroup = normalizeGroupName(group || NOT_CONFIGURED_GROUP);
                                        var deviceType = typeField.input.value;
                                        var status = statusField.input.value;
                                        var configs = ['sheepfold'];

                                        conflictNote.hidden = true;
                                        conflictNote.textContent = '';

                                        if (status === 'allow' && macInSheepfoldList('blocklist', device.mac)) {
                                                conflictNote.textContent = _('This device is already in the blocklist. Remove it from the blocklist before adding it to the allowlist.');
                                                conflictNote.hidden = false;
                                                return;
                                        }

                                        if (status === 'blocked' && macInSheepfoldList('allowlist', device.mac)) {
                                                conflictNote.textContent = _('This device is already in the allowlist. Remove it from the allowlist before adding it to the blocklist.');
                                                conflictNote.hidden = false;
                                                return;
                                        }

                                        if (staticLeaseField.input.checked && !ip) {
                                                notify(_('Static lease requires an IP address.'), 'warning');
                                                return;
                                        }

                                        sectionName = ensureSheepfoldDeviceSection(device);
                                        uci.set('sheepfold', sectionName, 'mac', device.mac);
                                        uci.set('sheepfold', sectionName, 'name', name);
                                        uci.set('sheepfold', sectionName, 'ip', ip);
                                        uci.set('sheepfold', sectionName, 'group', newGroup);
                                        uci.set('sheepfold', sectionName, 'device_type', deviceType);
                                        uci.set('sheepfold', sectionName, 'manual_device_type', deviceType === 'unknown' ? '0' : '1');
                                        uci.set('sheepfold', sectionName, 'status', status);
                                        /* SHEEPFOLD_AI_BEGIN */
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');
                                        /* SHEEPFOLD_AI_END */

                                        if (oldGroup === noRestrictionsGroupName() && newGroup !== noRestrictionsGroupName())
                                                markNoRestrictionsAutoExcluded(sectionName);

                                        if (status === 'allow')
                                                updateMacList('allowlist', device.mac, true);
                                        else if (status !== 'blocked')
                                                updateMacList('allowlist', device.mac, false);

                                        if (status === 'blocked')
                                                updateMacList('blocklist', device.mac, true);
                                        else if (status !== 'allow')
                                                updateMacList('blocklist', device.mac, false);

                                        if (staticLeaseField.input.checked) {
                                                staticSectionName = ensureStaticDhcpSection(device);
                                                uci.set('dhcp', staticSectionName, 'mac', device.mac);
                                                uci.set('dhcp', staticSectionName, 'ip', ip);
                                                uci.set('dhcp', staticSectionName, 'name', name);
                                                configs.push('dhcp');
                                        }

                                        saveUciChanges(configs.filter(function (config, index) {
                                                return configs.indexOf(config) === index;
                                        })).then(function () {
                                                return routerControl(['schedule-sync']).then(function (result) {
                                                        return ensureRouterControlOk(result, _('Could not apply internet access rules.'));
                                                });
                                        }).then(function () {
                                                notify(_('Device settings saved.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function () {
                                                notify(_('Could not save device settings.'), 'warning');
                                        });
                                }
                        }, _('Save'))
                ])
        ]);
}

function deviceTable(rows, options) {
        options = options || {};

        var tableRows = rows.map(function (device, index) {
                var adminDevice = isAdminDevice(device);
                var displayType = displayDeviceType(device);
                var type = deviceTypeByValue(displayType);

                return E('div', {
                        'class': 'sf-device-row',
                        'data-sort-id': String(index + 1),
                        'data-sort-device': device.name || '',
                        'data-sort-type': type.label || '',
                        'data-sort-ip': String(ipSortValue(device.ip)),
                        'data-sort-group': normalizeGroupName(device.group) || '',
                        'data-sort-status': device.status || '',
                        'data-search': [device.id, device.mac, device.hostname, device.note, type.label].join(' ')
                }, [
                        E('div', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                        E('div', { 'class': 'sf-device-name' }, [
                                         E('strong', {}, [
                                                 adminDevice ? adminCrownIcon() : '',
                                                 E('span', {}, device.name)
                                          ]),
                                         E('small', {}, device.note)
                          ]),
                        E('div', { 'class': 'sf-device-type-cell' }, deviceTypeIcon(displayType)),
                        E('div', { 'class': 'sf-ip-cell' }, [
                                E('span', {}, device.ip || '-'),
                                device.staticLease ? staticLeaseIcon() : ''
                        ]),
                        E('div', { 'class': 'sf-mono' }, device.mac),
                        E('div', {}, displayGroupName(device.group)),
                        E('div', { 'class': 'sf-status-stack' }, [
                                device.statusBadge ? badge(device.statusBadge) : '',
                                /* SHEEPFOLD_AI_BEGIN */
                                device.activityLogEnabled ? badge('journal') : ''
                                /* SHEEPFOLD_AI_END */
                        ]),
                        E('div', { 'class': 'sf-row-actions' }, [
                                iconButton(_('Configure'), 'gear', 'neutral', function () {
                                        showDeviceSettingsModal(device);
                                }),
                                options.removeFromList ?
                                        iconButton(
                                                options.removeFromList === 'allowlist' ? _('Remove from allowlist') : _('Remove from blocklist'),
                                                'trash',
                                                'danger',
                                                function () {
                                                        removeDeviceFromAccessList(device, options.removeFromList);
                                                }
                                        ) :
                                        '',
                                options.compact || adminDevice || device.status === 'allow' || device.status === 'blocked' ?
                                        '' :
                                        E('button', {
                                                'class': 'sf-action sf-action-positive',
                                                'click': function (ev) {
                                                        ev.preventDefault();
                                                        grantDeviceTemporaryAccess(device, 30);
                                                }
                                        }, _('+30 min'))
                        ])
                ]);
        });

        return E('div', { 'class': 'sf-device-table' }, [
                E('div', { 'class': 'sf-device-row sf-device-head' }, [
                        E('div', {}, deviceSortHeader(_('ID'), 'id')),
                        E('div', {}, deviceSortHeader(_('Device'), 'device')),
                        E('div', {}, deviceSortHeader(_('Type'), 'type')),
                        E('div', {}, deviceSortHeader(_('IP address'), 'ip')),
                        E('div', {}, _('MAC address')),
                        E('div', {}, deviceSortHeader(_('Group'), 'group')),
                        E('div', {}, deviceSortHeader(_('Status'), 'status')),
                        E('div', {}, _('Actions'))
                ])
        ].concat(tableRows));
}

function field(label, value, hint) {
        return sharedForms.field(label, value, hint);
}

function selectField(label, value, values, hint) {
        return sharedForms.selectField(label, value, values, hint);
}

function textareaField(label, value, hint) {
        return sharedForms.textareaField(label, value, hint);
}

function globalTextareaOptionField(label, option, defaultValue, savedMessage, errorMessage, hint, rows) {
        var textareaRows = rows || 5;
        var textarea = E('textarea', {
                'class': 'cbi-input-textarea' + (textareaRows <= 2 ? ' sf-textarea-compact' : ''),
                'rows': textareaRows
        }, settingValue(option, defaultValue || ''));

        textarea.addEventListener('input', function () {
                setSettingsDraftOption(option, textarea.value.trim());
        });
        textarea.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                        ev.preventDefault();
                        setSettingsDraftOption(option, textarea.value.trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                textarea,
                hint ? E('small', {}, hint) : ''
        ]);
}

function logStorageStatusView() {
        var lamp = E('span', { 'class': 'sf-storage-status-lamp warn' });
        var text = E('span', { 'class': 'sf-storage-status-text' }, _('Checking storage status...'));

        function applyStatus(payload) {
                var state = payload && payload.state ? payload.state : 'error';

                lamp.className = 'sf-storage-status-lamp ' + (state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : 'error');
                text.textContent = payload && payload.message ? payload.message : _('Could not read storage status.');
        }

        function refresh() {
                text.textContent = _('Checking storage status...');
                lamp.className = 'sf-storage-status-lamp warn';

                return routerControl(['log-storage-status']).then(function (result) {
                        var code = Number(result && result.code || 0);
                        var payload = null;

                        if (code === 0) {
                                try {
                                        payload = JSON.parse(String(result.stdout || '').trim() || '{}');
                                } catch (error) {
                                        payload = null;
                                }
                        }

                        applyStatus(payload || { state: 'error', message: _('Could not read storage status.') });
                }, function () {
                        applyStatus({ state: 'error', message: _('Could not read storage status.') });
                });
        }

        return {
                node: E('span', { 'class': 'sf-storage-status' }, [lamp, text]),
                refresh: refresh
        };
}

function parseRouterJsonOutput(result) {
        var code = Number(result && result.code || 0);

        if (code !== 0)
                return null;

        try {
                return JSON.parse(String(result.stdout || '').trim() || '{}');
        } catch (error) {
                return null;
        }
}

function formatYandexSyncAge(at) {
        var parsed;

        if (!at)
                return '';

        parsed = Date.parse(String(at).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
        if (isNaN(parsed))
                return String(at);

        var diffSec = Math.max(0, Math.round((Date.now() - parsed) / 1000));

        if (diffSec < 60)
                return _('just now');
        if (diffSec < 3600)
                return String(Math.floor(diffSec / 60)) + ' ' + _('min ago');
        if (diffSec < 86400)
                return String(Math.floor(diffSec / 3600)) + ' ' + _('h ago');

        return String(Math.floor(diffSec / 86400)) + ' ' + _('d ago');
}

function yandexDiskMaintenancePanel() {
        var statusNode = E('div', { 'class': 'sf-yandex-disk-actions-status sf-note' });
        var syncStatusNode = E('div', { 'class': 'sf-yandex-disk-sync-status sf-muted' });
        var listNode = E('div', { 'class': 'sf-yandex-disk-file-list' });
        var backupSelect = E('select', { 'class': 'cbi-input-select sf-yandex-disk-backup-select' }, [
                E('option', { value: '' }, _('Latest backup'))
        ]);

        function setStatus(message, tone) {
                statusNode.textContent = message || '';
                statusNode.className = 'sf-yandex-disk-actions-status sf-note' +
                        (tone ? ' sf-note-' + tone : '');
        }

        function renderSyncStatus(payload) {
                var when;
                var line;

                if (!payload) {
                        syncStatusNode.textContent = _('Could not read Yandex Disk sync status.');
                        syncStatusNode.className = 'sf-yandex-disk-sync-status sf-note sf-note-warning';
                        return;
                }

                if (payload.ok === false && payload.message === 'no sync yet') {
                        syncStatusNode.textContent = _('No sync to Yandex Disk yet.');
                        syncStatusNode.className = 'sf-yandex-disk-sync-status sf-muted';
                        return;
                }

                when = formatYandexSyncAge(payload.at);
                line = _('Last Yandex Disk sync:') + ' ' + (when || infoValue(payload.at)) +
                        (payload.message ? ' — ' + payload.message : '');

                syncStatusNode.textContent = line;
                syncStatusNode.className = 'sf-yandex-disk-sync-status sf-note' +
                        (payload.ok ? ' sf-note-info' : ' sf-note-warning');
        }

        function refreshSyncStatus() {
                routerControl(['yandex-disk-sync-status']).then(function (result) {
                        renderSyncStatus(parseRouterJsonOutput(result));
                }, function () {
                        renderSyncStatus(null);
                });
        }

        function populateBackupSelect(backups) {
                var sorted = (backups || []).slice().sort(function (a, b) {
                        return String(b.name || '').localeCompare(String(a.name || ''));
                });

                backupSelect.replaceChildren(E('option', { value: '' }, _('Latest backup')));
                sorted.forEach(function (item) {
                        backupSelect.appendChild(E('option', { value: item.name }, item.name));
                });
        }

        function restoreSelectedBackup() {
                var selected = backupSelect.value || '';
                var confirmMessage = selected ?
                        _('Restore Sheepfold settings from configuration backup %s on Yandex Disk?').replace('%s', selected) :
                        _('Restore Sheepfold settings from the latest configuration backup on Yandex Disk?');

                if (!window.confirm(confirmMessage))
                        return;

                setStatus(_('Restoring configuration from Yandex Disk...'));

                routerControl(selected ?
                        ['yandex-disk-restore-config', selected] :
                        ['yandex-disk-restore-config']
                ).then(function (result) {
                        var payload = parseRouterJsonOutput(result);

                        if (payload && payload.ok) {
                                setStatus(
                                        _('Configuration restored from Yandex Disk:') + ' ' +
                                                infoValue(payload.restored),
                                        'info'
                                );
                                refreshSyncStatus();
                                window.setTimeout(function () {
                                        window.location.reload();
                                }, 1200);
                                return;
                        }

                        setStatus(_('Could not restore configuration from Yandex Disk.'), 'warning');
                }, function () {
                        setStatus(_('Could not restore configuration from Yandex Disk.'), 'warning');
                });
        }

        function renderFileList(payload) {
                if (!payload || !payload.ok) {
                        listNode.replaceChildren(E('div', { 'class': 'sf-muted' }, _('Could not read Yandex Disk file list.')));
                        return;
                }

                populateBackupSelect(payload.backups || []);
                listNode.replaceChildren.apply(listNode, [
                        [_('Logs on Yandex Disk'), payload.logs || []],
                        [_('Configuration backups on Yandex Disk'), payload.backups || []]
                ].map(function (section) {
                        var items = section[1];

                        return E('div', { 'class': 'sf-yandex-disk-file-group' }, [
                                E('strong', {}, section[0]),
                                items.length ?
                                        E('ul', {}, items.map(function (item) {
                                                var sizeKb = Math.max(1, Math.round((item.bytes || 0) / 1024));

                                                return E('li', {}, item.name + ' (' + sizeKb + ' KB)');
                                        })) :
                                        E('div', { 'class': 'sf-muted' }, _('No files'))
                        ]);
                }));
        }

        window.setTimeout(refreshSyncStatus, 0);

        return E('div', { 'class': 'sf-yandex-disk-actions' }, [
                E('div', { 'class': 'sf-toolbar sf-yandex-disk-toolbar' }, [
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        setStatus(_('Testing Yandex Disk login...'));

                                        routerControl(['yandex-disk-test']).then(function (result) {
                                                var payload = parseRouterJsonOutput(result);

                                                if (payload && payload.ok)
                                                        setStatus(payload.message || _('Yandex Disk login works.'), 'info');
                                                else
                                                        setStatus(_('Yandex Disk login failed.'), 'warning');
                                        }, function () {
                                                setStatus(_('Yandex Disk login failed.'), 'warning');
                                        });
                                }
                        }, _('Test Yandex Disk login')),
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        setStatus(_('Loading file list from Yandex Disk...'));

                                        routerControl(['yandex-disk-list']).then(function (result) {
                                                var payload = parseRouterJsonOutput(result);

                                                renderFileList(payload);
                                                if (payload && payload.ok)
                                                        setStatus(_('Yandex Disk file list updated.'), 'info');
                                                else
                                                        setStatus(_('Could not read Yandex Disk file list.'), 'warning');
                                        }, function () {
                                                setStatus(_('Could not read Yandex Disk file list.'), 'warning');
                                        });
                                }
                        }, _('Show files on disk')),
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        refreshSyncStatus();
                                }
                        }, _('Refresh sync status'))
                ]),
                syncStatusNode,
                E('div', { 'class': 'sf-yandex-disk-restore-row' }, [
                        backupSelect,
                        E('button', {
                                'class': 'sf-action sf-action-positive',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        restoreSelectedBackup();
                                }
                        }, _('Restore configuration backup'))
                ]),
                statusNode,
                listNode
        ]);
}

function googleDiskMaintenancePanel() {
        var statusNode = E('div', { 'class': 'sf-google-drive-actions-status sf-note' });
        var syncStatusNode = E('div', { 'class': 'sf-google-drive-sync-status sf-muted' });
        var listNode = E('div', { 'class': 'sf-google-drive-file-list' });
        var backupSelect = E('select', { 'class': 'cbi-input-select sf-google-drive-backup-select' }, [
                E('option', { value: '' }, _('Latest backup'))
        ]);

        function setStatus(message, tone) {
                statusNode.textContent = message || '';
                statusNode.className = 'sf-google-drive-actions-status sf-note' +
                        (tone ? ' sf-note-' + tone : '');
        }

        function renderSyncStatus(payload) {
                var when;
                var line;

                if (!payload) {
                        syncStatusNode.textContent = _('Could not read Google Drive sync status.');
                        syncStatusNode.className = 'sf-google-drive-sync-status sf-note sf-note-warning';
                        return;
                }

                if (payload.ok === false && payload.message === 'no sync yet') {
                        syncStatusNode.textContent = _('No sync to Google Drive yet.');
                        syncStatusNode.className = 'sf-google-drive-sync-status sf-muted';
                        return;
                }

                when = formatYandexSyncAge(payload.at);
                line = _('Last Google Drive sync:') + ' ' + (when || infoValue(payload.at)) +
                        (payload.message ? ' — ' + payload.message : '');

                syncStatusNode.textContent = line;
                syncStatusNode.className = 'sf-google-drive-sync-status sf-note' +
                        (payload.ok ? ' sf-note-info' : ' sf-note-warning');
        }

        function refreshSyncStatus() {
                routerControl(['google-drive-sync-status']).then(function (result) {
                        renderSyncStatus(parseRouterJsonOutput(result));
                }, function () {
                        renderSyncStatus(null);
                });
        }

        function populateBackupSelect(backups) {
                var sorted = (backups || []).slice().sort(function (a, b) {
                        return String(b.name || '').localeCompare(String(a.name || ''));
                });

                backupSelect.replaceChildren(E('option', { value: '' }, _('Latest backup')));
                sorted.forEach(function (item) {
                        backupSelect.appendChild(E('option', { value: item.name }, item.name));
                });
        }

        function restoreSelectedBackup() {
                var selected = backupSelect.value || '';
                var confirmMessage = selected ?
                        _('Restore Sheepfold settings from configuration backup %s on Google Drive?').replace('%s', selected) :
                        _('Restore Sheepfold settings from the latest configuration backup on Google Drive?');

                if (!window.confirm(confirmMessage))
                        return;

                setStatus(_('Restoring configuration from Google Drive...'));

                routerControl(selected ?
                        ['google-drive-restore-config', selected] :
                        ['google-drive-restore-config']
                ).then(function (result) {
                        var payload = parseRouterJsonOutput(result);

                        if (payload && payload.ok) {
                                setStatus(
                                        _('Configuration restored from Google Drive:') + ' ' +
                                                infoValue(payload.restored),
                                        'info'
                                );
                                refreshSyncStatus();
                                window.setTimeout(function () {
                                        window.location.reload();
                                }, 1200);
                                return;
                        }

                        setStatus(_('Could not restore configuration from Google Drive.'), 'warning');
                }, function () {
                        setStatus(_('Could not restore configuration from Google Drive.'), 'warning');
                });
        }

        function renderFileList(payload) {
                if (!payload || !payload.ok) {
                        listNode.replaceChildren(E('div', { 'class': 'sf-muted' }, _('Could not read Google Drive file list.')));
                        return;
                }

                populateBackupSelect(payload.backups || []);
                listNode.replaceChildren.apply(listNode, [
                        [_('Logs on Google Drive'), payload.logs || []],
                        [_('Configuration backups on Google Drive'), payload.backups || []]
                ].map(function (section) {
                        var items = section[1];

                        return E('div', { 'class': 'sf-google-drive-file-group' }, [
                                E('strong', {}, section[0]),
                                items.length ?
                                        E('ul', {}, items.map(function (item) {
                                                var sizeKb = Math.max(1, Math.round((item.bytes || 0) / 1024));

                                                return E('li', {}, item.name + ' (' + sizeKb + ' KB)');
                                        })) :
                                        E('div', { 'class': 'sf-muted' }, _('No files'))
                        ]);
                }));
        }

        window.setTimeout(refreshSyncStatus, 0);

        return E('div', { 'class': 'sf-google-drive-actions' }, [
                E('div', { 'class': 'sf-toolbar sf-google-drive-toolbar' }, [
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        setStatus(_('Testing Google Drive authorization...'));

                                        routerControl(['google-drive-test']).then(function (result) {
                                                var payload = parseRouterJsonOutput(result);

                                                if (payload && payload.ok)
                                                        setStatus(payload.message || _('Google Drive authorization works.'), 'info');
                                                else
                                                        setStatus(_('Google Drive authorization failed.'), 'warning');
                                        }, function () {
                                                setStatus(_('Google Drive authorization failed.'), 'warning');
                                        });
                                }
                        }, _('Test Google Drive authorization')),
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        setStatus(_('Loading file list from Google Drive...'));

                                        routerControl(['google-drive-list']).then(function (result) {
                                                var payload = parseRouterJsonOutput(result);

                                                renderFileList(payload);
                                                if (payload && payload.ok)
                                                        setStatus(_('Google Drive file list updated.'), 'info');
                                                else
                                                        setStatus(_('Could not read Google Drive file list.'), 'warning');
                                        }, function () {
                                                setStatus(_('Could not read Google Drive file list.'), 'warning');
                                        });
                                }
                        }, _('Show files on disk')),
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        refreshSyncStatus();
                                }
                        }, _('Refresh sync status'))
                ]),
                syncStatusNode,
                E('div', { 'class': 'sf-google-drive-restore-row' }, [
                        backupSelect,
                        E('button', {
                                'class': 'sf-action sf-action-positive',
                                'click': function (ev) {
                                        ev.preventDefault();
                                        restoreSelectedBackup();
                                }
                        }, _('Restore configuration backup'))
                ]),
                statusNode,
                listNode
        ]);
}

function logStorageLocationField() {
        var currentValue = settingValue('log_storage', 'ram');
        var statusView = logStorageStatusView();
        var yandexBlock = E('div', { 'class': 'sf-yandex-disk-settings' });
        var googleBlock = E('div', { 'class': 'sf-google-drive-settings' });
        var select;

        function syncVisibility() {
                yandexBlock.hidden = select.value === 'yandex_disk' ? null : 'hidden';
                googleBlock.hidden = select.value === 'google_drive' ? null : 'hidden';
                statusView.refresh();
        }

        select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('log_storage', ev.currentTarget.value);
                        syncVisibility();
                }
        }, [
                ['ram', _('RAM, router operational memory, cleared on reboot (recommended)')],
                ['usb', _('USB flash drive')],
                ['yandex_disk', _('Yandex Disk')],
                ['google_drive', _('Google Drive')]
        ].map(function (item) {
                return E('option', {
                        'value': item[0],
                        'selected': item[0] === currentValue ? 'selected' : null
                }, item[1]);
        }));

        yandexBlock.appendChild(settingsDivider(_('Yandex Disk settings')));
        yandexBlock.appendChild(sectionInputField(
                'cloud',
                _('Yandex Disk login'),
                'login',
                '',
                'login@yandex.ru',
                _('Use an app password from Yandex ID security settings.')
        ));
        yandexBlock.appendChild(sectionInputField(
                'cloud',
                _('Yandex Disk password'),
                'password',
                '',
                '',
                _('Use an app password from Yandex ID security settings.'),
                true
        ));
        yandexBlock.appendChild(sectionInputField(
                'cloud',
                _('Root folder on disk for Sheepfold'),
                'root_folder',
                '/sheepfold',
                '/sheepfold'
        ));
        yandexBlock.appendChild(saveSelectSectionField(
                'cloud',
                _('Allowed storage for Sheepfold data'),
                'quota_mb',
                '500',
                [
                        ['50', _('50 MB')],
                        ['100', _('100 MB')],
                        ['250', _('250 MB')],
                        ['500', _('500 MB')],
                        ['1024', _('1 GB')]
                ],
                _('Sheepfold uploads journals, rotated archives and configuration backups within this limit.')
        ));
        yandexBlock.appendChild(yandexDiskMaintenancePanel());

        googleBlock.appendChild(settingsDivider(_('Google Drive settings')));
        googleBlock.appendChild(sectionInputField(
                'gdrive',
                _('Google OAuth client ID'),
                'client_id',
                '',
                '',
                _('Create an OAuth client in Google Cloud Console (Desktop app type).')
        ));
        googleBlock.appendChild(sectionInputField(
                'gdrive',
                _('Google OAuth client secret'),
                'client_secret',
                '',
                '',
                _('Optional for some clients, but usually required for refresh-token exchange.'),
                true
        ));
        googleBlock.appendChild(sectionInputField(
                'gdrive',
                _('Google OAuth refresh token'),
                'refresh_token',
                '',
                '',
                _('Obtain once on a PC and paste here. Sheepfold stores it only on the router.'),
                true
        ));
        googleBlock.appendChild(sectionInputField(
                'gdrive',
                _('Root folder on disk for Sheepfold'),
                'root_folder',
                '/sheepfold',
                '/sheepfold'
        ));
        googleBlock.appendChild(saveSelectSectionField(
                'gdrive',
                _('Allowed storage for Sheepfold data'),
                'quota_mb',
                '500',
                [
                        ['50', _('50 MB')],
                        ['100', _('100 MB')],
                        ['250', _('250 MB')],
                        ['500', _('500 MB')],
                        ['1024', _('1 GB')]
                ],
                _('Sheepfold uploads journals, rotated archives and configuration backups within this limit.')
        ));
        googleBlock.appendChild(googleDiskMaintenancePanel());

        syncVisibility();

        return E('div', { 'class': 'sf-log-storage-field-wrap' }, [
                E('label', { 'class': 'sf-field sf-field-wide sf-log-storage-field' }, [
                        E('span', {}, _('Log storage location')),
                        E('div', { 'class': 'sf-log-storage-row' }, [
                                select,
                                statusView.node
                        ])
                ]),
                yandexBlock,
                googleBlock
        ]);
}

function cachePathField() {
        var currentValue = settingValue('log_cache_path', defaultLogCachePath) || defaultLogCachePath;
        var values = [
                [defaultLogCachePath, defaultLogCachePath],
                ['/tmp/sheepfold/sheepfold.log', '/tmp/sheepfold/sheepfold.log'],
                ['/tmp/sheepfold/log/events.log', '/tmp/sheepfold/log/events.log']
        ];
        var select;

        if (!values.some(function (item) { return item[0] === currentValue; }))
                values.unshift([currentValue, currentValue]);

        select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('log_cache_path', ev.currentTarget.value);
                }
        }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Cache file path')),
                select,
                E('small', {}, _('The cache file should be stored under /tmp/ so it does not wear router flash memory.'))
        ]);
}

function blocklistEmergencyAccessField() {
        var value = settingValue('domain_allowlist_for_blocklist', '1') === '1' ? '1' : '0';
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('domain_allowlist_for_blocklist', ev.currentTarget.value);
                }
        }, [
                E('option', { 'value': '1', 'selected': value === '1' ? 'selected' : null }, _('Yes')),
                E('option', { 'value': '0', 'selected': value === '0' ? 'selected' : null }, _('No'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Blocklist emergency-useful sites access')),
                select,
                E('small', {}, _('Allows blocklisted devices to access only sites added to the emergency-useful sites list. Router access remains blocked.'))
        ]);
}

function normalizeAccessOrder(value) {
        var known = {};
        var order = [];

        accessSteps.forEach(function (item) { known[item[0]] = true; });
        String(value || '').split(/\s+/).filter(Boolean).forEach(function (key) {
                if (known[key] && order.indexOf(key) === -1)
                        order.push(key);
        });
        defaultOrder.forEach(function (key) {
                if (order.indexOf(key) === -1)
                        order.push(key);
        });
        return order;
}

function accessPriorityField() {
        // Редактор нельзя включать раньше backend-поддержки: иначе LuCI обещает
        // пользовательский порядок, а firewall продолжает применять фиксированный.
        var enforcedOrder = accessSteps;

        return E('div', { 'class': 'sf-priority-editor' }, [
                E('strong', {}, _('Internet access rule priority')),
                E('p', { 'class': 'alert-message notice' },
                        _('The order is temporarily fixed so that the router always applies exactly what the interface shows.')),
                E('div', { 'class': 'sf-priority-list' }, enforcedOrder.map(function (step, index) {
                        return E('div', { 'class': 'sf-priority-row' }, [
                                E('strong', { 'class': 'sf-priority-num' }, String(index + 1)),
                                E('span', { 'class': 'sf-priority-name' }, _(step[1]))
                        ]);
                }))
        ]);
}

function scheduleConflictPolicyField() {
        var current = draftScheduleConflictInternetValue();
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
                                'change': function (ev) {
                                        if (ev.currentTarget.checked)
                                                setSettingsDraftOption('schedule_conflict_internet', item[0]);
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
        return saveSelectGlobalField(_('Site blacklist'), 'site_blocklist_mode', 'except_allowlist_admins', [
                ['disabled', _('Disabled')],
                ['all', _('Enabled for everyone')],
                ['except_allowlist_admins', _('Enabled for everyone except allowlist and administrators')]
        ], _('Site blacklist mode saved.'), _('Could not save site blacklist mode.'));
}

function siteListsUpdateIntervalField() {
        return saveSelectGlobalField(_('Site list update from allowlist and blocklist sources'), 'site_lists_update_interval', 'weekly', [
                ['daily', _('Every day')],
                ['3days', _('Every 3 days')],
                ['weekly', _('Once a week')]
        ], _('Site list update interval saved.'), _('Could not save site list update interval.'), null, function () {
                return routerControl(['site-lists-cron-apply']);
        });
}

function autoConfigureDevicesField() {
        var enabled = settingValue('auto_configure', '1') === '1';
        var value = !enabled ? 'disabled' :
                settingValue('detection_mode', 'full') === 'reduced' ? 'reduced' : 'full';
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;
                        var mode = nextValue === 'reduced' ? 'reduced' : 'full';

                        setSettingsDraftOptions({
                                auto_configure: nextValue === 'disabled' ? '0' : '1',
                                detection_mode: mode,
                                no_restrictions_auto_assign: nextValue === 'disabled' ? '0' : '1'
                        });
                }
        }, [
                E('option', { 'value': 'disabled', 'selected': value === 'disabled' ? 'selected' : null }, _('Disabled')),
                E('option', { 'value': 'full', 'selected': value === 'full' ? 'selected' : null }, _('Full automatic setup')),
                E('option', { 'value': 'reduced', 'selected': value === 'reduced' ? 'selected' : null }, _('Reduced automatic setup'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('New device automatic setup')),
                select,
                E('small', {}, _('Full mode can use port checks when available. Reduced mode avoids heavy checks but still can automatically add confidently detected home infrastructure devices to No restrictions.'))
        ]);
}

function updateCheckInstallField() {
        var value = settingValue('update_check_install_mode', 'weekly');
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('update_check_install_mode', ev.currentTarget.value);
                }
        }, [
                E('option', { 'value': 'daily', 'selected': value === 'daily' ? 'selected' : null }, _('Every day')),
                E('option', { 'value': 'weekly', 'selected': value === 'weekly' ? 'selected' : null }, _('Every week')),
                E('option', { 'value': 'monthly', 'selected': value === 'monthly' ? 'selected' : null }, _('Every month')),
                E('option', { 'value': 'never', 'selected': value === 'never' ? 'selected' : null }, _('Never'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Update check and installation')),
                select,
                E('small', {}, _('Defines how often Sheepfold should check for and install updates after confirmation.'))
        ]);
}

function ensureSheepfoldNamedSection(section, type) {
        try {
                uci.get('sheepfold', section);
        } catch (e) {
                uci.set('sheepfold', section, type);
        }
}

function saveGlobalOptions(options) {
        var globalOptions = {};
        var usbOptions = {};
        var cloudOptions = {};
        var gdriveOptions = {};
        var configs = ['sheepfold'];

        Object.keys(options).forEach(function (key) {
                var usbParts = key.match(/^usb\.(.+)$/);
                var cloudParts = key.match(/^cloud\.(.+)$/);
                var gdriveParts = key.match(/^gdrive\.(.+)$/);

                if (usbParts)
                        usbOptions[usbParts[1]] = options[key];
                else if (cloudParts)
                        cloudOptions[cloudParts[1]] = options[key];
                else if (gdriveParts)
                        gdriveOptions[gdriveParts[1]] = options[key];
                else
                        globalOptions[key] = options[key];
        });

        if (hasOwn(globalOptions, 'language'))
                globalOptions.language = sheepfoldI18n.normalizeApplicationLanguage(globalOptions.language);

        Object.keys(globalOptions).forEach(function (option) {
                uci.set('sheepfold', 'global', option, globalOptions[option]);
        });

        /* SHEEPFOLD_AI_BEGIN */
        if (hasOwn(globalOptions, 'deepseek_api_key') && String(globalOptions.deepseek_api_key || '').trim())
                uci.set('sheepfold', 'global', 'ai_enabled', '1');

        if (hasOwn(globalOptions, 'gemini_api_key') && String(globalOptions.gemini_api_key || '').trim())
                uci.set('sheepfold', 'global', 'ai_enabled', '1');

        if (hasOwn(globalOptions, 'child_ai_parental_consent'))
                uci.set('sheepfold', 'global', 'child_ai_consent_version', 'child-ai-v1');
        /* SHEEPFOLD_AI_END */

        if (Object.keys(usbOptions).length) {
                ensureSheepfoldNamedSection('usb', 'usb');
                Object.keys(usbOptions).forEach(function (option) {
                        uci.set('sheepfold', 'usb', option, usbOptions[option]);
                });
        }

        if (Object.keys(cloudOptions).length) {
                ensureSheepfoldNamedSection('cloud', 'yandex_disk');
                if (hasOwn(cloudOptions, 'login') || hasOwn(cloudOptions, 'password'))
                        uci.set('sheepfold', 'cloud', 'authorized', '0');
                Object.keys(cloudOptions).forEach(function (option) {
                        uci.set('sheepfold', 'cloud', option, cloudOptions[option]);
                });
        }

        if (Object.keys(gdriveOptions).length) {
                ensureSheepfoldNamedSection('gdrive', 'google_drive');
                if (hasOwn(gdriveOptions, 'client_id') || hasOwn(gdriveOptions, 'client_secret') ||
                        hasOwn(gdriveOptions, 'refresh_token'))
                        uci.set('sheepfold', 'gdrive', 'authorized', '0');
                Object.keys(gdriveOptions).forEach(function (option) {
                        uci.set('sheepfold', 'gdrive', option, gdriveOptions[option]);
                });
        }

        return saveUciChanges(configs);
}

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
                        'click': function (ev) {
                                ev.preventDefault();
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
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                done(false);
                                        }
                                }, _('Cancel')),
                                confirmButton
                        ])
                ]);
        });
}

function timeAutomationField(label, modeOption, timeOption, defaultTime) {
        var currentMode = settingValue(modeOption, 'never');
        var currentTime = settingValue(timeOption, defaultTime);
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

        function selectedMode() {
                return timeRadio.checked ? 'time' : 'never';
        }

        function updateDraft() {
                var nextMode = selectedMode();
                var nextTime = timeInput.value || defaultTime;

                setSettingsDraftOptions((function () {
                        var options = {};
                        options[modeOption] = nextMode;
                        options[timeOption] = nextTime;
                        return options;
                })());
        }

        neverRadio.addEventListener('change', updateDraft);
        timeRadio.addEventListener('change', updateDraft);
        timeInput.addEventListener('focus', function () {
                timeRadio.checked = true;
                updateDraft();
        });
        timeInput.addEventListener('input', updateDraft);
        timeInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
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

function saveSelectGlobalField(label, option, value, values, successMessage, errorMessage, hint, afterSave) {
        var currentValue = settingValue(option, value);
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption(option, ev.currentTarget.value);
                }
        }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                select,
                hint ? E('small', {}, hint) : ''
        ]);
}

function saveSelectSectionField(section, label, option, defaultValue, values, hint) {
        var currentValue = sectionSettingValue(section, option, defaultValue);
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftSectionOption(section, option, ev.currentTarget.value);
                }
        }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                select,
                hint ? E('small', {}, hint) : ''
        ]);
}

/* SHEEPFOLD_AI_BEGIN */
function hasConfiguredAiProvider() {
        var provider = settingValue('ai_provider', 'none');

        if (!provider || provider === 'none')
                return false;

        var keyOption = provider === 'gemini' ? 'gemini_api_key' :
                (provider === 'grok' ? 'grok_api_key' : 'deepseek_api_key');

        return !!String(settingValue(keyOption, '') || '').trim();
}

function aiSettingsBox() {
        var container = E('div', { 'class': 'sf-flat-form' });

        function currentProvider() {
                return settingValue('ai_provider', 'none');
        }

        function rebuild() {
                var provider = currentProvider();
                var fields = [
                        E('label', { 'class': 'sf-field sf-field-wide' }, [
                                E('span', {}, _('AI provider')),
                                E('select', {
                                        'class': 'cbi-input-select',
                                        'change': function (ev) {
                                                setSettingsDraftOption('ai_provider', ev.currentTarget.value);
                                                rebuild();
                                        }
                                }, [
                                        ['none', _('Not set up')],
                                        ['deepseek', 'DeepSeek'],
                                        ['gemini', _('Gemini Free')],
                                        ['grok', 'Grok']
                                ].map(function (item) {
                                        return E('option', {
                                                'value': item[0],
                                                'selected': item[0] === provider ? 'selected' : null
                                        }, item[1]);
                                })),
                                E('small', {}, _('The Android app sends AI requests to the router; the router calls the selected provider.'))
                        ]),
                        saveSelectGlobalField(
                                _('AI assistant prompt version'),
                                'parent_ai_prompt_version',
                                'v2',
                                [
                                        ['v2', _('Version 2 (recommended)')],
                                        ['v1', _('Version 1 (original draft)')]
                                ],
                                null,
                                null,
                                _('The selected version is used for conversations with parents. Changing it does not send any data until a parent starts a conversation.')
                        )
                ];

                if (provider === 'deepseek') {
                        fields.push(
                                saveSelectGlobalField(_('AI assistant model'), 'deepseek_model', 'deepseek-v4-flash', [
                                        ['deepseek-v4-flash', 'DeepSeek V4 Flash'],
                                        ['deepseek-v4-pro', 'DeepSeek V4 Pro']
                                ], null, null, _('DeepSeek requests are sent from the router. The Android app does not store the API key.')),
                                globalInputOptionField(
                                        _('DeepSeek API key'),
                                        'deepseek_api_key',
                                        '',
                                        'sk-...',
                                        _('Create the key in DeepSeek Platform and save it here. It is stored only on the router.'),
                                        true
                                )
                        );
                } else if (provider === 'gemini') {
                        fields.push(
                                saveSelectGlobalField(_('Gemini Free') + ' - ' + _('AI assistant model'), 'gemini_model', 'gemini-2.5-flash', [
                                        ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
                                        ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite']
                                ], null, null, _('Gemini Free uses Google AI Studio free-tier limits. The API key is stored only on the router.')),
                                globalInputOptionField(
                                        _('Gemini API key'),
                                        'gemini_api_key',
                                        '',
                                        'AIza...',
                                        _('Create the key in Google AI Studio and save it here. Free limits depend on Google account and region.'),
                                        true
                                )
                        );
                } else if (provider === 'grok') {
                        fields.push(
                                globalInputOptionField(
                                        _('Grok model'),
                                        'grok_model',
                                        'grok-3-mini',
                                        'grok-3-mini',
                                        _('The model identifier is configurable because available Grok models may change.'),
                                        false
                                ),
                                globalInputOptionField(
                                        _('Grok API key'),
                                        'grok_api_key',
                                        '',
                                        'xai-...',
                                        _('Create the key in the xAI console and save it here. It is stored only on the router.'),
                                        true
                                )
                        );
                }

                if (provider !== 'none') {
                        if (!hasConfiguredAiProvider()) {
                                fields.push(E('p', { 'class': 'sf-note' },
                                        _('Save the API key for the selected provider before enabling the assistant and protected logs.')));
                        } else {
                                fields.push(
                                        settingsDivider(_('Access and limits')),
                                        globalFlagOptionField(_('Enable AI assistant'), 'ai_enabled', '1'),
                                        globalFlagOptionField(
                                                _('Allow the AI assistant on child devices'),
                                                'child_ai_parental_consent',
                                                '0',
                                                _('Enable only after talking with the child. The child client never receives router diagnostics or admin logs.')
                                        ),
                                        globalInputOptionField(_('Requests per device'), 'ai_rate_limit_requests', '20', '20', null, false),
                                        globalInputOptionField(_('Rate limit window, seconds'), 'ai_rate_limit_window_seconds', '3600', '3600', null, false),
                                        globalFlagOptionField(
                                                _('Allow per-device logs for AI'),
                                                'ai_individual_logs',
                                                '0',
                                                _('Enabling protected per-device logs runs an OpenSSL check on the router.')
                                        )
                                );
                        }
                }

                container.replaceChildren.apply(container, fields);
        }

        rebuild();
        return container;
}
/* SHEEPFOLD_AI_END */

function globalFlagOptionField(label, option, defaultValue, hint) {
        var control = checkboxControl(label, settingValue(option, defaultValue || '0') === '1', hint, {
                'change': function (ev) {
                        setSettingsDraftOption(option, ev.currentTarget.checked ? '1' : '0');
                }
        });

        return control.node;
}

function sectionFlagOptionField(section, label, option, defaultValue, hint) {
        var control = checkboxControl(label, sectionSettingValue(section, option, defaultValue || '0') === '1', hint, {
                'change': function (ev) {
                        setSettingsDraftSectionOption(section, option, ev.currentTarget.checked ? '1' : '0');
                }
        });

        return control.node;
}

function sectionInputField(section, label, option, defaultValue, placeholder, hint, secret) {
        var input = E('input', {
                'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
                'type': secret ? 'password' : 'text',
                'value': sectionSettingValue(section, option, defaultValue || ''),
                'placeholder': placeholder || ''
        });

        input.addEventListener('input', function () {
                setSettingsDraftSectionOption(section, option, input.value.trim());
        });
        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        setSettingsDraftSectionOption(section, option, input.value.trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                input,
                hint ? E('small', {}, hint) : ''
        ]);
}

function globalInputOptionField(label, option, defaultValue, placeholder, hint, secret) {
        var input = E('input', {
                'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
                'type': secret ? 'password' : 'text',
                'value': settingValue(option, defaultValue || ''),
                'placeholder': placeholder || ''
        });
        var fieldControl = input;

        input.addEventListener('input', function () {
                setSettingsDraftOption(option, input.value.trim());
        });
        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        setSettingsDraftOption(option, input.value.trim());
                }
        });

        if (secret) {
                fieldControl = E('span', { 'class': 'sf-secret-row' }, [
                        input,
                        E('button', {
                                'class': 'sf-icon-action sf-secret-toggle',
                                'type': 'button',
                                'title': _('Show secret'),
                                'aria-label': _('Show secret'),
                                'click': function (ev) {
                                        var visible;

                                        ev.preventDefault();
                                        visible = input.type === 'password';
                                        input.type = visible ? 'text' : 'password';
                                        ev.currentTarget.setAttribute('title', visible ? _('Hide secret') : _('Show secret'));
                                        ev.currentTarget.setAttribute('aria-label', visible ? _('Hide secret') : _('Show secret'));
                                }
                        }, iconSvg('eye'))
                ]);
        }

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                fieldControl,
                hint ? E('small', {}, hint) : ''
        ]);
}

function appPortField() {
        var currentValue = settingValue('app_port', '5201');
        var input = E('input', {
                'class': 'cbi-input-text',
                'type': 'number',
                'min': '1',
                'max': '65535',
                'value': currentValue
        });

        input.addEventListener('input', function () {
                setSettingsDraftOption('app_port', String(input.value || '').trim());
        });
        input.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                        event.preventDefault();
                        setSettingsDraftOption('app_port', String(input.value || '').trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Application HTTPS port')),
                input,
                E('small', {}, _('Used by Android app and pairing QR codes.'))
        ]);
}

function messengerSettingsBox() {
        return messengerSettings.settingsBox({
                get: function (option, fallback) {
                        return safeUciGet('sheepfold', 'global', option, fallback);
                },
                icon: iconSvg,
                routerControl: routerControl,
                parseOutput: parseKeyValueOutput,
                errorText: commandErrorText,
                notify: notify,
                changed: markSettingsDraftChanged,
                registerSaver: registerSettingsSpecialSaver,
                sameValues: sameObjectValues
        });
}
function settingsDivider(label) {
        return E('div', { 'class': 'sf-settings-divider' }, [
                E('hr'),
                E('span', {}, label)
        ]);
}

function routerTimezoneOptions() {
        return [
                ['Europe/Moscow|MSK-3', _('Moscow time') + ' (Europe/Moscow, MSK-3)'],
                ['Europe/Kaliningrad|EET-2', _('Kaliningrad time') + ' (Europe/Kaliningrad, EET-2)'],
                ['Europe/Samara|+04-4', _('Samara time') + ' (Europe/Samara, +04-4)'],
                ['Asia/Yekaterinburg|+05-5', _('Yekaterinburg time') + ' (Asia/Yekaterinburg, +05-5)'],
                ['Asia/Omsk|+06-6', _('Omsk time') + ' (Asia/Omsk, +06-6)'],
                ['Asia/Krasnoyarsk|+07-7', _('Krasnoyarsk time') + ' (Asia/Krasnoyarsk, +07-7)'],
                ['Asia/Irkutsk|+08-8', _('Irkutsk time') + ' (Asia/Irkutsk, +08-8)'],
                ['Asia/Yakutsk|+09-9', _('Yakutsk time') + ' (Asia/Yakutsk, +09-9)'],
                ['Asia/Vladivostok|+10-10', _('Vladivostok time') + ' (Asia/Vladivostok, +10-10)'],
                ['Asia/Magadan|+11-11', _('Magadan time') + ' (Asia/Magadan, +11-11)'],
                ['Asia/Kamchatka|+12-12', _('Kamchatka time') + ' (Asia/Kamchatka, +12-12)'],
                ['UTC|UTC0', 'UTC']
        ];
}

function normalizeNtpServers(value) {
        return String(value || '')
                .split(/[\s,;]+/)
                .map(function (server) { return server.trim(); })
                .filter(Boolean)
                .join(' ');
}

function routerTimeSettingsField() {
        var defaultServers = 'ntp1.vniiftri.ru ntp2.ntp-servers.net 3.openwrt.pool.ntp.org';
        var systemZoneName = safeUciGet('system', '@system[0]', 'zonename', safeUciGet('sheepfold', 'global', 'router_timezone_name', 'Europe/Moscow'));
        var systemTimezone = safeUciGet('system', '@system[0]', 'timezone', safeUciGet('sheepfold', 'global', 'router_timezone', 'MSK-3'));
        var selectedTimezone = systemZoneName + '|' + systemTimezone;
        var ntpEnabled = safeUciGet('system', 'ntp', 'enabled', safeUciGet('sheepfold', 'global', 'router_ntp_client_auto_configure', '1')) !== '0';
        var ntpServerEnabled = safeUciGet('system', 'ntp', 'enable_server', safeUciGet('sheepfold', 'global', 'router_ntp_server_enabled', '1')) === '1';
        var ntpServers = listOptionValues(safeUciGet('system', 'ntp', 'server', safeUciGet('sheepfold', 'global', 'router_ntp_servers', defaultServers))).join('\n');
        var serverField = checkboxControl(_('Make router an NTP server for LAN'), ntpServerEnabled, _('Home devices can use the router as their local time server.'));
        var clientField = checkboxControl(_('Automatically configure router NTP client'), ntpEnabled, _('Sheepfold will write NTP servers and time settings to OpenWRT system config.'));
        var timezoneSelect = E('select', { 'class': 'cbi-input-select' }, routerTimezoneOptions().map(function (item) {
                return E('option', {
                        'value': item[0],
                        'selected': item[0] === selectedTimezone ? 'selected' : null
                }, item[1]);
        }));
        var ntpServersTextarea = E('textarea', {
                'class': 'cbi-input-textarea',
                'rows': 3
        }, ntpServers || defaultServers.replace(/ /g, '\n'));
        var initialOptions;

        function collectOptions() {
                var timezoneParts = timezoneSelect.value.split('|');

                return {
                        server_enabled: serverField.input.checked ? '1' : '0',
                        client_enabled: clientField.input.checked ? '1' : '0',
                        timezone_name: timezoneParts[0] || 'Europe/Moscow',
                        timezone: timezoneParts[1] || 'MSK-3',
                        servers: normalizeNtpServers(ntpServersTextarea.value) || defaultServers
                };
        }

        initialOptions = collectOptions();

        [serverField.input, clientField.input, timezoneSelect, ntpServersTextarea].forEach(function (input) {
                input.addEventListener('change', markSettingsDraftChanged);
                input.addEventListener('input', markSettingsDraftChanged);
        });

        registerSettingsSpecialSaver({
                isChanged: function () {
                        return !sameObjectValues(initialOptions, collectOptions());
                },
                save: function () {
                        var options = collectOptions();

                        return routerControl([
                                'time-save',
                                options.server_enabled,
                                options.client_enabled,
                                options.timezone_name,
                                options.timezone,
                                options.servers
                        ]);
                },
                accept: function () {
                        initialOptions = collectOptions();
                }
        });

        return E('div', { 'class': 'sf-flat-form' }, [
                serverField.node,
                clientField.node,
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, _('Router timezone')),
                        timezoneSelect
                ]),
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, _('NTP servers')),
                        ntpServersTextarea,
                        E('small', {}, _('One server per line. Default for Russia: ntp1.vniiftri.ru, ntp2.ntp-servers.net, 3.openwrt.pool.ntp.org.'))
                ])
        ]);
}

function wpsActionField(label, option) {
        return saveSelectGlobalField(label, option, 'router_default', [
                ['router_default', _('Router default behavior')],
                ['allow_wifi_connection', _('Allow Wi-Fi connection')],
                ['allow_wifi_and_allowlist', _('Allow Wi-Fi connection and add devices to allowlist (dangerous)')],
                ['disable_wifi', _('Disable Wi-Fi')]
        ], _('WPS action saved.'), _('Could not save WPS action.'), [
                E('span', {}, _('Adding devices to allowlist through the WPS button is dangerous because after pressing it, for 30 seconds any device can connect to Wi-Fi and get into the allowlist.')),
                E('br'),
                E('span', {}, _('While WPS connection is allowed, all router LEDs should blink using the 1010000 pattern for 30 seconds. One tick is half a second.'))
        ]);
}

function ledControlField() {
        var currentValue = settingValue('router_led_control', 'router_default');
        var hint = E('small', {
                'hidden': currentValue === 'new_device_alert_until_luci_login' ? null : 'hidden'
        }, _('When a new device connects, router LEDs will turn on. After a successful LuCI password login or after any admin views the new-device notification on the phone, restore the router default LED behavior immediately.'));
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;

                        hint.hidden = nextValue === 'new_device_alert_until_luci_login' ? null : 'hidden';
                        setSettingsDraftOption('router_led_control', nextValue);
                }
        }, [
                ['router_default', _('Router default behavior')],
                ['off_forever', _('Turn off all LEDs permanently')],
                ['new_device_alert_until_luci_login', _('New device LED alert until LuCI login')]
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Router LED control')),
                select,
                hint
        ]);
}

function inputControl(label, value, attrs, hint) {
        return sharedForms.inputControl(label, value, attrs, hint);
}

function selectControl(label, value, values, hint) {
        return sharedForms.selectControl(label, value, values, hint);
}

function deviceTypeSelectControl(label, value, hint) {
        var selected = deviceTypeByValue(value);
        var input = E('input', {
                'type': 'hidden',
                'value': selected.value
        });
        var currentIcon = E('span', { 'class': 'sf-device-type-select-icon' }, [
                deviceTypeIcon(selected.value)
        ]);
        var currentLabel = E('span', { 'class': 'sf-device-type-select-label' }, selected.label);
        var root;
        var menu;
        var closeOnOutsideClick = function (ev) {
                if (root && !root.contains(ev.target))
                        setOpen(false);
        };
        var closeOnEscape = function (ev) {
                if (ev.key === 'Escape')
                        setOpen(false);
        };
        var toggle = E('button', {
                'class': 'sf-device-type-select-button',
                'type': 'button',
                'aria-haspopup': 'listbox',
                'aria-expanded': 'false',
                'click': function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setOpen(menu.hidden);
                }
        }, [
                currentIcon,
                currentLabel,
                E('span', { 'class': 'sf-device-type-select-caret' }, '▾')
        ]);

        function setOpen(open) {
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

                if (open) {
                        window.setTimeout(function () {
                                document.addEventListener('mousedown', closeOnOutsideClick);
                                document.addEventListener('keydown', closeOnEscape);
                        }, 0);
                } else {
                        document.removeEventListener('mousedown', closeOnOutsideClick);
                        document.removeEventListener('keydown', closeOnEscape);
                }
        }

        function chooseType(item) {
                input.value = item.value;
                currentIcon.replaceChildren(deviceTypeIcon(item.value));
                currentLabel.textContent = item.label;
                setOpen(false);
        }

        menu = E('div', {
                'class': 'sf-device-type-select-menu',
                'role': 'listbox',
                'hidden': 'hidden'
        }, deviceTypeDefinitions().map(function (item) {
                return E('button', {
                        'class': 'sf-device-type-select-option' + (item.value === selected.value ? ' is-selected' : ''),
                        'type': 'button',
                        'role': 'option',
                        'aria-selected': item.value === selected.value ? 'true' : 'false',
                        'click': function (ev) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                Array.prototype.forEach.call(menu.querySelectorAll('.sf-device-type-select-option'), function (button) {
                                        button.classList.remove('is-selected');
                                        button.setAttribute('aria-selected', 'false');
                                });
                                ev.currentTarget.classList.add('is-selected');
                                ev.currentTarget.setAttribute('aria-selected', 'true');
                                chooseType(item);
                        }
                }, [
                        deviceTypeIcon(item.value),
                        E('span', {}, item.label)
                ]);
        }));

        root = E('div', { 'class': 'sf-field sf-device-type-select-field' }, [
                E('span', {}, label),
                input,
                E('div', { 'class': 'sf-device-type-select' }, [
                        toggle,
                        menu
                ]),
                hint ? E('small', {}, hint) : ''
        ]);

        return {
                input: input,
                node: root
        };
}

function checkboxControl(label, checked, hint, attrs) {
        return sharedForms.checkboxControl(label, checked, hint, attrs);
}

function iconSvg(name) {
        return sharedIcons.named(name);
}

function iconButton(title, icon, tone, handler) {
        return sharedIcons.button(title, icon, tone, handler);
}

function wifiQrEscape(value) {
        return wifiPayload.escape(value);
}

function wifiQrSecurity(encryption) {
        return wifiPayload.security(encryption);
}

function wifiQrPayload(ssid, password, encryption) {
        return wifiPayload.build(ssid, password, encryption);
}

function safeUciGet(config, section, option, fallback) {
        try {
                var value = uci.get(config, section, option);

                return value == null ? fallback : value;
        } catch (e) {
                return fallback;
        }
}

function safeUciSections(config, type) {
        try {
                return (type ? uci.sections(config, type) : uci.sections(config)) || [];
        } catch (e) {
                return [];
        }
}

function reservedSheepfoldListSection(name) {
        return deviceInventory.reservedListSection(name);
}

function normalizeMac(mac) {
        return deviceInventory.normalizeMac(mac);
}

function listOptionValues(value) {
        return deviceInventory.listValues(value);
}

function sheepfoldListMacs(listName) {
        return deviceInventory.listMacs(safeUciSections('sheepfold', 'list'), listName);
}

function macInSheepfoldList(listName, mac) {
        return deviceInventory.macInList(safeUciSections('sheepfold', 'list'), listName, mac);
}

function generatedSectionName(prefix, mac) {
        return deviceInventory.generatedSectionName(prefix, mac);
}

function ensureSection(config, type, preferredName) {
        var existing = safeUciSections(config, type).filter(function (section) {
                return section['.name'] === preferredName;
        })[0];

        if (existing)
                return existing['.name'];

        try {
                return uci.add(config, type, preferredName) || preferredName;
        } catch (e) {
                return uci.add(config, type);
        }
}

function ensureSheepfoldDeviceSection(device) {
        if (device.configSection)
                return device.configSection;

        return ensureSection('sheepfold', 'device', generatedSectionName('device', device.mac));
}

function ensureSheepfoldListSection(listName) {
        return ensureSection('sheepfold', 'list', listName);
}

function updateMacList(listName, mac, enabled) {
        var sectionName = ensureSheepfoldListSection(listName);
        var values = deviceAccessLists.updatedValues(uci.get('sheepfold', sectionName, 'mac'), mac, enabled);

        // Сбрасываем list целиком и передаём массив одним set(): последовательные
        // вызовы set() оставили бы в UCI только последний MAC.
        uci.unset('sheepfold', sectionName, 'mac');
        if (values.length)
                uci.set('sheepfold', sectionName, 'mac', values);
}

function removeDeviceFromAccessList(device, listName) {
        var isAllowlist = listName === 'allowlist';
        var confirmText = isAllowlist ? _('Remove device from allowlist?') : _('Remove device from blocklist?');
        var successText = isAllowlist ? _('Device removed from allowlist.') : _('Device removed from blocklist.');
        var sectionName;

        if (!window.confirm(confirmText + ' ' + formattedDeviceDisplayId(device) + ' ' + (device.name || device.mac)))
                return;

        sectionName = ensureSheepfoldDeviceSection(device);
        updateMacList(listName, device.mac, false);
        uci.set('sheepfold', sectionName, 'status', 'new');

        saveSheepfoldAccessChanges().then(function () {
                device.status = 'new';
                notify(successText, 'info');
                refreshUserListsWithoutPageReload();
        }, function () {
                notify(_('Could not remove device from list.'), 'warning');
        });
}

function applyAdminDeviceBindings(admin, selectedDevices, previousIds) {
        var selectedById = {};

        if (selectedDevices.some(function (device) { return !adminDeviceCanBeBound(device); }))
                return Promise.reject(new Error(_('A blocklisted device cannot become an administrator device. Remove it from the blocklist first.')));

        // Админское устройство нельзя оставлять в детских группах, расписаниях и журналировании:
        // иначе родитель может сам себя заблокировать, а журнал ребёнка начнёт смешиваться
        // с действиями администратора. Поэтому при привязке явно чистим ограничения,
        // добавляем устройство в белый список и убираем из чёрного.
        selectedDevices.forEach(function (device) {
                var sectionName = ensureSheepfoldDeviceSection(device);
                var mac = normalizeMac(device.mac);

                selectedById[device.id] = true;

                uci.set('sheepfold', sectionName, 'mac', mac);
                uci.set('sheepfold', sectionName, 'name', device.name || mac);
                uci.set('sheepfold', sectionName, 'ip', device.ip || '');
                uci.set('sheepfold', sectionName, 'device_type', device.deviceType || 'phone');
                uci.set('sheepfold', sectionName, 'group', NOT_CONFIGURED_GROUP);
                uci.set('sheepfold', sectionName, 'schedules', '');
                uci.set('sheepfold', sectionName, 'schedule', '');
                /* SHEEPFOLD_AI_BEGIN */
                uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
                /* SHEEPFOLD_AI_END */
                uci.set('sheepfold', sectionName, 'status', 'allow');
                uci.set('sheepfold', sectionName, 'admin_device', '1');
                uci.set('sheepfold', sectionName, 'admin_owner', admin.name || '');
                uci.set('sheepfold', sectionName, 'admin_login', admin.login || '');
                updateMacList('allowlist', mac, true);
                updateMacList('blocklist', mac, false);
        });

        (previousIds || []).forEach(function (id) {
                var device = deviceById(id);
                var sectionName;

                if (!device || selectedById[id])
                        return;

                sectionName = ensureSheepfoldDeviceSection(device);
                if (uci.get('sheepfold', sectionName, 'admin_login') === admin.login) {
                        uci.set('sheepfold', sectionName, 'admin_device', '0');
                        uci.set('sheepfold', sectionName, 'admin_owner', '');
                        uci.set('sheepfold', sectionName, 'admin_login', '');
                }
        });

        return saveSheepfoldAccessChanges();
}

function ensureStaticDhcpSection(device) {
        if (device.staticSection)
                return device.staticSection;

        return ensureSection('dhcp', 'host', generatedSectionName('sheepfold', device.mac));
}

function saveUciChanges(configs) {
        return Promise.all(configs.map(function (config) {
                return uci.save(config);
        })).then(function () {
                // LuCI по умолчанию любит оставлять изменения в очереди "не применено".
                // Для Sheepfold это путает пользователя: он уже нажал нашу кнопку "Сохранить".
                // Поэтому после uci.save сразу применяем изменения через LuCI API, а если
                // конкретная сборка OpenWRT этого метода не имеет - падаем обратно на uci.apply().
                if (ui.changes && typeof ui.changes.apply === 'function')
                        return Promise.resolve(ui.changes.apply(false)).catch(function () {
                                return uci.apply();
                        });

                return uci.apply();
        });
}

function saveSheepfoldAccessChanges() {
        return saveUciChanges(['sheepfold']).then(function () {
                // Таблица уже показывает новое состояние, поэтому и nftables должен получить
                // его сразу, а не через следующий цикл фоновой службы Sheepfold.
                return routerControl(['schedule-sync']).then(function (result) {
                        return ensureRouterControlOk(result, _('Could not apply internet access rules.'));
                });
		}).then(function () {
			// Перенос устройства в строгую группу должен сразу изменить реальное
			// правило, но helper не перезапускает dnsmasq, если домены не менялись. §dompol
			return routerControl(['site-lists-apply']).then(function (result) {
				ensureRouterControlOk(result, _('Could not apply site list policy.'));
				return siteListStatus.load(true).catch(function () { return null; });
			});
		});
}

function buildRouterDevices(dhcpLeases, arpTable) {
        return deviceInventory.build({
                dhcpLeases: dhcpLeases,
                arpTable: arpTable,
                staticHosts: safeUciSections('dhcp', 'host'),
                deviceSections: safeUciSections('sheepfold', 'device'),
                listSections: safeUciSections('sheepfold', 'list'),
                notConfiguredGroup: NOT_CONFIGURED_GROUP,
                normalizeGroupName: normalizeGroupName,
                groupSectionByName: groupSectionByName,
                statusBadge: deviceStatusBadge,
                translate: _
        });
}

function wifiBandBadge(kind) {
        var labels = {
                '2g': '2.4',
                '5g': '5',
                '6g': '6'
        };
        var titles = {
                '2g': '2.4 GHz',
                '5g': '5 GHz',
                '6g': '6 GHz'
        };

        if (!kind || !labels[kind])
                return '';

        return E('span', {
                'class': 'sf-wifi-band sf-wifi-band-' + kind,
                'title': titles[kind],
                'aria-label': titles[kind]
        }, [
                svgIcon([
                        'M2 8c5-5 15-5 20 0',
                        'M5 11c3.5-3.5 10.5-3.5 14 0',
                        'M8 14c2-2 6-2 8 0',
                        'M11 17h2'
                ]),
                E('span', { 'class': 'sf-wifi-band-label' }, labels[kind])
        ]);
}

function wifiNetworkTitle(network) {
        var title = network.title || _('Network');
        var bandBadge = wifiBandBadge(network.bandKind);

        return E('span', { 'class': 'sf-wifi-title-row' }, bandBadge ? [
                E('span', { 'class': 'sf-wifi-title-text' }, title),
                bandBadge
        ] : [
                E('span', { 'class': 'sf-wifi-title-text' }, title)
        ]);
}

function readWifiNetworksFromUci() {
        return wifiCards.readNetworks(safeUciSections('wireless', 'wifi-iface'), safeUciGet);
}

function clearWifiNetworkEditors() {
        wifiNetworkEditors = [];
}

function wifiEditorSnapshot(editor) {
        return wifiCards.editorSnapshot(editor);
}

function wifiEditorIsDirty(editor) {
        return wifiCards.editorIsDirty(editor);
}

function updateWifiSaveButton() {
        var dirty = wifiNetworkEditors.some(function (editor) {
                return wifiEditorIsDirty(editor);
        });

        document.querySelectorAll('[data-wifi-save]').forEach(function (button) {
                button.disabled = wifiIsSaving ? true : (!dirty ? true : null);
                button.classList.toggle('sf-action-muted', !dirty);
        });
}

function registerWifiNetworkEditor(editor) {
        wifiNetworkEditors.push(editor);

        editor.ssidInput.addEventListener('input', updateWifiSaveButton);
        editor.passwordInput.addEventListener('input', updateWifiSaveButton);
        editor.securitySelect.addEventListener('change', updateWifiSaveButton);
        editor.channelSelect.addEventListener('change', updateWifiSaveButton);
}

function saveWifiNetworksNow() {
        if (wifiIsSaving || !wifiNetworkEditors.length)
                return Promise.resolve();

        wifiIsSaving = true;
        updateWifiSaveButton();

        wifiNetworkEditors.forEach(function (editor) {
                var snapshot = wifiEditorSnapshot(editor);
                var encryption = snapshot.encryption;

                if (!editor.sectionName)
                        return;

                uci.set('wireless', editor.sectionName, 'ssid', snapshot.ssid);
                uci.set('wireless', editor.sectionName, 'encryption', encryption);

                if (encryption === 'none')
                        uci.unset('wireless', editor.sectionName, 'key');
                else
                        uci.set('wireless', editor.sectionName, 'key', snapshot.password);

                if (editor.device)
                        uci.set('wireless', editor.device, 'channel', snapshot.channel || 'auto');
        });

        return saveUciChanges(['wireless']).then(function () {
                return fs.exec('/sbin/wifi', ['reload']).catch(function () {
                        return fs.exec('/sbin/wifi', []);
                });
        }).then(function () {
                wifiNetworkEditors.forEach(function (editor) {
                        editor.original = wifiEditorSnapshot(editor);
                });
                notify(_('Wi-Fi settings saved.'), 'info');
        }, function (error) {
                notify(_('Could not save Wi-Fi settings.') + ' ' + commandErrorText(error, ''), 'warning');
                return Promise.reject(error);
        }).finally(function () {
                wifiIsSaving = false;
                updateWifiSaveButton();
        });
}

function wifiSaveBar() {
        return E('div', { 'class': 'sf-wifi-save-bar' }, [
                E('button', {
                        'class': 'sf-action sf-action-positive sf-action-nowrap sf-action-muted',
                        'data-wifi-save': '1',
                        'disabled': 'disabled',
                        'click': function (ev) {
                                ev.preventDefault();
                                saveWifiNetworksNow();
                        }
                }, _('Save'))
        ]);
}

function wifiNetworkCardColor(index) {
        var palette = groupColorPalette();

        return palette[index % palette.length];
}

function wifiNetworkBox(network, index) {
        return wifiCards.networkBox(network, index, {
                qrPayload: wifiQrPayload,
                qrCode: qrCode,
                registerEditor: registerWifiNetworkEditor,
                cardColor: wifiNetworkCardColor,
                title: wifiNetworkTitle
        });
}
return view.extend({
        activeTab: 'users',
        activeUserListTab: 'devices',
        activeManagementTab: 'schedules',
        activeSettingsTab: 'general',
        deepLinkHandled: false,
        globalInternetBlocked: null,
        uciLoadState: {
                sheepfold: false,
                wireless: false,
                system: false
        },

        load: function () {
                var self = this;

                return uci.load('sheepfold').then(function () {
                        self.uciLoadState.sheepfold = true;
                        return sheepfoldI18n.installApplicationTranslator(
                                safeUciGet('sheepfold', 'global', 'language', 'ru')
                        );
                }, function () {
                        self.uciLoadState.sheepfold = false;
                        return sheepfoldI18n.installApplicationTranslator('ru');
                }).then(function () {
                        return Promise.all([
                        uci.load('wireless').then(function () {
                                self.uciLoadState.wireless = true;
                        }, function () {
                                self.uciLoadState.wireless = false;
                        }),
                        uci.load('system').then(function () {
                                self.uciLoadState.system = true;
                        }, function () {
                                self.uciLoadState.system = false;
                        }),
						uci.load('dhcp'),
						loadRootPasswordStatus(),
						siteListStatus.load().catch(function () { return null; })
				]);
                }).then(function () {
                        return Promise.all([
                                fs.read('/tmp/dhcp.leases').catch(function () {
                                        return '';
                                }),
                                fs.read('/proc/net/arp').catch(function () {
                                        return '';
                                }),
                                fs.read(logCachePath()).catch(function () {
                                        return '';
                                })
                        ]);
                }).then(function (results) {
                        devices = buildRouterDevices(results[0], results[1]);
                        loadAdministratorsFromUci();
                        emergencySites = emergencySiteModel.fromSections(
                                safeUciSections('sheepfold', emergencySiteModel.sectionType)
                        );
                        savedEmergencySites = emergencySiteModel.clone(emergencySites);
                        logEntries = parseRamLog(results[2]);
                });
        },

        isGlobalInternetBlocked: function () {
                if (this.globalInternetBlocked !== null)
                        return this.globalInternetBlocked;

                return safeUciGet('sheepfold', 'global', 'block_on_boot', '0') === '1';
        },

        updateInternetButtons: function (page, blocked) {
                page.querySelectorAll('.sf-internet-toggle').forEach(function (node) {
                        var nodeBlocked = node.getAttribute('data-blocked') === '1';
                        var active = nodeBlocked === blocked;

                        node.classList.toggle('is-active', active);
                        node.classList.toggle('is-inactive', !active);
                        node.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
        },

        deepLinkParams: function () {
                try {
                        return new URLSearchParams(window.location.search || '');
                } catch (e) {
                        return null;
                }
        },

        applyInitialDeepLinkState: function () {
                var params = this.deepLinkParams();

                if (!params)
                        return;

                if (params.get('view') === 'admins') {
                        this.activeTab = 'management';
                        this.activeManagementTab = 'admins';
                }
        },

        runInitialDeepLinkAction: function () {
                var params = this.deepLinkParams();
                var admin;

                if (this.deepLinkHandled || !params)
                        return;

                if (params.get('view') !== 'admins' || params.get('action') !== 'pair')
                        return;

                admin = adminByDeepLinkValue(params.get('admin'));
                if (!admin)
                        return;

                this.deepLinkHandled = true;
                window.setTimeout(function () {
                        showAdminSettingsModal(admin);
                }, 0);
        },

        internetToggleButton: function (label, tone, blocked, currentBlocked, message) {
                var self = this;
                var active = blocked === currentBlocked;

                return E('button', {
                        'class': 'sf-action sf-action-' + tone + ' sf-internet-toggle ' + (active ? 'is-active' : 'is-inactive'),
                        'data-blocked': blocked ? '1' : '0',
                        'aria-pressed': active ? 'true' : 'false',
                        'click': function (ev) {
                                var page = ev.currentTarget.closest('.sf-page');

                                ev.preventDefault();
                                self.globalInternetBlocked = blocked;
                                self.updateInternetButtons(page, blocked);
                                notify(message, blocked ? 'warning' : 'info');
                        }
                }, label);
        },

        switchTab: function (button, tab) {
                var page = button.closest('.sf-page');

                this.activeTab = tab;

                page.querySelectorAll('.sf-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-tab') === tab);
                });

                page.querySelectorAll('.sf-tab-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-tab') !== tab;
                });

                if (tab === 'settings') {
                        var generalButton = page.querySelector('[data-settings-tab="general"]');
                        if (generalButton)
                                this.switchSettingsTab(generalButton, 'general');
                }

                if (tab === 'users') {
                        var devicesButton = page.querySelector('[data-user-list-tab="devices"]');
                        if (devicesButton)
                                this.switchUserListTab(devicesButton, 'devices');
                }

                if (tab === 'management') {
                        var schedulesButton = page.querySelector('[data-management-tab="schedules"]');
                        if (schedulesButton)
                                this.switchManagementTab(schedulesButton, 'schedules');
                }
        },

        openUserListMetric: function (button, userListTab) {
                var page = button.closest('.sf-page');
                var usersTabButton = page.querySelector('[data-tab="users"]');
                var userListButton;

                if (usersTabButton)
                        this.switchTab(usersTabButton, 'users');

                userListButton = page.querySelector('[data-user-list-tab="' + userListTab + '"]');
                if (userListButton)
                        this.switchUserListTab(userListButton, userListTab);
        },

        renderTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs' }, tabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab' + (self.activeTab === tab[0] ? ' active' : ''),
                                'data-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchTab(ev.currentTarget, tab[0]);
                                }
                        }, _(tab[1]));
                }));
        },

        switchSettingsTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeSettingsTab = tab;

                panel.querySelectorAll('.sf-settings-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-settings-tab') === tab);
                });

                panel.querySelectorAll('.sf-settings-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-settings-panel') !== tab;
                });

                if (tab === 'info' && routerInfo.status() !== 'loading')
                        loadRouterInformation(routerInfo.status() !== 'ready').catch(function () {});
        },

        renderSettingsTabRow: function (tabs, extraClass) {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-settings-tabs' + (extraClass ? ' ' + extraClass : '') }, tabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-settings-tab' + (self.activeSettingsTab === tab[0] ? ' active' : ''),
                                'data-settings-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchSettingsTab(ev.currentTarget, tab[0]);
                                }
                        }, _(tab[1]));
                }));
        },

        switchUserListTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeUserListTab = tab;

                panel.querySelectorAll('.sf-user-list-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-user-list-tab') === tab);
                });

                panel.querySelectorAll('.sf-user-list-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-user-list-panel') !== tab;
                });
        },

        renderUserListTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-user-list-tabs' }, userListTabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-user-list-tab' + (self.activeUserListTab === tab[0] ? ' active' : ''),
                                'data-user-list-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchUserListTab(ev.currentTarget, tab[0]);
                                }
                        }, _(tab[1]));
                }));
        },

        switchManagementTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeManagementTab = tab;

                panel.querySelectorAll('.sf-management-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-management-tab') === tab);
                });

                panel.querySelectorAll('.sf-management-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-management-panel') !== tab;
                });
        },

        renderManagementTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-user-list-tabs' }, managementTabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-management-tab' + (self.activeManagementTab === tab[0] ? ' active' : ''),
                                'data-management-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchManagementTab(ev.currentTarget, tab[0]);
                                }
                        }, _(tab[1]));
                }));
        },

        renderRootPasswordStatus: function () {
                if (rootPasswordIsSet) {
                        return '';
                }

                return E('div', {
                        'class': 'sf-root-password-gate',
                        'role': 'alertdialog',
                        'aria-modal': 'true'
                }, [E('div', { 'class': 'sf-root-password-card' }, [
                        E('h3', {}, _('Protect the router with a password')),
                        E('p', {}, rootPasswordCheckFailed ?
                                _('Sheepfold could not verify the router root password. Settings remain locked for safety. Install the current Sheepfold package or set the router password and reload this page.') :
                                _('The router root password is not set. Until you create it, anyone connected to the home network may be able to change router and Sheepfold settings.')),
                        E('a', {
                                'class': 'sf-action sf-action-positive',
                                'href': L.url('admin/system/admin')
                        }, _('Go to router password setup')),
                        E('button', {
                                'class': 'sf-action sf-action-neutral',
                                'click': function () { window.location.reload(); }
                        }, _('Check again'))
                ])]);
        },

        renderDevices: function (embedded) {
                var table = deviceTable(devices);
                var search = E('input', {
                        'class': 'cbi-input-text sf-search',
                        'placeholder': _('Search by name, IP, or MAC')
                });

                search.addEventListener('input', function () {
                        filterDeviceTable(table, search.value);
                });

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-toolbar sf-device-toolbar' }, [
                                search,
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showManualDeviceModal();
                                        }
                                }, _('Add device'))
                        ]),
                        devices.length ? '' : E('div', { 'class': 'sf-note sf-note-warning' }, _('No devices found in DHCP leases, ARP, or static DHCP leases yet.')),
                        table
                ]);
        },

        renderAllowlist: function (embedded) {
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('These devices are never blocked by global blocking or schedules.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar' }, [
                                        quickAllowlistButton(),
                                        manualListDeviceButton('allow')
                                ])
                        ]),
                        deviceTable(devices.filter(function (device) { return device.status === 'allow'; }), { compact: true, removeFromList: 'allowlist' })
                ]);
        },

        renderBlocklist: function (embedded) {
                var emergencyAccessEnabled = safeUciGet('sheepfold', 'global', 'domain_allowlist_for_blocklist', '1') === '1';

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.'))
                                ]),
                                manualListDeviceButton('blocked')
                        ]),
                        E('div', { 'class': 'sf-note ' + (emergencyAccessEnabled ? 'sf-note-ok' : 'sf-note-warning') }, emergencyAccessEnabled ?
                                _('Emergency-useful sites for blocklisted devices are enabled and still do not open router access.') :
                                _('Emergency-useful sites for blocklisted devices are disabled and still do not open router access.')),
                        deviceTable(devices.filter(function (device) { return device.status === 'blocked'; }), { compact: true, removeFromList: 'blocklist' })
                ]);
        },

        renderUserListPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-user-list-panel sf-settings-panel',
                        'data-user-list-panel': tab,
                        'hidden': this.activeUserListTab === tab ? null : 'hidden'
                }, content);
        },

        renderUsers: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        this.renderUserListTabs(),
                        this.renderUserListPanel('devices', this.renderDevices(true)),
                        this.renderUserListPanel('allowlist', this.renderAllowlist(true)),
                        this.renderUserListPanel('blocklist', this.renderBlocklist(true))
                ]);
        },

        renderManagementPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-management-panel sf-settings-panel',
                        'data-management-panel': tab,
                        'hidden': this.activeManagementTab === tab ? null : 'hidden'
                }, content);
        },

        renderManagement: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        this.renderManagementTabs(),
                        this.renderManagementPanel('schedules', this.renderSchedules(true)),
                        this.renderManagementPanel('groups', this.renderGroups(true)),
                        this.renderManagementPanel('admins', this.renderAdmins(true))
                ]);
        },

        renderSchedules: function (embedded) {
                return scheduleView.render({
                        sections: function () { return safeUciSections('sheepfold', 'schedule'); },
                        setEnabled: setScheduleEnabled,
                        targetText: scheduleTargetText,
                        dayText: scheduleDayText,
                        timeText: scheduleTimeText,
                        edit: showScheduleEditor,
                        remove: deleteSchedule,
                        bedtime: bedtimeEditor
                }, embedded);
        },
        renderGroups: function (embedded) {
                return groupView.render({
                        sections: function () { return safeUciSections('sheepfold', 'group'); },
                        devices: devices,
                        normalize: normalizeGroupName,
                        ensureDefaults: ensureDefaultGroupSections,
                        supplement: supplementGroupedDevicesFromUci,
                        noRestrictionsName: noRestrictionsGroupName,
                        notify: notify,
                        removeSection: function (sectionName) { uci.remove('sheepfold', sectionName); },
                        save: function () { return saveUciChanges(['sheepfold']); },
                        validColor: validGroupColor,
                        palette: groupColorPalette,
                        automaticColor: groupAutoColor,
                        deletionBlockReason: groupModel.deletionBlockReason,
                        displayName: displayGroupName,
                        iconButton: iconButton,
                        configure: showGroupSettingsModal,
                        deviceId: formattedDeviceDisplayId,
                        add: showAddGroupModal
                }, embedded);
        },
        renderEmergency: function () {
                registerEmergencySitesSaver();
                return E('div', { 'class': 'sf-settings-section' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', { 'class': 'sf-section-intro' }, _('Emergency-useful sites are a small editable list of necessary services that may stay available during restricted access.'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showSiteModal();
                                        }
                                }, _('Add site'))
                        ]),
                        E('div', { 'class': 'sf-domain-list' }, emergencySites.map(domainCard)),
                        E('div', { 'class': 'sf-note' }, _('Some services load maps, sign-in pages, or images from additional technical domains. If a site opens incompletely, add only the domains required for its useful function.'))
                ]);
        },

        readWifiNetworks: function () {
                return readWifiNetworksFromUci();
        },

        renderWifi: function () {
                var networks = this.readWifiNetworks();

                clearWifiNetworkEditors();

                return E('div', { 'class': 'sf-panel' }, [
                        networks.length ?
                                E('div', { 'class': 'sf-grid two' }, networks.map(function (network, index) {
                                        return wifiNetworkBox(network, index);
                                })) :
                                E('div', { 'class': 'sf-note sf-note-warning' }, _('No active Wi-Fi networks were found in the router wireless config.')),
                        networks.length ? wifiSaveBar() : ''
                ]);
        },

        integrationModeNotes: function (mode) {
                var notes = {
                        none: _('Sheepfold works alone.'),
                        adguard: _('Sheepfold blocks/allows devices before AdGuard Home DNS filtering.'),
                        podkop: _('Sheepfold must not overwrite Podkop-managed routing, Dnsmasq, nftables, or sing-box state.'),
                        adguard_podkop: _('Recommended chain: Sheepfold -> AdGuard Home -> Podkop.')
                };

                return notes[mode] || notes.none;
        },

        renderIntegrations: function () {
                var self = this;
                var mode = settingValue('integration_mode', 'none');
                var modeNote = E('span', {}, this.integrationModeNotes(mode));
                var modeSelect = E('select', {
                        'class': 'cbi-input-select',
                        'change': function (ev) {
                                var nextMode = ev.currentTarget.value;

                                setSettingsDraftOptions({
                                        integration_mode: nextMode,
                                        integration_mode_source: 'manual',
                                        integration_mode_user_set: '1'
                                });
                                modeNote.textContent = self.integrationModeNotes(nextMode);
                        }
                }, [
                        ['none', _('None')],
                        ['adguard', 'AdGuard Home'],
                        ['podkop', 'Podkop'],
                        ['adguard_podkop', 'AdGuard Home + Podkop']
                ].map(function (item) {
                        return E('option', { 'value': item[0], 'selected': item[0] === mode ? 'selected' : null }, item[1]);
                }));

                return E('div', { 'class': 'sf-settings-section' }, [
                        E('div', { 'class': 'sf-form-row' }, [
                                E('label', { 'class': 'sf-field sf-field-wide' }, [
                                        E('span', {}, _('Use together with')),
                                        modeSelect,
                                        E('small', {}, _('Auto-detected during installation. You can change it manually if needed.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box sf-status-card sf-status-warning' }, [
                                        E('h4', {}, _('AdGuard Home status')),
                                        E('p', {}, _('AdGuard Home filters DNS requests after Sheepfold allows a device. It helps block ads, trackers, and unwanted domains.')),
                                        E('strong', {}, 'API: pending'),
                                        E('p', {}, _('AdGuard Home API check should use the local AdGuard Home API when credentials are configured.'))
                                ]),
                                E('div', { 'class': 'sf-box sf-status-card sf-status-warning' }, [
                                        E('h4', {}, _('Podkop status')),
                                        E('p', {}, _('Podkop routes already allowed traffic according to its own routing rules. Sheepfold must not overwrite Podkop routing.')),
                                        E('strong', {}, 'service/package: pending'),
                                        E('p', {}, _('Podkop has no stable Sheepfold-facing API yet; detect package/service state and show conservative notes.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-note' }, [
                                E('strong', {}, _('Mode notes')),
                                modeNote
                        ]),
                        E('div', { 'class': 'sf-note' }, _('Automatic router changes must show integration-specific notes and create/export a backup before applying.')),
                        actionButton(_('Prepare integration settings'), 'danger', _('Integration setup must show planned changes, create an export, and require confirmation before applying.'))
                ]);
        },

        renderBot: function () {
                return E('div', { 'class': 'sf-settings-section' }, [
                        E('p', { 'class': 'sf-section-intro' }, _('Messenger integration lets approved parents receive notifications and control Sheepfold with short commands when they are away from home.')),
                        messengerSettingsBox()
                ]);
        },

        renderAdmins: function (embedded) {
                return administratorView.render({
                        administrators: admins,
                        sortHeader: adminSortHeader,
                        row: adminTableRow,
                        add: showAddAdministratorModal
                }, embedded);
        },
        renderLogs: function () {
                var logNode = E('div', { 'class': 'sf-log' }, renderLogRows());
                var filterUi;

                function refreshLogView() {
                        logNode.replaceChildren.apply(logNode, renderLogRows());
                }

                filterUi = createLogFilterUi(refreshLogView);

                return E('div', { 'class': 'sf-panel' }, [
                        E('p', { 'class': 'sf-section-intro' }, _('The log is stored in RAM for fast viewing and is cleared after router reboot. When USB flash, Yandex Disk, or Google Drive is configured, events are mirrored there too. Export masks sensitive fields.')),
                        E('div', { 'class': 'sf-log-toolbar-row' }, [
                                filterUi.toggleButton,
                                E('div', { 'class': 'sf-log-toolbar-actions' }, [
                                        E('button', {
                                                'class': 'sf-action sf-action-danger',
                                                'click': function (ev) {
                                                        ev.preventDefault();
                                                        fs.write(logCachePath(), '').then(function () {
                                                                logEntries = [];
                                                                refreshLogView();
                                                                notify(_('Log cleared.'), 'info');
                                                        }, function () {
                                                                notify(_('Could not clear log.'), 'warning');
                                                        });
                                                }
                                        }, _('Clear log')),
                                        E('button', {
                                                'class': 'sf-action sf-action-neutral',
                                                'click': function (ev) {
                                                        ev.preventDefault();
                                                        showLogExportModal();
                                                }
                                        }, _('Export masked'))
                                ])
                        ]),
                        filterUi.filtersWrap,
                        logNode
                ]);
        },

        renderSettingsGeneral: function () {
                return E('div', { 'class': 'sf-flat-form' }, [
                        saveSelectGlobalField(_('Application language'), 'language', 'ru', [
                                ['ru', _('Russian')],
                                ['en', _('English')],
                                ['zh_Hans', _('Chinese (Simplified)')]
                        ], null, null, _('Applies only to Sheepfold. Does not change the router LuCI language. The page reloads after Save.')),
                        appPortField(),
                        saveSelectGlobalField(_('New device behavior'), 'new_device_policy', 'allow', [
                                ['allow', _('Allow internet by default')],
                                ['restrict_until_configured', _('Restrict until configured')]
                        ]),
                        autoConfigureDevicesField(),
                        updateCheckInstallField(),
                        blocklistEmergencyAccessField(),
                        globalTextareaOptionField(
                                _('Blocked internet page text shown instead of websites'),
                                'blocked_page_text',
                                _('Internet is temporarily unavailable by family rules.'),
                                _('Settings saved.'),
                                _('Could not save settings.'),
                                null,
                                2
                        )
                ]);
        },

        /* SHEEPFOLD_AI_BEGIN */
        renderSettingsAi: function () {
                return aiSettingsBox();
        },
        /* SHEEPFOLD_AI_END */

        renderSettingsStorage: function () {
                return E('div', { 'class': 'sf-flat-form' }, [
                        E('p', { 'class': 'sf-note' },
                                _('Store journals in RAM to protect router flash memory. USB, Yandex Disk, or Google Drive can archive rotated logs and configuration backups when configured.')),
                        logStorageLocationField(),
                        cachePathField(),
                        saveSelectGlobalField(_('Log retention on router'), 'log_retention', '3d', [
                                ['1d', _('1 day')],
                                ['3d', _('3 days')],
                                ['7d', _('7 days')],
                                ['14d', _('14 days')],
                                ['30d', _('30 days')]
                        ]),
                        saveSelectGlobalField(_('Known offline devices cleanup'), 'offline_device_retention_days', '90', [
                                ['30', _('30 days')],
                                ['90', _('90 days')],
                                ['180', _('180 days')]
                        ]),
                        settingsDivider(_('USB flash settings')),
                        sectionFlagOptionField('usb', _('Use USB flash for Sheepfold'), 'enabled', '0'),
                        sectionInputField(
                                'usb',
                                _('USB partition device path'),
                                'device',
                                '',
                                '/dev/sda1',
                                _('Example: /dev/sda1. Sheepfold accepts only explicitly confirmed removable devices.')
                        ),
                        saveSelectSectionField('usb', _('USB role'), 'role', 'logs_only', [
                                ['logs_only', _('Logs only')],
                                ['swap_logs', _('Swap and logs')]
                        ], _('Automatic extroot from USB is disabled for safety. Only log archive roles are supported in this version.')),
                        sectionFlagOptionField('usb', _('Encrypt USB archive'), 'encrypt', '1')
                ]);
        },

        renderSettingsFeedback: function () {
                return feedbackPanel.render({
                        notify: notify,
                        errorText: routerBackend.errorText
                });
        },

        renderSettingsMisc: function () {
                return E('div', { 'class': 'sf-flat-form sf-misc-actions' }, [
                        settingsDivider(_('Wi-Fi settings')),
                        timeAutomationField(_('Enable Wi-Fi automatically'), 'wifi_auto_enable_mode', 'wifi_auto_enable_time', '07:00'),
                        timeAutomationField(_('Disable Wi-Fi automatically'), 'wifi_auto_disable_mode', 'wifi_auto_disable_time', '23:00'),
                        settingsDivider(_('Router time and NTP')),
                        routerTimeSettingsField(),
                        settingsDivider(_('WPS button')),
                        wpsActionField(_('WPS short button press'), 'wps_short_press_action'),
                        wpsActionField(_('WPS long button press'), 'wps_long_press_action'),
                        settingsDivider(_('Router LEDs')),
                        ledControlField(),
                        settingsDivider(_('Access priority')),
                        accessPriorityField(),
                        scheduleConflictPolicyField(),
				settingsDivider(_('Site list sources')),
				siteListStatus.panel(),
				siteListsUpdateIntervalField(),
                        globalTextareaOptionField(
                                _('Whitelist sources'),
                                'site_allowlist_sources',
                                defaultSiteAllowlistSources,
                                _('Whitelist sources saved.'),
                                _('Could not save whitelist sources.'),
                                _('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
                        ),
                        siteBlacklistModeField(),
                        globalTextareaOptionField(
                                _('Site blacklist sources'),
                                'site_blocklist_sources',
                                defaultSiteBlocklistSources,
                                _('Site blacklist sources saved.'),
                                _('Could not save site blacklist sources.'),
                                _('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
                        ),
                        settingsDivider(_('Other actions')),
                        saveSelectGlobalField(_('Export mode'), 'export_mode', 'safe', [
                                ['safe', _('Readable JSON without secrets')],
                                ['encrypted', _('Encrypted full backup')]
                        ]),
                        E('div', { 'class': 'sf-action-stack' }, [
                                E('button', {
                                        'class': 'sf-action sf-action-neutral',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                importSettingsAndUsers();
                                        }
                                }, _('Import all settings and user list')),
                                E('button', {
                                        'class': 'sf-action sf-action-neutral',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                exportSettingsAndUsers();
                                        }
                                }, _('Export all settings and user list')),
                                updateAppRow(),
                                rebootRouterButton()
                        ])
                ]);
        },

        renderSettingsPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-settings-panel',
                        'data-settings-panel': tab,
                        'hidden': this.activeSettingsTab === tab ? null : 'hidden'
                }, content);
        },

        renderSettings: function () {
                if (!isKnownSettingsTab(this.activeSettingsTab))
                        this.activeSettingsTab = 'general';

                resetSettingsDraft();

                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-settings-tabs-row' }, [
                                E('div', { 'class': 'sf-settings-tabs-wrap' }, [
                                        this.renderSettingsTabRow(settingsTabsPrimary),
                                        this.renderSettingsTabRow(settingsTabsSecondary, 'sf-settings-tabs-secondary')
                                ]),
                                settingsSaveBar(true)
                        ]),
                        this.renderSettingsPanel('info', routerInformationPanel()),
                        this.renderSettingsPanel('general', this.renderSettingsGeneral()),
                        this.renderSettingsPanel('integrations', this.renderIntegrations()),
                        this.renderSettingsPanel('messenger', this.renderBot()),
                        this.renderSettingsPanel('emergency', this.renderEmergency()),
                        this.renderSettingsPanel('misc', this.renderSettingsMisc()),
                        this.renderSettingsPanel('feedback', this.renderSettingsFeedback()),
                        /* SHEEPFOLD_AI_BEGIN */
                        this.renderSettingsPanel('ai', this.renderSettingsAi()),
                        /* SHEEPFOLD_AI_END */
                        this.renderSettingsPanel('storage', this.renderSettingsStorage()),
                        settingsSaveBar(false)
                ]);
        },

        renderDonation: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('Support the project'))
                                ])
                        ]),
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
                        'hidden': this.activeTab === tab ? null : 'hidden'
                }, content);
        },

        renderPanels: function () {
                return [
                        this.renderPanel('users', this.renderUsers()),
                        this.renderPanel('management', this.renderManagement()),
                        this.renderPanel('wifi', this.renderWifi()),
                        this.renderPanel('logs', this.renderLogs()),
                        this.renderPanel('settings', this.renderSettings()),
                        this.renderPanel('donation', this.renderDonation())
                ];
        },

        render: function () {
                // Версия ассетов берётся из UCI, куда postinst пишет PKG_VERSION-PKG_RELEASE.
                // Это сохраняет единый cache-busting для JS/CSS и избавляет пользователя
                // от ручной очистки кэша браузера после обновления пакета.
                var assetVersion = safeUciGet('sheepfold', 'global', 'ui_asset_version', '0.1.0');
                var self = this;
                var internetBlocked = this.isGlobalInternetBlocked();
                var allowlistCount = devices.filter(function (device) { return device.status === 'allow'; }).length;
                var blocklistCount = devices.filter(function (device) { return device.status === 'blocked'; }).length;
                var restrictedCount = devices.filter(function (device) {
                        return device.status === 'restricted' || device.status === 'scheduled';
                }).length;
                var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);
                var page;
                activeOverviewView = this;
                var header = E('div', { 'class': 'sf-header' }, [
                        E('div', {}, [
                                E('h2', {}, _('Sheepfold Family Internet Control')),
                                E('p', {}, _("Manage family devices' internet access through this OpenWRT router."))
                        ]),
                        E('div', { 'class': 'sf-header-actions' }, [
                                this.internetToggleButton(_('Internet enabled'), 'positive', false, internetBlocked, _('Global block would be disabled after confirmation.')),
                                this.internetToggleButton(_('Internet disabled'), 'danger', true, internetBlocked, _('Global block would block every device except allowlist.'))
                        ])
                ]);

                this.applyInitialDeepLinkState();
                acknowledgeNewDeviceLedAlert('luci');

                if (!rootPasswordIsSet) {
                        return E('div', { 'class': 'sf-page' }, [
                                E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                                header,
                                this.renderRootPasswordStatus()
                        ]);
                }

                page = E('div', { 'class': 'sf-page' }, [
                        E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                        header,
                        E('div', { 'class': 'sf-metrics' }, [
                                metric(_('Devices'), String(devices.length), 'neutral', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }, 'devices'),
                                metric(_('Allowlist'), String(allowlistCount), 'positive', function (button) {
                                        self.openUserListMetric(button, 'allowlist');
                                }, 'allowlist'),
                                metric(_('Restricted'), String(restrictedCount), 'warning', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }, 'restricted'),
                                metric(_('Blocklist'), String(blocklistCount), 'danger', function (button) {
                                        self.openUserListMetric(button, 'blocklist');
                                }, 'blocklist')
                        ]),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);

                this.runInitialDeepLinkAction();

                return page;
        }
});
