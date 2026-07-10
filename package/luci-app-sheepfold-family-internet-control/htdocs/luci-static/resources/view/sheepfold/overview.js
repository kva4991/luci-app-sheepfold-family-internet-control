'use strict';
'require view';
'require ui';
'require uci';
'require fs';

var devices = [];
var NOT_CONFIGURED_GROUP = 'Not configured';
var defaultLogCachePath = '/tmp/sheepfold/events.log';
var defaultSiteAllowlistSources = [
        'UT1 child | https://dsi.ut-capitole.fr/blacklists/index_en.php#child'
].join('\n');
var defaultSiteBlocklistSources = [
        'UT1 adult, malware, phishing, gambling, games, vpn | https://dsi.ut-capitole.fr/blacklists/index_en.php',
        'StevenBlack hosts gambling-porn | https://github.com/StevenBlack/hosts',
        'HaGeZi Threat Intelligence Feeds | https://github.com/hagezi/dns-blocklists',
        'URLhaus malware URLs | https://urlhaus.abuse.ch/api/'
].join('\n');

var emergencySites = [
        ['gosuslugi.ru', 'Госуслуги', 'Государственные услуги'],
        ['esia.gosuslugi.ru', 'ЕСИА', 'Вход в государственную учётную запись'],
        ['mos.ru', 'Услуги Москвы', 'Городские сервисы'],
        ['school.mos.ru', 'Московская школа', 'Доступ к школе'],
        ['dnevnik.ru', 'Дневник.ру', 'Школьный дневник'],
        ['ya.ru', 'Поиск Яндекса', 'Узкая точка входа в поиск'],
        ['2gis.ru', '2ГИС', 'Карты и организации']
];

var admins = [
        {
                id: 'A-0001',
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

var rootPasswordIsSet = true;
// Настройки на этой странице сначала живут в черновике, а не сразу пишутся в UCI.
// Так родитель явно нажимает "Сохранить", получает одно понятное уведомление,
// а LuCI не копит неожиданную плашку "не принятые изменения" после каждого select/input.
var settingsDraft = {};
var settingsSpecialSavers = [];
var settingsIsSaving = false;
var routerInfoState = {
        status: 'idle',
        values: null,
        error: null,
        pending: null,
        listeners: []
};

var tabs = [
        ['users', _('User lists')],
        ['management', _('User management')],
        ['wifi', _('Wi-Fi')],
        ['logs', _('Logs')],
        ['settings', _('Settings')],
        ['donation', _('Donation')]
];

var settingsTabsPrimary = [
        ['info', _('Information')],
        ['general', _('General')],
        ['integrations', _('Integrations')],
        ['messenger', _('Messenger')],
        ['emergency', _('Emergency-useful sites')],
        ['misc', _('Misc')]
];

var settingsTabsSecondary = [
        ['ai', _('AI assistant')],
        ['storage', _('Router memory management')]
];

function isKnownSettingsTab(tab) {
        return settingsTabsPrimary.some(function (item) { return item[0] === tab; }) ||
                settingsTabsSecondary.some(function (item) { return item[0] === tab; });
}

var userListTabs = [
        ['devices', _('All devices')],
        ['allowlist', _('Allowlist')],
        ['blocklist', _('Blocklist')]
];

var managementTabs = [
        ['schedules', _('Schedules')],
        ['groups', _('Groups')],
        ['admins', _('Administrators')]
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
        settingsDraft = {};
        settingsSpecialSavers = [];
        settingsIsSaving = false;
}

function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
}

function settingValue(option, defaultValue) {
        return hasOwn(settingsDraft, option) ?
                settingsDraft[option] :
                safeUciGet('sheepfold', 'global', option, defaultValue || '');
}

function updateSettingsSaveButtons() {
        var dirty = Object.keys(settingsDraft).length > 0 || settingsSpecialSavers.some(function (saver) {
                return saver.isChanged && saver.isChanged();
        });

        document.querySelectorAll('[data-settings-save]').forEach(function (button) {
                button.disabled = settingsIsSaving ? true : null;
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
        settingsDraft[option] = String(value == null ? '' : value);
        markSettingsDraftChanged();
}

function setSettingsDraftSectionOption(section, option, value) {
        settingsDraft[section + '.' + option] = String(value == null ? '' : value);
        markSettingsDraftChanged();
}

function sectionSettingValue(section, option, defaultValue) {
        var key = section + '.' + option;

        if (hasOwn(settingsDraft, key))
                return settingsDraft[key];

        return safeUciGet('sheepfold', section, option, defaultValue || '');
}

function setSettingsDraftOptions(options) {
        Object.keys(options).forEach(function (option) {
                settingsDraft[option] = String(options[option] == null ? '' : options[option]);
        });
        markSettingsDraftChanged();
}

function registerSettingsSpecialSaver(saver) {
        settingsSpecialSavers.push(saver);
}

function sameObjectValues(left, right) {
        var leftKeys = Object.keys(left || {});
        var rightKeys = Object.keys(right || {});

        if (leftKeys.length !== rightKeys.length)
                return false;

        return leftKeys.every(function (key) {
                return String(left[key] == null ? '' : left[key]) === String(right[key] == null ? '' : right[key]);
        });
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
}

function applySettingsSideEffects(options) {
        var chain = Promise.resolve();

        if (hasOwn(options, 'site_lists_update_interval'))
                chain = chain.then(function () {
                        return routerControl(['site-lists-cron-apply']);
                });

        if (hasOwn(options, 'router_led_control'))
                chain = chain.then(function () {
                        return routerControl(['led-apply']);
                });

        if (hasOwn(options, 'app_port'))
                chain = chain.then(function () {
                        return fs.write('/www/.well-known/sheepfold.json', appDiscoveryJson(options.app_port)).catch(function () {});
                }).then(function () {
                        return fs.exec('/etc/init.d/sheepfold', ['restart']).catch(function () {});
                });

        if (hasOwn(options, 'ai_individual_logs') && options.ai_individual_logs === '1')
                chain = chain.then(function () {
                        return fs.exec('/usr/libexec/sheepfold/sheepfold-openssl-ensure', []).then(function (result) {
                                if (result.code !== 0)
                                        throw new Error(_('OpenSSL check failed. Per-device AI logs stay disabled.'));
                        });
                });

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
        var options = Object.assign({}, settingsDraft);
        var specialSavers = settingsSpecialSavers.filter(function (saver) {
                return saver.isChanged && saver.isChanged();
        });

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

        settingsIsSaving = true;
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
                settingsDraft = {};
                specialSavers.forEach(function (saver) {
                        if (saver.accept)
                                saver.accept();
                });
                notifyCentered(_('Settings saved successfully.'));
        }, function (error) {
                notify(_('Could not save settings.') + ' ' + commandErrorText(error, ''), 'warning');
                return Promise.reject(error);
        }).finally(function () {
                settingsIsSaving = false;
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

                                mode = hasOwn(settingsDraft, 'wifi_auto_disable_mode') ?
                                        settingsDraft.wifi_auto_disable_mode :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_mode', 'never');
                                time = hasOwn(settingsDraft, 'wifi_auto_disable_time') ?
                                        settingsDraft.wifi_auto_disable_time :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_time', '23:00');

                                if ((hasOwn(settingsDraft, 'wifi_auto_disable_mode') || hasOwn(settingsDraft, 'wifi_auto_disable_time')) && mode === 'time') {
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

function metric(label, value, tone, handler) {
        return E('button', {
                'class': 'sf-metric sf-metric-' + tone,
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
        return fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', args);
}

function ensureRouterControlOk(result, fallback) {
        var code = Number(result && result.code || 0);
        var output = String(result && (result.stdout || result.stderr) || '').trim();

        if (code !== 0)
                throw new Error(output || fallback || _('Action failed.'));

        return result;
}

function parseKeyValueOutput(text) {
        var values = {};

        String(text || '').split(/\r?\n/).forEach(function (line) {
                var index = line.indexOf('=');

                if (index > 0)
                        values[line.slice(0, index)] = line.slice(index + 1);
        });

        return values;
}

function commandErrorText(error, fallback) {
        var text = fallback || _('Action failed.');

        if (error) {
                text = error.stderr || error.stdout || error.message || text;
                text = String(text).trim() || fallback || _('Action failed.');
        }

        return text;
}

function formatPingMs(value) {
        value = String(value == null ? '' : value).trim();

        if (!value || value === 'timeout')
                return _('No response');

        return value + ' ms';
}

function formatInternetProbeLine(host, pingMs) {
        var pingValue = String(pingMs == null ? '' : pingMs).trim();

        if (!pingValue || pingValue === 'timeout')
                return host + ' ' + _('does not respond');

        return host + ' ' + _('responds') + ' (' + _('ping') + ' ' + pingValue + ')';
}

function internetStatusDetails(values) {
        var status = translatedStatus(values.internet_status);
        var reason = String(values.internet_reason || '').trim();
        var lines = [
                status,
                formatInternetProbeLine('ya.ru', values.ping_ya_ru_ms || values.ping_yandex_ms),
                formatInternetProbeLine('google.com', values.ping_google_com_ms),
                formatInternetProbeLine('youtube.com', values.ping_youtube_com_ms)
        ];

        if (reason && values.internet_status !== 'online')
                lines.splice(1, 0, reason);

        return E('div', { 'class': 'sf-info-multiline' }, lines.map(function (line) {
                return E('div', {}, line);
        }));
}

function routerInfoHasData(values) {
        if (!values)
                return false;

        return !!(
                values.sheepfold_version ||
                values.current_time ||
                values.router_model ||
                values.firmware_version ||
                values.openwrt_release ||
                values.internet_status ||
                values.storage_space
        );
}

function notifyRouterInfoListeners() {
        routerInfoState.listeners.slice().forEach(function (listener) {
                listener();
        });
}

function routerControlWithTimeout(args, timeoutMs) {
        var timeout = timeoutMs || 20000;

        return Promise.race([
                routerControl(args),
                new Promise(function (_resolve, reject) {
                        window.setTimeout(function () {
                                reject(new Error(_('Router command timed out.')));
                        }, timeout);
                })
        ]);
}

function loadRouterInformation(force) {
        if (routerInfoState.pending && !force)
                return routerInfoState.pending;

        routerInfoState.status = 'loading';
        routerInfoState.error = null;
        notifyRouterInfoListeners();

        routerInfoState.pending = routerControlWithTimeout(['router-info']).then(function (result) {
                var code = Number(result && result.code || 0);
                var values = parseKeyValueOutput(result.stdout || '');

                if (code !== 0)
                        throw new Error(commandErrorText(result, _('Could not load router information.')));

                if (!routerInfoHasData(values))
                        throw new Error(_('Router diagnostics returned empty data. Try Refresh or run sheepfold-router-control router-info on the router.'));

                routerInfoState.values = values;
                routerInfoState.status = 'ready';
                routerInfoState.error = null;
                notifyRouterInfoListeners();
                return values;
        }).catch(function (error) {
                routerInfoState.status = 'error';
                routerInfoState.error = commandErrorText(error, _('Could not load router information.'));
                notifyRouterInfoListeners();
                return Promise.reject(error);
        }).finally(function () {
                routerInfoState.pending = null;
        });

        return routerInfoState.pending;
}

function rebootRouterButton() {
        return E('button', {
                'class': 'sf-action sf-action-danger',
                'click': function (ev) {
                        ev.preventDefault();

                        if (!window.confirm(_('Reboot router now?')))
                                return;

                        fs.write('/tmp/sheepfold/reboot.request', String(Date.now()) + '\n').then(function () {
                                notify(_('Router reboot request queued.'), 'warning');
                        }, function () {
                                notify(_('Could not queue router reboot request.'), 'warning');
                        });
                }
        }, _('Reboot router'));
}

function updateAppButton() {
        return E('button', {
                'class': 'sf-action sf-action-danger',
                'click': function (ev) {
                        var button = ev.currentTarget;
                        var spinner;
                        var statusNode;
                        var outputNode;
                        var pollTimer = null;
                        var pollingActive = true;

                        ev.preventDefault();

                        if (!window.confirm(_('Install Sheepfold update now?')))
                                return;

                        button.disabled = true;

                        spinner = E('span', { 'class': 'sf-spinner' });
                        statusNode = E('p', {}, _('Update started. Do not close this page until the result appears.'));
                        outputNode = E('pre', { 'class': 'sf-pre' }, _('Starting update...'));

                        function closeModal() {
                                pollingActive = false;
                                if (pollTimer)
                                        window.clearTimeout(pollTimer);
                                ui.hideModal();
                        }

                        function finishUpdate(spinnerClass, message, notificationType) {
                                pollingActive = false;
                                if (pollTimer)
                                        window.clearTimeout(pollTimer);
                                spinner.className = 'sf-spinner ' + spinnerClass;
                                statusNode.textContent = message;
                                button.disabled = false;
                                if (notificationType)
                                        notify(message, notificationType);
                        }

                        function pollUpdate() {
                                if (!pollingActive)
                                        return;

                                Promise.all([
                                        fs.read('/tmp/sheepfold/update.status').catch(function () { return ''; }),
                                        fs.read('/tmp/sheepfold/update.log').catch(function () { return ''; })
                                ]).then(function (values) {
                                        var status = String(values[0] || '').trim();
                                        var log = String(values[1] || '').trim();

                                        outputNode.textContent = log || _('Update log is empty yet.');

                                        if (status === 'ok') {
                                                finishUpdate('sf-spinner-done', _('Update completed. Refresh LuCI if the interface still shows old files.'), 'info');
                                                return;
                                        }

                                        if (status === 'no_update') {
                                                finishUpdate('sf-spinner-done', _('No updates available. Installed version is already current.'), 'info');
                                                return;
                                        }

                                        if (status.indexOf('failed') === 0) {
                                                finishUpdate('sf-spinner-failed', _('Update failed. See log above.'), 'warning');
                                                return;
                                        }

                                        statusNode.textContent = _('Update is running. Waiting for router response...');
                                        pollTimer = window.setTimeout(pollUpdate, 2000);
                                }, function () {
                                        statusNode.textContent = _('Update is running. Waiting for router response...');
                                        pollTimer = window.setTimeout(pollUpdate, 2000);
                                });
                        }

                        ui.showModal(_('Update result'), [
                                E('div', { 'class': 'sf-update-progress' }, [
                                        spinner,
                                        statusNode
                                ]),
                                outputNode,
                                E('div', { 'class': 'right sf-modal-actions' }, [
                                        E('button', {
                                                'class': 'btn cbi-button',
                                                'click': closeModal
                                        }, _('Close'))
                                ])
                        ]);

                        Promise.all([
                                fs.write('/tmp/sheepfold/update.status', 'queued\n'),
                                fs.write('/tmp/sheepfold/update.log', _('Checking for updates...') + '\n'),
                                fs.write('/tmp/sheepfold/update.request', String(Date.now()) + '\n')
                        ]).then(function () {
                                statusNode.textContent = _('Checking for updates...');
                                outputNode.textContent = _('Checking for updates...');
                                pollUpdate();
                        }, function (error) {
                                outputNode.textContent = String(error && error.message ? error.message : error);
                                finishUpdate('sf-spinner-failed', _('Could not queue update request.'), 'warning');
                                button.disabled = false;
                        });
                }
        }, _('Update app'));
}

function updateVersionStatusText(version, status) {
        return _('current version') + ' ' + version + ' (' + _(status) + ')';
}

function updateAppRow() {
        var version = safeUciGet('sheepfold', 'global', 'ui_asset_version', 'unknown') || 'unknown';
        var statusNode = E('span', {
                'class': 'sf-update-version sf-update-version-checking'
        }, updateVersionStatusText(version, 'checking'));

        window.setTimeout(function () {
                fs.exec('/usr/libexec/sheepfold/sheepfold-updater', ['check']).then(function (result) {
                        var output = String((result && (result.stdout || result.stderr)) || '');
                        var status = 'could not check';
                        var statusClass = 'sf-update-version-unknown';

                        if (/No updates available|Обновлений нет/i.test(output)) {
                                status = 'up to date';
                                statusClass = 'sf-update-version-ok';
                        } else if (/Update is available|Доступно обновление/i.test(output)) {
                                status = 'outdated';
                                statusClass = 'sf-update-version-warning';
                        }

                        statusNode.className = 'sf-update-version ' + statusClass;
                        statusNode.textContent = updateVersionStatusText(version, status);
                }, function () {
                        statusNode.className = 'sf-update-version sf-update-version-unknown';
                        statusNode.textContent = updateVersionStatusText(version, 'could not check');
                });
        }, 0);

        return E('div', { 'class': 'sf-update-row' }, [
                updateAppButton(),
                statusNode
        ]);
}

function infoValue(value, fallback) {
        value = String(value == null ? '' : value).trim();
        return value || fallback || 'unknown';
}

function translatedStatus(value) {
        var labels = {
                online: _('Online'),
                offline: _('Offline'),
                limited: _('Limited'),
                unknown: _('Unknown'),
                enabled: _('Enabled'),
                disabled: _('Disabled'),
                yes: _('Installed'),
                no: _('Not installed')
        };

        return labels[value] || value || _('Unknown');
}

function packageVersionStatusLabel(status) {
        var labels = {
                up_to_date: _('package up to date'),
                outdated: _('package outdated')
        };

        return labels[status] || '';
}

function formatInstalledPackageInfo(installed, version, versionStatus) {
        var versionText = infoValue(version);

        if (installed === 'yes') {
                var statusLabel = packageVersionStatusLabel(versionStatus);

                if (statusLabel)
                        versionText += ', ' + statusLabel;
        }

        return translatedStatus(installed) + ' (' + versionText + ')';
}

function informationRow(label, value) {
        return E('div', { 'class': 'sf-info-row' }, [
                E('span', {}, label),
                E('strong', {}, value)
        ]);
}

function renderWifiModulesInfo(values) {
        var count = parseInt(values.wifi_count || '0', 10) || 0;
        var rows = [];
        var i;

        for (i = 1; i <= count; i++) {
                rows.push(E('div', { 'class': 'sf-info-table-row' }, [
                        E('div', {}, infoValue(values['wifi_' + i + '_name'])),
                        E('div', {}, translatedStatus(values['wifi_' + i + '_status'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_band'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_channel'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_type'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_path'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_country'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_mode']))
                ]));
        }

        if (!rows.length)
                return E('div', { 'class': 'sf-note sf-note-warning' }, _('No active Wi-Fi networks were found in the router wireless config.'));

        return E('div', { 'class': 'sf-info-table sf-info-wifi-table' }, [
                E('div', { 'class': 'sf-info-table-row sf-info-table-head' }, [
                        E('div', {}, _('Module')),
                        E('div', {}, _('Status')),
                        E('div', {}, _('Band')),
                        E('div', {}, _('Channel')),
                        E('div', {}, _('Driver/type')),
                        E('div', {}, _('Path')),
                        E('div', {}, _('Country')),
                        E('div', {}, _('Mode'))
                ])
        ].concat(rows));
}

function renderRouterInfoContent(body, values) {
        var podkopText = formatInstalledPackageInfo(values.podkop_installed, values.podkop_version, values.podkop_version_status);
        var adguardText = translatedStatus(values.adguard_installed) + ' (' + infoValue(values.adguard_version) + ')';

        body.replaceChildren(
                E('div', { 'class': 'sf-grid two sf-info-grid' }, [
                        E('div', { 'class': 'sf-box' }, [
                                informationRow(_('Current router time'), infoValue(values.current_time)),
                                informationRow(_('Current Sheepfold version'), infoValue(values.sheepfold_version)),
                                informationRow(_('Internet connection status'), internetStatusDetails(values)),
                                informationRow(_('Router firmware version'), infoValue(values.firmware_version)),
                                informationRow(_('OpenWRT release'), infoValue(values.openwrt_release)),
                                informationRow(_('Kernel version'), infoValue(values.kernel_version))
                        ]),
                        E('div', { 'class': 'sf-box' }, [
                                informationRow(_('Router model'), infoValue(values.router_model)),
                                informationRow(_('Router uptime'), infoValue(values.uptime)),
                                informationRow(_('Load average'), infoValue(values.load_average)),
                                informationRow(_('Memory'), infoValue(values.memory)),
                                informationRow(_('Router storage'), infoValue(values.storage_space)),
                                informationRow(_('LAN ports'), infoValue(values.lan_ports_count, '0') + ' (' + infoValue(values.lan_ports) + ')'),
                                informationRow(_('Podkop'), podkopText),
                                informationRow(_('AdGuard Home'), adguardText)
                        ])
                ]),
                E('div', { 'class': 'sf-box' }, [
                        E('h4', {}, _('Wi-Fi modules')),
                        renderWifiModulesInfo(values)
                ])
        );
}

function routerInfoLoadingSpinner() {
        return E('div', { 'class': 'sf-info-loading' }, [
                E('div', { 'class': 'sf-spinner', 'aria-hidden': 'true' })
        ]);
}

function paintRouterInformationPanel(body, refreshButton) {
        if (routerInfoState.status === 'loading' || routerInfoState.status === 'idle') {
                body.replaceChildren(routerInfoLoadingSpinner());
                if (refreshButton)
                        refreshButton.disabled = true;
                return;
        }

        if (refreshButton)
                refreshButton.disabled = null;

        if (routerInfoState.status === 'error') {
                body.replaceChildren(E('div', { 'class': 'sf-note sf-note-warning' }, routerInfoState.error));
                return;
        }

        renderRouterInfoContent(body, routerInfoState.values || {});
}

function routerInformationPanel() {
        var body = E('div', { 'class': 'sf-info-body' });
        var refreshButton;
        var paint = function () {
                paintRouterInformationPanel(body, refreshButton);
        };

        refreshButton = E('button', {
                'class': 'sf-action sf-action-neutral',
                'click': function (ev) {
                        ev.preventDefault();
                        loadRouterInformation(true).catch(function () {});
                }
        }, _('Refresh information'));

        routerInfoState.listeners = [paint];
        paint();

        if (routerInfoState.status === 'idle')
                window.setTimeout(function () {
                        loadRouterInformation().catch(function () {});
                }, 0);

        return E('div', { 'class': 'sf-settings-section' }, [
                E('div', { 'class': 'sf-panel-head' }, [
                        E('div', {}, [
                                E('p', { 'class': 'sf-section-intro' }, _('Router information'))
                        ]),
                        refreshButton
                ]),
                body
        ]);
}

function maskLogMessage(message) {
        return String(message || '')
                .replace(/\b([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2})\b/gi, function (match, first, second, third, fourth, fifth, sixth) {
                        return [first, second, third, 'xx', 'xx', sixth].join(':').toUpperCase();
                })
                .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x');
}

function parseRamLog(text) {
        return String(text || '').split(/\r?\n/).map(function (line) {
                var parts;

                line = line.trim();
                if (!line)
                        return null;

                parts = line.split('\t');
                if (parts.length >= 2) {
                        return {
                                time: parts.shift(),
                                message: parts.join('\t')
                        };
                }

                return {
                        time: '',
                        message: line
                };
        }).filter(Boolean);
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
        var match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);

        if (!match)
                return null;

        return new Date(
                Number(match[3]),
                Number(match[2]) - 1,
                Number(match[1]),
                Number(match[4]),
                Number(match[5]),
                Number(match[6])
        );
}

function filterLogEntriesByPeriod(period, fromValue, toValue) {
        var now = new Date();
        var from = null;
        var to = null;

        if (period === 'hour')
                from = new Date(now.getTime() - 60 * 60 * 1000);
        else if (period === 'week')
                from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else if (period === 'custom') {
                from = fromValue ? new Date(fromValue) : null;
                to = toValue ? new Date(toValue) : null;
        }

        if (period === 'all')
                return logEntries.slice();

        return logEntries.filter(function (entry) {
                var time = parseLogTime(entry.time);

                if (!time)
                        return false;
                if (from && time < from)
                        return false;
                if (to && time > to)
                        return false;

                return true;
        });
}

function logMessagePhraseOptions() {
        return [
                ['', _('All messages')],
                ['new_device', _('New device detected')],
                ['manual_add', _('Device added manually')],
                ['allowlist_add', _('Device added to allowlist')],
                ['blocklist_add', _('Device added to blocklist')],
                ['auto_group', _('Device auto-assigned to a group')],
                ['router_access_blocked', _('Router settings access blocked')],
                ['wan_down', _('Router internet lost')],
                ['wan_up', _('Router internet restored')],
                ['wifi_on', _('Wi-Fi enabled by Sheepfold')],
                ['wifi_off', _('Wi-Fi disabled by Sheepfold')],
                ['wps', _('WPS pairing window')],
                ['global_block', _('Global internet block toggled')]
        ];
}

function logPhrasePattern(phraseKey) {
        var patterns = {
                new_device: /Обнаружено новое устройство/i,
                manual_add: /Устройство добавлено вручную/i,
                allowlist_add: /Устройство добавлено в белый список/i,
                blocklist_add: /Устройство добавлено в чёрный список|Устройство заблокировано/i,
                auto_group: /автоматически добавлено в группу/i,
                router_access_blocked: /пыталось открыть настройки роутера/i,
                wan_down: /У роутера пропал интернет/i,
                wan_up: /Интернет на роутере восстановлен/i,
                wifi_on: /Wi-Fi включён Sheepfold/i,
                wifi_off: /Wi-Fi отключён Sheepfold/i,
                wps: /WPS-подключение|Окно WPS-добавления/i,
                global_block: /Глобальная блокировка интернета/i
        };

        return patterns[phraseKey] || null;
}

function logEntryMatchesPhrase(entry, phraseKey) {
        if (!phraseKey)
                return true;

        var pattern = logPhrasePattern(phraseKey);

        return pattern ? pattern.test(String(entry.message || '')) : true;
}

function logEntryMatchesNeedle(entry, needle, kind) {
        needle = String(needle || '').trim();

        if (!needle)
                return true;

        var message = String(entry.message || '');

        if (kind === 'mac') {
                var normalized = normalizeMac(needle).toLowerCase();

                return normalized ? message.toLowerCase().indexOf(normalized) !== -1 : true;
        }

        if (kind === 'ip')
                return message.indexOf(needle) !== -1;

        return message.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
}

function filterLogEntriesForView(filters) {
        filters = filters || logViewFilters;

        return logEntries.filter(function (entry) {
                var time = parseLogTime(entry.time);
                var from = filters.from ? new Date(filters.from) : null;
                var to = filters.to ? new Date(filters.to) : null;

                if (from || to) {
                        if (!time)
                                return false;
                        if (from && time < from)
                                return false;
                        if (to && time > to)
                                return false;
                }

                if (!logEntryMatchesNeedle(entry, filters.ip, 'ip'))
                        return false;
                if (!logEntryMatchesNeedle(entry, filters.mac, 'mac'))
                        return false;
                if (!logEntryMatchesNeedle(entry, filters.deviceName, 'name'))
                        return false;
                if (!logEntryMatchesPhrase(entry, filters.phrase))
                        return false;

                return true;
        });
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
        if (!entries.length)
                return _('Log is empty.') + '\n';

        return entries.map(function (entry) {
                return entry.time + ' ' + maskLogMessage(_(entry.message));
        }).join('\n') + '\n';
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

function secretOptionName(name) {
        return /(password|passwd|token|secret|key|cookie|session)/i.test(String(name || ''));
}

function exportPlainSection(section) {
        var result = {};

        Object.keys(section || {}).forEach(function (key) {
                var value = section[key];

                if (typeof value === 'function')
                        return;

                result[key] = secretOptionName(key) ? '[secret]' : value;
        });

        return result;
}

function exportSections(config, type) {
        return safeUciSections(config, type).map(exportPlainSection);
}

function sheepfoldSettingsExportText() {
        var payload = {
                format: 'sheepfold-settings-export-v1',
                app: 'luci-app-sheepfold-family-internet-control',
                exportedAt: new Date().toISOString(),
                sheepfold: {
                        global: exportSections('sheepfold', 'global'),
                        devices: exportSections('sheepfold', 'device'),
                        lists: exportSections('sheepfold', 'list'),
                        groups: exportSections('sheepfold', 'group'),
                        schedules: exportSections('sheepfold', 'schedule'),
                        sites: exportSections('sheepfold', 'site')
                },
                router: {
                        dhcpHosts: exportSections('dhcp', 'host'),
                        wifiDevices: exportSections('wireless', 'wifi-device'),
                        wifiIfaces: exportSections('wireless', 'wifi-iface')
                },
                uiState: {
                        detectedDevices: devices.map(function (device) {
                                return Object.assign({}, device);
                        }),
                        administrators: admins.map(function (admin) {
                                var exportedAdmin = Object.assign({}, admin);

                                delete exportedAdmin.temporaryPassword;
                                return exportedAdmin;
                        }),
                        emergencySites: emergencySites.map(function (site) {
                                return site.slice();
                        })
                }
        };

        return JSON.stringify(payload, null, 2) + '\n';
}

function exportSettingsAndUsers() {
        var stamp = new Date().toISOString().replace(/[:.]/g, '-');

        downloadTextFile('sheepfold-settings-' + stamp + '.json', sheepfoldSettingsExportText());
        notify(_('Settings export saved.'), 'info');
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

                        reader = new FileReader();
                        reader.onload = function () {
                                var parsed;

                                try {
                                        parsed = JSON.parse(String(reader.result || ''));
                                } catch (e) {
                                        notify(_('Import file format is not recognized.'), 'warning');
                                        return;
                                }

                                if (!parsed || parsed.format !== 'sheepfold-settings-export-v1') {
                                        notify(_('Import file format is not recognized.'), 'warning');
                                        return;
                                }

                                ui.showModal(_('Import all settings and user list'), [
                                        E('div', { 'class': 'sf-note sf-note-warning' }, _('Import file checked. Applying imported settings will be added after backend import confirmation is implemented.')),
                                        E('div', { 'class': 'right sf-modal-actions' }, [
                                                E('button', {
                                                        'class': 'btn cbi-button cbi-button-positive',
                                                        'click': ui.hideModal
                                                }, _('Close'))
                                        ])
                                ]);
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
        var svgNs = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNs, 'svg');

        attrs = attrs || {};
        svg.setAttribute('viewBox', attrs.viewBox || '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        paths.forEach(function (pathData) {
                var path = document.createElementNS(svgNs, 'path');

                path.setAttribute('d', pathData);
                svg.appendChild(path);
        });

        return svg;
}

function adminDeviceIcon() {
        return E('span', { 'class': 'sf-admin-device-icon', 'title': _('Admin device') }, [
                svgIcon([
                        'M4 5h11a2 2 0 0 1 2 2v8H2V7a2 2 0 0 1 2-2z',
                        'M1 17h17v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z',
                        'M19 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'
                ])
        ]);
}

function adminCrownIcon() {
        return E('span', { 'class': 'sf-admin-crown-icon', 'title': _('Admin device') }, [
                svgIcon([
                        'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z',
                        'M6 19h12'
                ])
        ]);
}

function staticLeaseIcon() {
        return E('span', { 'class': 'sf-static-lease-icon', 'title': _('Permanent IP lease') }, [
                svgIcon([
                        'M7 11V8a5 5 0 0 1 10 0v3',
                        'M6 11h12v10H6z',
                        'M12 15v2'
                ])
        ]);
}

function deviceTypeDefinitions() {
        return [
                {
                        value: 'unknown',
                        label: _('Unknown device type'),
                        mark: '?',
                        paths: [
                                'M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3',
                                'M12 17h.01',
                                'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'
                        ]
                },
                {
                        value: 'phone',
                        label: _('Phone'),
                        mark: '▯',
                        paths: [
                                'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
                                'M11 18h2'
                        ]
                },
                {
                        value: 'tablet',
                        label: _('Tablet'),
                        mark: '▭',
                        paths: [
                                'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
                                'M12 17h.01'
                        ]
                },
                {
                        value: 'computer',
                        label: _('Computer'),
                        mark: '⌨',
                        paths: [
                                'M3 4h18v11H3z',
                                'M8 21h8',
                                'M12 15v6'
                        ]
                },
                {
                        value: 'tv',
                        label: _('TV'),
                        mark: '▣',
                        paths: [
                                'M3 5h18v12H3z',
                                'M8 21h8',
                                'M12 17v4'
                        ]
                },
                {
                        value: 'console',
                        label: _('Game console'),
                        mark: '✚',
                        paths: [
                                'M7 10h10a5 5 0 0 1 4 8l-1 1a2 2 0 0 1-3-.4L15 16H9l-2 2.6a2 2 0 0 1-3 .4l-1-1a5 5 0 0 1 4-8z',
                                'M8 14h4',
                                'M10 12v4',
                                'M16 13h.01',
                                'M18 15h.01'
                        ]
                },
                {
                        value: 'printer',
                        label: _('Printer'),
                        mark: '▤',
                        paths: [
                                'M7 8V3h10v5',
                                'M6 17H4v-6h16v6h-2',
                                'M7 14h10v7H7z'
                        ]
                },
                {
                        value: 'server',
                        label: _('Server'),
                        mark: '▦',
                        paths: [
                                'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
                                'M8 7h8',
                                'M8 11h8',
                                'M8 15h4',
                                'M16 15h.01',
                                'M16 18h.01',
                                'M8 18h4'
                        ]
                },
                {
                        value: 'camera',
                        label: _('Camera'),
                        mark: '◉',
                        paths: [
                                'M4 7h4l2-3h4l2 3h4v13H4z',
                                'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
                        ]
                },
                {
                        value: 'speaker',
                        label: _('Smart speaker'),
                        mark: '♪',
                        paths: [
                                'M8 6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z',
                                'M10 8h4',
                                'M10 11h4',
                                'M12 17h.01',
                                'M18 9c1.2 1.6 1.2 4.4 0 6',
                                'M20.5 7c2 2.8 2 7.2 0 10'
                        ]
                },
                {
                        value: 'vacuum',
                        label: _('Robot vacuum'),
                        mark: '◌',
                        paths: [
                                'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
                                'M9 10h6',
                                'M9 14h6',
                                'M16 7l3-3'
                        ]
                },
                {
                        value: 'smart_home',
                        label: _('Smart home'),
                        mark: '⌁',
                        paths: [
                                'M3 11l9-8 9 8',
                                'M5 10v10h14V10',
                                'M9 20v-6h6v6',
                                'M8 11h.01',
                                'M16 11h.01'
                        ]
                },
                {
                        value: 'engineering',
                        label: _('Engineering device'),
                        mark: '⚙',
                        paths: [
                                'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
                                'M9 8h6',
                                'M9 11h3',
                                'M7 20v2',
                                'M17 20v2',
                                'M12 18c-1.6-.8-2.4-1.9-2-3.2.3-1 1.2-1.6 1.7-2.8 1.6 1.1 3.3 2.4 3.3 4 0 1.2-1 2-3 2z'
                        ]
                },
                {
                        value: 'smart',
                        label: _('Smart device'),
                        mark: '◇',
                        paths: [
                                'M12 2l8 8-8 12-8-12z',
                                'M9 10h6',
                                'M9 14h6'
                        ]
                },
                {
                        value: 'network',
                        label: _('Network device'),
                        mark: '⌂',
                        paths: [
                                'M4 12h16',
                                'M7 8h10',
                                'M10 4h4',
                                'M6 16h.01',
                                'M12 16h.01',
                                'M18 16h.01',
                                'M6 20h12'
                        ]
                }
        ];
}

function deviceTypeByValue(value) {
        return deviceTypeDefinitions().filter(function (item) {
                return item.value === value;
        })[0] || deviceTypeDefinitions().filter(function (item) {
                return item.value === 'unknown';
        })[0];
}

function displayDeviceType(device) {
        var confidence = parseInt(device && device.detectionConfidence, 10);
        var minConfidence = parseInt(safeUciGet('sheepfold', 'global', 'detector_min_device_type_confidence', '70'), 10);

        if (isNaN(minConfidence))
                minConfidence = 70;

        if (device && !device.manualDeviceType && !isNaN(confidence) && confidence < minConfidence)
                return 'unknown';

        return device && device.deviceType ? device.deviceType : 'unknown';
}

function deviceTypeOptions() {
        return deviceTypeDefinitions().map(function (item) {
                return [item.value, item.label];
        });
}

function inferDeviceType(item, configured) {
        var text = [
                configured && configured.name,
                configured && configured.group,
                item.staticName,
                item.hostname
        ].join(' ').toLowerCase();

        if (/(iphone|android|galaxy|redmi|pixel|phone|телефон|смартфон)/.test(text))
                return 'phone';
        if (/(ipad|tablet|pad|планшет)/.test(text))
                return 'tablet';
        if (/(desktop|laptop|notebook|macbook|pc-|компьютер|ноутбук)/.test(text))
                return 'computer';
        if (/(tv|телевизор|chromecast|mi box|androidtv|smarttv)/.test(text))
                return 'tv';
        if (/(playstation|ps4|ps5|xbox|switch|console|приставк)/.test(text))
                return 'console';
        if (/(printer|print|epson|canon|hp-|принтер)/.test(text))
                return 'printer';
        if (/(home[ -]?assistant|hassio|hass\.io|haos|home assistant green|home assistant yellow|openhab|adguard[ -]?home|adguardhome|samba|smb|cifs|файловый сервер|file server|nas|proxmox|pve|truenas|freenas|openmediavault|omv|synology|diskstation|qnap|unraid|plex server|jellyfin|emby|docker host|portainer|мини[ -]?сервер|домашний сервер|smlight|slzb|slzb-mr4u|zigbee2mqtt|zha coordinator|zigbee coordinator|zigbee gateway|zigbee bridge|matter bridge|thread border router|homekit bridge|smart home hub|smarthome hub|хаб умного дома|координатор zigbee|zigbee шлюз|шлюз zigbee|шлюз умного дома|philips hue bridge|hue bridge|ikea dirigera|dirigera|tradfri gateway|trådfri gateway|aqara hub|xiaomi gateway|mijia gateway|tuya gateway|sonoff zigbee bridge|hubitat|smartthings hub|aeotec hub|homey|fibaro home center|homematic|deconz|conbee|skyconnect|zwavejs|z-wave js|z-wave gateway|zwave gateway)/.test(text))
                return 'server';
        if (/(nvr|dvr|xvr|hybrid recorder|video recorder|videoregistrar|videonablyudenie|videonablydenie|videonabludenie|video-nablyudenie|video-nablydenie|видеорегистратор|регистратор|cctv server|surveillance server|video server|сервер видеонаблюдения|ltv-rne|rne-\d|rvi-r|trassir|xmeye|ivms|hik-connect|smartpss|gdmss|idmss|unv.*nvr|uniview.*nvr|hikvision.*nvr|hiwatch.*nvr|hilook.*nvr|dahua.*nvr|beward.*nvr|optimus.*nvr|tantos.*nvr|polyvision.*nvr|hanwha.*nvr|wisenet.*nvr|axis.*nvr|vivotek.*nvr|tiandy.*nvr)/.test(text))
                return 'server';
        if (/(camera|ip[-_ ]?cam|webcam|(^|[^a-z0-9])cam[0-9]+([^a-z0-9]|$)|(^|[^a-z0-9])cam[-_ ][0-9]+([^a-z0-9]|$)|камера)/.test(text))
                return 'camera';
        if (/(alice|alisa|yandex|яндекс|алиса|station|станци[яи]|smart speaker|speaker|колонк|sonos|homepod|alexa|amazon echo|google home|sberboom|сбербум|маруся|marusya|капсул)/.test(text))
                return 'speaker';
        if (/(vacuum|roborock|dreame|deebot|ecovacs|irobot|roomba|пылесос|miio|xiaomi-vacuum|viomi|ilife|eufy|yeedi)/.test(text))
                return 'vacuum';
        if (/(warm floor|underfloor|floor heating|heated floor|терморегулятор|термоголовк|т[её]пл[ыо]й пол|теплый пол|тёплый пол|подогрев пола|heater relay|smart relay|relay|реле|выключател|switch module|wall switch|light switch|освещен|свет|ламп|dimmer|диммер|curtain|curtains|blind|blinds|shade|roller shade|штор|жалюзи|карниз|чайник|kettle|утюг|iron|socket|plug|розетк|tuya|ewelink|sonoff|shelly|aqara|mijia|xiaomi smart|yeelight|philips hue|nanoleaf|wled|led controller|контроллер led|контроллер света|датчик движения|motion sensor|door sensor|window sensor|датчик двери|датчик окна|leak sensor|датчик протечки|smoke sensor|датчик дыма|temperature sensor|датчик температуры|humidity sensor|датчик влажности|espressif|esp8266|esp32|esp32c3|esp32-c3|esp32s3|esp32-s3|tasmota|esphome)/.test(text))
                return 'smart_home';
        if (/(zont|зонт|ectostroy|ectocontrol|эктоконтрол|myheat|teplocom|теплоком|xital|кситал|телеметрик|telemetrika|owen|овен|saures|boiler|kotel|кот[её]л|baxi|navien|vaillant|buderus|protherm|ariston|heating|thermostat|термостат|отоплен|контроллер|alarm|сигнализац)/.test(text))
                return 'engineering';
        if (/(router|gateway|repeater|extender|openwrt|роутер|шлюз|точка)/.test(text))
                return 'network';

        return 'smart';
}

function deviceTypeIcon(type) {
        var definition = deviceTypeByValue(type);

        return E('span', {
                'class': 'sf-device-type-icon',
                'title': definition.label,
                'aria-label': definition.label
        }, [
                svgIcon(definition.paths)
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

function gfMultiply(x, y) {
        var z = 0;

        while (y !== 0) {
                if ((y & 1) !== 0)
                        z ^= x;

                x <<= 1;
                if ((x & 0x100) !== 0)
                        x ^= 0x11d;

                y >>>= 1;
        }

        return z;
}

function gfPow2(power) {
        var value = 1;

        while (power-- > 0)
                value = gfMultiply(value, 2);

        return value;
}

function reedSolomonGenerator(degree) {
        var poly = [1];

        for (var i = 0; i < degree; i++) {
                var next = Array(poly.length + 1).fill(0);
                var root = gfPow2(i);

                for (var j = 0; j < poly.length; j++) {
                        next[j] ^= poly[j];
                        next[j + 1] ^= gfMultiply(poly[j], root);
                }

                poly = next;
        }

        return poly;
}

function reedSolomonRemainder(data, degree) {
        var generator = reedSolomonGenerator(degree);
        var message = data.concat(Array(degree).fill(0));

        for (var i = 0; i < data.length; i++) {
                var factor = message[i];

                if (factor === 0)
                        continue;

                for (var j = 0; j < generator.length; j++)
                        message[i + j] ^= gfMultiply(generator[j], factor);
        }

        return message.slice(data.length);
}

function appendBits(bits, value, length) {
        for (var i = length - 1; i >= 0; i--)
                bits.push((value >>> i) & 1);
}

function utf8Bytes(text) {
        if (window.TextEncoder)
                return Array.prototype.slice.call(new TextEncoder().encode(text));

        return unescape(encodeURIComponent(text)).split('').map(function (char) {
                return char.charCodeAt(0) & 0xff;
        });
}

function makeQrCodewords(text) {
        var dataCodewords = 108;
        var errorCorrectionCodewords = 26;
        var bits = [];
        var bytes = utf8Bytes(text);
        var codewords = [];

        appendBits(bits, 0x4, 4);
        appendBits(bits, bytes.length, 8);

        bytes.forEach(function (value) {
                appendBits(bits, value, 8);
        });

        if (bits.length > dataCodewords * 8)
                throw new Error('QR payload is too long');

        appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));

        while (bits.length % 8 !== 0)
                bits.push(0);

        for (var i = 0; i < bits.length; i += 8) {
                var value = 0;

                for (var j = 0; j < 8; j++)
                        value = (value << 1) | bits[i + j];

                codewords.push(value);
        }

        for (var pad = 0; codewords.length < dataCodewords; pad++)
                codewords.push(pad % 2 === 0 ? 0xec : 0x11);

        return codewords.concat(reedSolomonRemainder(codewords, errorCorrectionCodewords));
}

function createQrMatrix(text) {
        var version = 5;
        var size = version * 4 + 17;
        var matrix = Array.from({ length: size }, function () { return Array(size).fill(false); });
        var reserved = Array.from({ length: size }, function () { return Array(size).fill(false); });

        function setModule(x, y, value, isReserved) {
                if (x < 0 || y < 0 || x >= size || y >= size)
                        return;

                matrix[y][x] = value;
                if (isReserved)
                        reserved[y][x] = true;
        }

        function addFinder(x, y) {
                for (var dy = -1; dy <= 7; dy++) {
                        for (var dx = -1; dx <= 7; dx++) {
                                var xx = x + dx;
                                var yy = y + dy;
                                var on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
                                        (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                                        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));

                                setModule(xx, yy, on, true);
                        }
                }
        }

        function addAlignment(cx, cy) {
                for (var dy = -2; dy <= 2; dy++) {
                        for (var dx = -2; dx <= 2; dx++) {
                                var distance = Math.max(Math.abs(dx), Math.abs(dy));
                                setModule(cx + dx, cy + dy, distance !== 1, true);
                        }
                }
        }

        addFinder(0, 0);
        addFinder(size - 7, 0);
        addFinder(0, size - 7);
        addAlignment(30, 30);

        for (var i = 0; i < size; i++) {
                if (!reserved[6][i])
                        setModule(i, 6, i % 2 === 0, true);
                if (!reserved[i][6])
                        setModule(6, i, i % 2 === 0, true);
        }

        setModule(8, version * 4 + 9, true, true);

        var formatBits = 0x77c4;
        for (i = 0; i <= 5; i++)
                setModule(8, i, ((formatBits >>> i) & 1) !== 0, true);
        setModule(8, 7, ((formatBits >>> 6) & 1) !== 0, true);
        setModule(8, 8, ((formatBits >>> 7) & 1) !== 0, true);
        setModule(7, 8, ((formatBits >>> 8) & 1) !== 0, true);
        for (i = 9; i < 15; i++)
                setModule(14 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
        for (i = 0; i < 8; i++)
                setModule(size - 1 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
        for (i = 8; i < 15; i++)
                setModule(8, size - 15 + i, ((formatBits >>> i) & 1) !== 0, true);

        var codewords = makeQrCodewords(text);
        var bitIndex = 0;
        var upward = true;

        for (var right = size - 1; right >= 1; right -= 2) {
                if (right === 6)
                        right--;

                for (var vert = 0; vert < size; vert++) {
                        var y = upward ? size - 1 - vert : vert;

                        for (var col = 0; col < 2; col++) {
                                var x = right - col;

                                if (reserved[y][x])
                                        continue;

                                var bit = false;
                                if (bitIndex < codewords.length * 8)
                                        bit = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;

                                if ((x + y) % 2 === 0)
                                        bit = !bit;

                                setModule(x, y, bit, false);
                                bitIndex++;
                        }
                }

                upward = !upward;
        }

        return matrix;
}

function qrCode(text) {
        var matrix;

        try {
                matrix = createQrMatrix(text);
        } catch (error) {
                return E('div', { 'class': 'sf-qr-error' }, _('QR payload') + ': ' + error.message);
        }

        return E('div', {
                'class': 'sf-qr',
                'aria-label': _('Pairing'),
                'style': 'grid-template-columns: repeat(' + matrix.length + ', 1fr);'
        },
                matrix.reduce(function (nodes, row) {
                        row.forEach(function (on) {
                                nodes.push(E('span', { 'class': on ? 'on' : '' }));
                        });
                        return nodes;
                }, []));
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
                nextId = 'D-' + String(devices.length + 1).padStart(4, '0');
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

function randomInteger(max) {
        if (window.crypto && window.crypto.getRandomValues) {
                var values = new Uint32Array(1);
                window.crypto.getRandomValues(values);
                return values[0] % max;
        }

        return Math.floor(Math.random() * max);
}

function shuffleCharacters(chars) {
        for (var i = chars.length - 1; i > 0; i--) {
                var j = randomInteger(i + 1);
                var tmp = chars[i];
                chars[i] = chars[j];
                chars[j] = tmp;
        }

        return chars;
}

function generatePairingCode() {
        var lower = 'abcdefghkmnpqrstuvwxyz';
        var upper = 'ABCDEFGHKMNPQRSTUVWXYZ';
        var digits = '2456789';
        var specials = '+-*()[]{}<>?@#$%^&:;.,';
        var alnum = lower + upper + digits;
        var all = alnum + specials;
        var chars = [
                lower[randomInteger(lower.length)],
                upper[randomInteger(upper.length)],
                digits[randomInteger(digits.length)]
        ];
        var specialCount = randomInteger(4);

        for (var s = 0; s < specialCount; s++) {
                chars.push(specials[randomInteger(specials.length)]);
        }

        while (chars.length < 10) {
                var pool = specialCount >= 3 ? alnum : all;
                var next = pool[randomInteger(pool.length)];
                if (specials.indexOf(next) !== -1)
                        specialCount++;
                chars.push(next);
        }

        return shuffleCharacters(chars).join('');
}

function generateUrlToken(length) {
        var chars = 'abcdefghkmnpqrstuvwxyzABCDEFGHKMNPQRSTUVWXYZ2456789';
        var token = [];

        for (var i = 0; i < length; i++)
                token.push(chars[randomInteger(chars.length)]);

        return token.join('');
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

function sortDeviceTable(table, key) {
        var currentKey = table.getAttribute('data-sort-key');
        var currentDirection = table.getAttribute('data-sort-direction') || 'asc';
        var direction = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
        var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-device-row:not(.sf-device-head)'));

        rows.sort(function (left, right) {
                var leftValue = left.getAttribute('data-sort-' + key) || '';
                var rightValue = right.getAttribute('data-sort-' + key) || '';
                var result;

                if (key === 'id' || key === 'ip') {
                        result = Number(leftValue) - Number(rightValue);
                } else {
                        result = leftValue.localeCompare(rightValue, undefined, {
                                numeric: true,
                                sensitivity: 'base'
                        });
                }

                return direction === 'asc' ? result : -result;
        });

        table.setAttribute('data-sort-key', key);
        table.setAttribute('data-sort-direction', direction);
        table.querySelectorAll('.sf-device-sort').forEach(function (button) {
                var active = button.getAttribute('data-sort-key') === key;

                button.classList.toggle('active', active);
                button.setAttribute('data-sort-direction', active ? direction : '');
        });

        rows.forEach(function (row) {
                table.appendChild(row);
        });
}

function deviceSortHeader(label, key) {
        return E('button', {
                'class': 'sf-device-sort',
                'data-sort-key': key,
                'click': function (ev) {
                        ev.preventDefault();
                        sortDeviceTable(ev.currentTarget.closest('.sf-device-table'), key);
                }
        }, [
                E('span', {}, label),
                E('span', { 'class': 'sf-sort-arrow' }, '')
        ]);
}

function filterDeviceTable(table, needle) {
        var query = String(needle || '').trim().toLowerCase();

        table.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function (row) {
                var haystack = [
                        row.getAttribute('data-sort-id') || '',
                        row.getAttribute('data-sort-device') || '',
                        row.getAttribute('data-sort-type') || '',
                        row.getAttribute('data-sort-ip') || '',
                        row.getAttribute('data-sort-group') || '',
                        row.getAttribute('data-sort-status') || '',
                        row.getAttribute('data-search') || ''
                ].join(' ').toLowerCase();

                row.hidden = query && haystack.indexOf(query) === -1;
        });
}

function sortAdminTable(table, key) {
        var currentKey = table.getAttribute('data-sort-key');
        var currentDirection = table.getAttribute('data-sort-direction') || 'asc';
        var direction = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
        var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-admin-row:not(.sf-admin-head)'));

        rows.sort(function (left, right) {
                var leftValue = left.getAttribute('data-sort-' + key) || '';
                var rightValue = right.getAttribute('data-sort-' + key) || '';
                var result = leftValue.localeCompare(rightValue, undefined, {
                        numeric: true,
                        sensitivity: 'base'
                });

                return direction === 'asc' ? result : -result;
        });

        table.setAttribute('data-sort-key', key);
        table.setAttribute('data-sort-direction', direction);
        table.querySelectorAll('.sf-admin-sort').forEach(function (button) {
                var active = button.getAttribute('data-sort-key') === key;

                button.classList.toggle('active', active);
                button.setAttribute('data-sort-direction', active ? direction : '');
        });

        rows.forEach(function (row) {
                table.appendChild(row);
        });
}

function adminSortHeader(label, key) {
        return E('button', {
                'class': 'sf-device-sort sf-admin-sort',
                'data-sort-key': key,
                'click': function (ev) {
                        ev.preventDefault();
                        sortAdminTable(ev.currentTarget.closest('.sf-admin-table'), key);
                }
        }, [
                E('span', {}, label),
                E('span', { 'class': 'sf-sort-arrow' }, '')
        ]);
}

function showPairingModal(device) {
        var routerAddress = currentRouterAddress();
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var apiPath = '/cgi-bin/sheepfold-api';
        var apiUrl = 'http://' + routerAddress + ':' + port + apiPath;
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
        var apiUrl = 'http://' + routerAddress + ':' + port + apiPath;
        var temporaryPassword = admin.temporaryPassword || generatePairingCode();
        var pairingPayloadText = pairingPayload(routerAddress, port, admin.login, temporaryPassword);
        var pairingStartedAt = Math.floor(Date.now() / 1000);
        var stopPairingWatcher = null;

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
                                settingLine(_('Port'), port)
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
                        }, _('Close'))
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
        var device;
        var mac;
        var sectionName;
        var i;

        for (i = 0; i < selectedDevices.length; i++) {
                device = selectedDevices[i];
                mac = normalizeMac(device && device.mac);

                if (!mac)
                        return Promise.reject(new Error(_('Invalid MAC address')));

                if (isAllowlist && (device.status === 'blocked' || macInSheepfoldList('blocklist', mac)))
                        return Promise.reject(new Error(_('This device is in the blocklist. Remove it from the blocklist first.')));

                if (!isAllowlist && (device.status === 'allow' || macInSheepfoldList('allowlist', mac)))
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
                updateMacList(isAllowlist ? 'blocklist' : 'allowlist', mac, false);
        });

        return saveUciChanges(['sheepfold']);
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
                        notify(isAllowlist ? _('Device added to allowlist.') : _('Device added to blocklist.'), 'info');
                        ui.hideModal();
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
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
                                        var url = urlField.input.value.trim();
                                        var name = nameField.input.value.trim();
                                        var description = descriptionField.input.value.trim();

                                        if (!url) {
                                                notify(_('Site URL is required.'), 'warning');
                                                return;
                                        }

                                        if (isEdit) {
                                                site[0] = url;
                                                site[1] = name;
                                                site[2] = description;
                                        } else {
                                                emergencySites.push([url, name, description]);
                                        }

                                        renderEmergencySiteList();
                                        notify(_('Site saved.'), 'info');
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
        notify(_('Site deleted.'), 'info');
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
        var match = String(device.id || '').match(/(\d+)$/);

        return match ? String(parseInt(match[1], 10)) : String(devices.indexOf(device) + 1);
}

function formattedDeviceDisplayId(device) {
        return '#' + deviceDisplayId(device);
}

var DEFAULT_GROUP_SECTION_IDS = ['no_restrictions', 'child_1'];
var LEGACY_GROUP_ALIASES = {
        'No restrictions': 'no_restrictions',
        'Без ограничений': 'no_restrictions',
        'Child number 1': 'child_1',
        'Первый ребёнок': 'child_1',
        'Ребёнок номер 1': 'child_1'
};

function defaultGroupDisplayName(sectionId, fallback) {
        var stored = safeUciGet('sheepfold', sectionId, 'name', '');

        return String(stored || fallback || '').trim();
}

function noRestrictionsGroupName() {
        return defaultGroupDisplayName('no_restrictions', 'No restrictions');
}

function childGroupName() {
        return defaultGroupDisplayName('child_1', 'Child number 1');
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

function deviceMatchesSelectionFilter(device, needle) {
        if (!needle)
                return true;

        return [
                deviceDisplayId(device),
                formattedDeviceDisplayId(device),
                device.id,
                device.name,
                device.ip,
                device.mac,
                device.group
        ].join(' ').toLowerCase().indexOf(needle) !== -1;
}

function createDeviceSelectionBox(options) {
        var selected = {};
        var filterInput = E('input', {
                'class': 'cbi-input-text sf-search sf-binding-filter',
                'placeholder': _('Search by name, IP, MAC, or ID')
        });
        var table = E('div', { 'class': 'sf-binding-table' });
        var filter = options.filter || function () { return true; };
        var sortSource = options.devices || devices;

        (options.selectedIds || []).forEach(function (id) {
                selected[id] = true;
        });

        function sortedRows() {
                return sortSource.filter(filter).sort(function (left, right) {
                        var leftSelected = selected[left.id] ? 1 : 0;
                        var rightSelected = selected[right.id] ? 1 : 0;

                        if (leftSelected !== rightSelected)
                                return rightSelected - leftSelected;

                        return devices.indexOf(right) - devices.indexOf(left);
                });
        }

        function redraw() {
                var needle = filterInput.value.trim().toLowerCase();
                var rows = sortedRows().filter(function (device) {
                        return deviceMatchesSelectionFilter(device, needle);
                }).map(function (device) {
                        var checkbox = E('input', {
                                'type': 'checkbox',
                                'checked': selected[device.id] ? 'checked' : null,
                                'change': function (ev) {
                                        selected[device.id] = ev.currentTarget.checked;
                                        redraw();
                                }
                        });

                        return E('div', { 'class': 'sf-binding-row' + (selected[device.id] ? ' is-selected' : '') }, [
                                E('div', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                                E('div', { 'class': 'sf-device-name' }, [
                                        E('strong', {}, device.name),
                                        E('small', {}, displayGroupName(device.group))
                                ]),
                                E('div', {}, device.ip || '-'),
                                E('div', { 'class': 'sf-mono' }, device.mac || '-'),
                                E('label', { 'class': 'sf-binding-check' }, checkbox)
                        ]);
                });

                table.replaceChildren.apply(table, [
                        E('div', { 'class': 'sf-binding-row sf-binding-head' }, [
                                E('div', {}, _('ID')),
                                E('div', {}, _('Device')),
                                E('div', {}, _('IP address')),
                                E('div', {}, _('MAC address')),
                                E('div', {}, '')
                        ])
                ].concat(rows));
        }

        filterInput.addEventListener('input', redraw);
        redraw();

        return {
                node: E('div', { 'class': 'sf-binding-selector' }, [
                        E('div', { 'class': 'sf-panel-head sf-binding-toolbar' }, [
                                filterInput,
                                E('span', { 'class': 'sf-muted' }, _('Selected devices are shown first.'))
                        ]),
                        table
                ]),
                selectedDevices: function () {
                        return sortedRows().filter(function (device) {
                                return selected[device.id];
                        });
                },
                selectedIds: function () {
                        return this.selectedDevices().map(function (device) {
                                return device.id;
                        });
                },
                isSelected: function (device) {
                        return !!selected[device.id];
                }
        };
}

function hashString(text) {
        var hash = 0;

        String(text || '').split('').forEach(function (char) {
                hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
        });

        return Math.abs(hash);
}

function groupAutoColor(groupName) {
        var palette = groupColorPalette();

        return palette[hashString(groupName) % palette.length];
}

function groupColorPalette() {
        return [
                '#e8f4ef',
                '#eef2ff',
                '#fff4dd',
                '#fceeee',
                '#edf7fb',
                '#f5f0ff',
                '#eef8e7',
                '#f8f1e8',
                '#eaf3f8'
        ];
}

function validGroupColor(color) {
        return /^#[0-9a-f]{6}$/i.test(String(color || ''));
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
        var palette = groupColorPalette();
        var fallback = groupAutoColor(groupName);

        for (var i = 0; i < palette.length; i++) {
                if (!used[palette[i].toLowerCase()])
                        return palette[i];
        }

        return fallback;
}

function groupColor(groupName, section) {
        return section && validGroupColor(section.color) ? section.color : nextAvailableGroupColor(groupName, groupName);
}

function groupSectionName(groupName) {
        return 'group_' + hashString(groupName).toString(16);
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
        return [
                ['school_days', _('School days')],
                ['temporary_access', _('Temporary access')],
                ['bedtime', _('Bedtime')]
        ];
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

function showScheduleConflictDisclaimer(onContinue) {
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
        var activityLogField = checkboxControl(
                _('Enable activity journal for all devices in this group'),
                section && section.activity_log_enabled === '1',
                _('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
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
                sectionName = ensureGroupSection(oldName, section);
                uci.set('sheepfold', sectionName, 'name', newName);
                uci.set('sheepfold', sectionName, 'color', color);
                uci.set('sheepfold', sectionName, 'schedules', selectedSchedules);
                uci.set('sheepfold', sectionName, 'allowlist_only', allowlistOnlyField.input.checked ? '1' : '0');
                uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');
                if (!section)
                        uci.set('sheepfold', sectionName, 'protected', '0');

                safeUciSections('sheepfold', 'device').forEach(function (deviceSection) {
                        var linked = selectedDevices.some(function (device) {
                                return normalizeMac(device.mac) === normalizeMac(deviceSection.mac);
                        });
                        var currentGroup = normalizeGroupName(deviceSection.group);

                        if (currentGroup === oldName || linked) {
                                uci.set('sheepfold', deviceSection['.name'], 'group', linked ? newName : NOT_CONFIGURED_GROUP);

                                if (oldName === noRestrictionsGroupName() && !linked)
                                        markNoRestrictionsAutoExcluded(deviceSection['.name']);
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
                });

                saveUciChanges(['sheepfold']).then(function () {
                        notify(_('Group saved.'), 'info');
                        if (onSave)
                                onSave();
                        ui.hideModal();
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
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
                        activityLogField.node,
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

function showAddGroupModal(existingNames) {
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
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
                                        uci.set('sheepfold', sectionName, 'personal', personalField.input.checked ? '1' : '0');

                                        saveUciChanges(['sheepfold']).then(function () {
                                                notify(_('Group created.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function () {
                                                notify(_('Could not create group.'), 'warning');
                                        });
                                }
                        }, _('Save'))
                ])
        ]);
}

function nextAdminId() {
        var next = admins.reduce(function (max, admin) {
                return Math.max(max, idNumber(admin.id));
        }, 0) + 1;

        return 'A-' + String(next).padStart(4, '0');
}

function adminLoginExists(login) {
        var normalized = String(login || '').trim().toLowerCase();

        return admins.some(function (admin) {
                return String(admin.login || '').trim().toLowerCase() === normalized;
        });
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
                        temporaryPassword: generatePairingCode()
                };

                admins.push(admin);
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
                                E('p', {}, _('When a device is assigned to an administrator, Sheepfold removes it from ordinary groups and schedules, disables activity logging for it, and adds it to the allowlist.'))
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
        var activityLogField = checkboxControl(
                _('Enable activity journal for this device'),
                device.activityLogEnabled,
                _('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
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
                                activityLogField.node
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
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');

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
                                device.activityLogEnabled ? badge('journal') : ''
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
        return E('label', { 'class': 'sf-field' }, [
                E('span', {}, label),
                E('input', { 'class': 'cbi-input-text', 'value': value || '' }),
                hint ? E('small', {}, hint) : ''
        ]);
}

function selectField(label, value, values, hint) {
        return E('label', { 'class': 'sf-field' }, [
                E('span', {}, label),
                E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
                        return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
                })),
                hint ? E('small', {}, hint) : ''
        ]);
}

function textareaField(label, value, hint) {
        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || ''),
                hint ? E('small', {}, hint) : ''
        ]);
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

function logStorageLocationField() {
        var currentValue = settingValue('log_storage', 'ram');
        var statusView = logStorageStatusView();
        var yandexBlock = E('div', { 'class': 'sf-yandex-disk-settings' });
        var select;

        function syncVisibility() {
                yandexBlock.hidden = select.value === 'yandex_disk' ? null : 'hidden';
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
                ['yandex_disk', _('Yandex Disk')]
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

        syncVisibility();

        return E('div', { 'class': 'sf-log-storage-field-wrap' }, [
                E('label', { 'class': 'sf-field sf-field-wide sf-log-storage-field' }, [
                        E('span', {}, _('Log storage location')),
                        E('div', { 'class': 'sf-log-storage-row' }, [
                                select,
                                statusView.node
                        ])
                ]),
                yandexBlock
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
        var value = settingValue('detection_mode', 'full') === 'reduced' ? 'reduced' : 'full';
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;
                        var mode = nextValue === 'full' ? 'full' : 'reduced';

                        setSettingsDraftOptions({
                                auto_configure: '1',
                                detection_mode: mode,
                                no_restrictions_auto_assign: '1'
                        });
                }
        }, [
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

function normalizeApplicationLanguage(value) {
        return String(value || '').trim() === 'en' ? 'en' : 'ru';
}

function ensureLuciMainSection() {
        try {
                uci.get('luci', 'main');
        } catch (e) {
                uci.set('luci', 'main', 'core');
        }
}

function saveGlobalOptions(options) {
        var globalOptions = {};
        var usbOptions = {};
        var cloudOptions = {};
        var configs = ['sheepfold'];

        Object.keys(options).forEach(function (key) {
                var usbParts = key.match(/^usb\.(.+)$/);
                var cloudParts = key.match(/^cloud\.(.+)$/);

                if (usbParts)
                        usbOptions[usbParts[1]] = options[key];
                else if (cloudParts)
                        cloudOptions[cloudParts[1]] = options[key];
                else
                        globalOptions[key] = options[key];
        });

        if (hasOwn(globalOptions, 'language')) {
                globalOptions.language = normalizeApplicationLanguage(globalOptions.language);
                ensureLuciMainSection();
                uci.set('luci', 'main', 'lang', globalOptions.language);
                if (configs.indexOf('luci') === -1)
                        configs.push('luci');
        }

        Object.keys(globalOptions).forEach(function (option) {
                uci.set('sheepfold', 'global', option, globalOptions[option]);
        });

        if (hasOwn(globalOptions, 'deepseek_api_key') && String(globalOptions.deepseek_api_key || '').trim())
                uci.set('sheepfold', 'global', 'ai_enabled', '1');

        if (hasOwn(globalOptions, 'gemini_api_key') && String(globalOptions.gemini_api_key || '').trim())
                uci.set('sheepfold', 'global', 'ai_enabled', '1');

        if (hasOwn(globalOptions, 'child_ai_parental_consent'))
                uci.set('sheepfold', 'global', 'child_ai_consent_version', 'child-ai-v1');

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

function hasConfiguredAiProvider() {
        var provider = settingValue('ai_provider', 'none');

        if (!provider || provider === 'none')
                return false;

        var keyOption = provider === 'gemini' ? 'gemini_api_key' : 'deepseek_api_key';

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
                                        ['gemini', _('Gemini Free')]
                                ].map(function (item) {
                                        return E('option', {
                                                'value': item[0],
                                                'selected': item[0] === provider ? 'selected' : null
                                        }, item[1]);
                                })),
                                E('small', {}, _('The Android app sends AI requests to the router; the router calls the selected provider.'))
                        ])
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

function messengerField(label, option, placeholder, hint, secret) {
        var input = E('input', {
                'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
                'type': secret ? 'password' : 'text',
                'value': safeUciGet('sheepfold', 'global', option, ''),
                'placeholder': placeholder || ''
        });

        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                }
        });

        var fieldControl = input;

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

        var node = E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                fieldControl,
                hint ? E('small', {}, hint) : ''
        ]);

        node.sfInput = input;
        node.sfOption = option;

        return node;
}

function messengerCommandRows() {
        return [
                ['/start', 'старт', _('Shows available commands.')],
                ['/help', 'помощь, help', _('Shows available commands.')],
                ['/status', 'статус', _('Shows Sheepfold and router status.')],
                ['/devices', 'показать все устройства, устройства', _('Shows all detected devices with Sheepfold IDs.')],
                ['/internet_on', 'включить интернет, интернет включён', _('Turns global blocking off.')],
                ['/internet_off', 'отключить интернет, выключить интернет, интернет отключен', _('Turns on global blocking for everyone except the allowlist.')],
                ['/wifi_status', 'статус Wi-Fi, статус вайфай', _('Shows whether Wi-Fi is enabled.')],
                ['/wifi_on', 'включить Wi-Fi, включить вайфай', _('Turns router Wi-Fi on.')],
                ['/wifi_off', 'отключить Wi-Fi, выключить вайфай', _('Turns router Wi-Fi off; use carefully.')],
                ['/support', 'саппорт, поддержка', _('Shows what to prepare before asking for support.')],
                ['/grant_time #3 30', 'дать #3 30 минут, +30 #3', _('Grants temporary access to the selected device.')],
                ['/block_device #3', 'заблокировать #3', _('Blocks the selected device.')],
                ['/unblock_device #3', 'разблокировать #3', _('Removes blocking from the selected device.')],
                ['/allowlist_add #3', 'добавить #3 в белый список', _('Adds the selected device to the allowlist.')],
                ['/blocklist_add #3', 'добавить #3 в чёрный список', _('Adds the selected device to the blocklist.')],
                ['/logs', 'журнал, показать журнал', _('Shows recent administrative log entries.')],
                ['/clear_logs', 'очистить журнал', _('Clears the administrative log after confirmation.')],
                ['/update', 'обновить приложение', _('Checks and installs an update after confirmation.')],
                ['/reboot', 'перезагрузить роутер', _('Reboots the router after confirmation.')],
                ['/emergency_sites', 'аварийно-полезные сайты', _('Shows configured emergency-useful sites.')]
        ];
}

function renderMessengerCommandList() {
        return E('div', { 'class': 'sf-command-list sf-command-list-wide' }, messengerCommandRows().map(function (command) {
                return E('div', { 'class': 'sf-command-item' }, [
                        E('code', {}, command[0]),
                        E('span', { 'class': 'sf-command-aliases' }, command[1]),
                        E('span', { 'class': 'sf-command-description' }, command[2])
                ]);
        }));
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
        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        setSettingsDraftOption('app_port', String(input.value || '').trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, _('Application port')),
                input,
                E('small', {}, _('Used by Android app and pairing QR codes.'))
        ]);
}

function messengerSettingsBox() {
        var activeValue = safeUciGet('sheepfold', 'global', 'active_messenger', 'none');
        var vkToken = messengerField(_('VK community access token'), 'vk_access_token', '', _('Stored on the router.'), true);
        var vkCommunity = messengerField(_('VK community ID'), 'vk_community_id', 'club123456789', '', false);
        var vkAdmin = messengerField(_('VK admin user ID'), 'vk_admin_user_id', '123456789', _('Sheepfold accepts messenger commands only from the administrator ID entered here. Other users are ignored.'), false);
        var telegramToken = messengerField(_('Telegram bot token'), 'telegram_bot_token', '123456:ABC...', _('Stored on the router.'), true);
        var telegramAdmin = messengerField(_('Telegram admin chat ID'), 'telegram_admin_chat_id', '123456789', _('Sheepfold accepts messenger commands only from the administrator ID entered here. Other users are ignored.'), false);
        var fields = [vkToken, vkCommunity, vkAdmin, telegramToken, telegramAdmin];
        var select;
        var initialMessengerOptions;
        var statusText = E('span', {}, activeValue === 'none' ? _('Messenger disabled.') : _('Messenger status will be checked after saving settings or sending a test message.'));
        var statusPlaque = E('div', {
                'class': 'sf-messenger-status ' + (activeValue === 'none' ? 'sf-messenger-status-muted' : 'sf-messenger-status-idle')
        }, [
                E('span', { 'class': 'sf-messenger-status-label' }, _('Messenger connection status')),
                statusText
        ]);

        function collectOptions() {
                var options = {
                        active_messenger: select.value
                };

                fields.forEach(function (field) {
                        options[field.sfOption] = field.sfInput.value.trim();
                });

                return options;
        }

        function restartSheepfoldService() {
                return fs.exec('/etc/init.d/sheepfold', ['restart']).catch(function () {});
        }

        function readMessengerStatus() {
                return routerControl(['messenger-status']).then(function (result) {
                        return parseKeyValueOutput(result.stdout || '');
                });
        }

        function setMessengerStatus(kind, message) {
                statusPlaque.className = 'sf-messenger-status sf-messenger-status-' + kind;
                statusText.textContent = message || _('Connection check failed.');
        }

        function fallbackMessengerStatusMessage(value) {
                if (value === 'telegram')
                        return _('No response from Telegram server.');
                if (value === 'vk')
                        return _('No response from VK server.');
                return _('Messenger disabled.');
        }

        function checkMessengerConnection() {
                var options = collectOptions();

                if (options.active_messenger === 'none') {
                        setMessengerStatus('muted', _('Messenger disabled.'));
                        return Promise.resolve(null);
                }

                setMessengerStatus('checking', _('Checking messenger connection...'));

                return routerControl(['messenger-check']).then(function (result) {
                        var status = parseKeyValueOutput(result.stdout || '');
                        var kind = status.status === 'connected' ? 'ok' : 'warning';

                        setMessengerStatus(kind, status.message || fallbackMessengerStatusMessage(options.active_messenger));
                        return status;
                }, function (error) {
                        var status = parseKeyValueOutput(error && error.stdout ? error.stdout : '');

                        setMessengerStatus('warning', status.message || fallbackMessengerStatusMessage(options.active_messenger));
                        return status;
                });
        }

        function saveMessengerOptions() {
                var options = collectOptions();
                var args;

                if (options.active_messenger === 'telegram') {
                        args = [
                                'messenger-save-telegram',
                                options.telegram_bot_token || '',
                                options.telegram_admin_chat_id || ''
                        ];
                } else if (options.active_messenger === 'vk') {
                        args = [
                                'messenger-save-vk',
                                options.vk_access_token || '',
                                options.vk_community_id || '',
                                options.vk_admin_user_id || ''
                        ];
                } else {
                        args = ['messenger-disable'];
                }

                return routerControl(args).then(function () {
                        return restartSheepfoldService();
                }).then(function () {
                        return readMessengerStatus();
                }).then(function (status) {
                        if ((status.active || 'none') !== options.active_messenger) {
                                throw new Error(_('Messenger settings were sent to the router, but the router still reports another active messenger. Reinstall the latest Sheepfold package and check UCI config.') + ' ' + _('Router reports active messenger:') + ' ' + (status.active || 'none'));
                        }

                        activeValue = options.active_messenger;
                        initialMessengerOptions = collectOptions();
                        return checkMessengerConnection().then(function () {
                                return status;
                        });
                });
        }

        var vkFields = E('div', { 'class': 'sf-messenger-fields' }, [
                E('div', { 'class': 'sf-note' }, _('Create a VK community, enable messages, create an access token for community messages, then enter the community ID and the VK user ID of the parent whose commands are allowed.')),
                vkToken,
                vkCommunity,
                vkAdmin
        ]);
        var telegramSetupSteps = E('details', { 'class': 'sf-note' }, [
                E('summary', {}, _('Step-by-step Telegram setup')),
                E('ol', {}, [
                        E('li', {}, _('Open Telegram and find the official @BotFather account. Check the username carefully: @BotFather.')),
                        E('li', {}, _('Press Start or send /start.')),
                        E('li', {}, _('Send /newbot and follow BotFather questions.')),
                        E('li', {}, _('Enter a visible bot name, for example Sheepfold Home. This name is shown in Telegram.')),
                        E('li', {}, _('Enter a unique bot username. It must end with bot, for example my_sheepfold_home_bot.')),
                        E('li', {}, _('BotFather will send a token that looks like 123456:ABC-DEF... Copy it into the Telegram bot token field. Treat this token like a password.')),
                        E('li', {}, _('Select Telegram as the active messenger and save settings in Sheepfold.')),
                        E('li', {}, _('Open the created bot from the parent Telegram account and send any message to it. If the chat ID field is empty, Sheepfold will reply with your chat ID.')),
                        E('li', {}, _('Copy that chat ID into the Telegram admin chat ID field and save settings again.')),
                        E('li', {}, _('Press the test message button. If everything is correct, the bot will send a message from the router.'))
                ]),
                E('p', {}, _('Keep the bot private. Do not publish its token, do not add it to public groups, and do not give the token to children.')),
                E('p', {}, [
                        E('a', {
                                'href': 'https://core.telegram.org/bots/tutorial',
                                'target': '_blank',
                                'rel': 'noopener noreferrer'
                        }, _('Official Telegram guide'))
                ])
        ]);
        var telegramFields = E('div', { 'class': 'sf-messenger-fields' }, [
                E('div', { 'class': 'sf-note' }, _('Telegram setup short note')),
                telegramSetupSteps,
                telegramToken,
                telegramAdmin,
                E('div', { 'class': 'sf-note' }, _('Russian phrases like "help", "status", "show all devices", "turn internet off", and "support" also work. Dangerous commands require confirmation. Commands are accepted only from the allowed user ID configured on the router.')),
                E('button', {
                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                        'click': function (ev) {
                                ev.preventDefault();
                                select.value = 'telegram';
                                setMessengerFieldsVisibility('telegram');
                                setMessengerStatus('checking', _('Checking messenger connection...'));
                                saveMessengerOptions().then(function () {
                                        return fs.exec('/usr/libexec/sheepfold/sheepfold-telegram-bot', ['send-test']);
                                }).then(function () {
                                        setMessengerStatus('ok', _('Telegram connected.'));
                                        notify(_('Test Telegram message sent.'), 'info');
                                }, function (error) {
                                        setMessengerStatus('warning', _('No response from Telegram server.'));
                                        notify(_('Could not send test Telegram message. Check bot token, chat ID, internet access on the router, and that Telegram is selected as the active messenger.') + ' ' + commandErrorText(error, ''), 'warning');
                                });
                        }
                }, _('Send test Telegram message')),
                E('div', { 'class': 'sf-messenger-command-box' }, [
                        E('h4', {}, _('Commands')),
                        renderMessengerCommandList()
                ])
        ]);
        select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;

                        activeValue = nextValue;
                        setMessengerFieldsVisibility(activeValue);
                        if (activeValue === 'none')
                                setMessengerStatus('muted', _('Messenger disabled.'));
                        else
                                setMessengerStatus('idle', _('Messenger status will be checked after saving settings or sending a test message.'));
                        markSettingsDraftChanged();
                }
        }, [
                ['none', _('Disabled')],
                ['vk', 'VK'],
                ['telegram', 'Telegram']
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === activeValue ? 'selected' : null }, item[1]);
        }));

        function setMessengerFieldsVisibility(value) {
                if (value === 'vk')
                        vkFields.removeAttribute('hidden');
                else
                        vkFields.setAttribute('hidden', 'hidden');

                if (value === 'telegram')
                        telegramFields.removeAttribute('hidden');
                else
                        telegramFields.setAttribute('hidden', 'hidden');
        }

        setMessengerFieldsVisibility(activeValue);
        initialMessengerOptions = collectOptions();

        fields.forEach(function (field) {
                field.sfInput.addEventListener('input', markSettingsDraftChanged);
                field.sfInput.addEventListener('change', markSettingsDraftChanged);
        });

        registerSettingsSpecialSaver({
                isChanged: function () {
                        return !sameObjectValues(initialMessengerOptions, collectOptions());
                },
                save: function () {
                        return saveMessengerOptions();
                },
                accept: function () {
                        initialMessengerOptions = collectOptions();
                }
        });

        return E('div', { 'class': 'sf-box' }, [
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, _('Active messenger')),
                        select
                ]),
                statusPlaque,
                vkFields,
                telegramFields
        ]);
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
        var input = E('input', Object.assign({
                'class': 'cbi-input-text',
                'value': value || ''
        }, attrs || {}));

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input,
                        hint ? E('small', {}, hint) : ''
                ])
        };
}

function selectControl(label, value, values, hint) {
        var input = E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
        }));

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input,
                        hint ? E('small', {}, hint) : ''
                ])
        };
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
        var input = E('input', Object.assign({
                'type': 'checkbox',
                'checked': checked ? 'checked' : null
        }, attrs || {}));

        return {
                input: input,
                node: E('label', { 'class': 'sf-check-field' }, [
                        input,
                        E('span', {}, label),
                        hint ? E('small', {}, hint) : ''
                ])
        };
}

function iconSvg(name) {
        var paths = {
                gear: [
                        'M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 3a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.6 1.5l.4 3h4l.4-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5z',
                        'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'
                ],
                trash: [
                        'M4 7h16',
                        'M10 11v6',
                        'M14 11v6',
                        'M6 7l1 14h10l1-14',
                        'M9 7V4h6v3'
                ],
                link: [
                        'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1',
                        'M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1'
                ],
                eye: [
                        'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z',
                        'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'
                ]
        };

        return svgIcon(paths[name] || paths.gear);
}

function iconButton(title, icon, tone, handler) {
        return E('button', {
                'class': 'sf-icon-action sf-icon-action-' + tone,
                'title': title,
                'aria-label': title,
                'click': function (ev) {
                        ev.preventDefault();
                        handler();
                }
        }, iconSvg(icon));
}

function wifiQrEscape(value) {
        return String(value == null ? '' : value).replace(/([\\;,:"])/g, '\\$1');
}

function wifiQrSecurity(encryption) {
        var value = String(encryption || '').toLowerCase();

        if (!value || value === 'none' || value === 'open' || value === 'disabled')
                return 'nopass';

        if (value.indexOf('wep') !== -1)
                return 'WEP';

        return 'WPA';
}

function wifiQrPayload(ssid, password, encryption) {
        var security = wifiQrSecurity(encryption);
        var payload = 'WIFI:T:' + security + ';S:' + wifiQrEscape(ssid) + ';';

        if (security !== 'nopass')
                payload += 'P:' + wifiQrEscape(password) + ';';

        return payload + ';';
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
                return uci.sections(config, type) || [];
        } catch (e) {
                return [];
        }
}

function reservedSheepfoldListSection(name) {
        return ['allowlist', 'blocklist', 'domain_allowlist'].indexOf(String(name || '')) !== -1;
}

function isReservedDeviceSourceName(name) {
        return /^(arp|dhcp|static)$/i.test(String(name || '').trim());
}

function normalizeMac(mac) {
        var value = String(mac || '').trim().toUpperCase().replace(/-/g, ':');
        var compact = value.replace(/:/g, '');

        if (/^[0-9A-F]{12}$/.test(compact))
                value = compact.replace(/(..)(?=.)/g, '$1:');

        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value))
                return '';

        if (value === '00:00:00:00:00:00')
                return '';

        return value;
}

function listOptionValues(value) {
        if (Array.isArray(value))
                return value;

        if (value == null)
                return [];

        return String(value).split(/\s+/).filter(Boolean);
}

function addRouterDevice(map, mac, data) {
        var normalizedMac = normalizeMac(mac);
        var current;

        if (!normalizedMac)
                return;

        current = map[normalizedMac] || {
                mac: normalizedMac,
                sources: {}
        };

        if (data.ip && !current.ip)
                current.ip = data.ip;
        if (data.staticIp)
                current.staticIp = data.staticIp;
        if (data.hostname && data.hostname !== '*')
                current.hostname = data.hostname;
        if (data.staticName)
                current.staticName = data.staticName;
        if (data.source)
                current.sources[data.source] = true;

        map[normalizedMac] = current;
}

function parseDhcpLeases(content, map) {
        String(content || '').split(/\n/).forEach(function (line) {
                var fields = line.trim().split(/\s+/);

                if (fields.length < 4)
                        return;

                addRouterDevice(map, fields[1], {
                        ip: fields[2],
                        hostname: fields[3],
                        source: 'dhcp'
                });
        });
}

function parseArpTable(content, map) {
        String(content || '').split(/\n/).slice(1).forEach(function (line) {
                var fields = line.trim().split(/\s+/);

                if (fields.length < 4)
                        return;

                addRouterDevice(map, fields[3], {
                        ip: fields[0],
                        source: 'arp'
                });
        });
}

function addStaticDhcpLeases(map) {
        safeUciSections('dhcp', 'host').forEach(function (section) {
                var name = section.name || section.hostname || section.dns || '';
                var ip = section.ip || '';
                var sectionName = section['.name'] || '';

                listOptionValues(section.mac).forEach(function (mac) {
                        addRouterDevice(map, mac, {
                                staticName: name,
                                staticIp: ip,
                                ip: ip,
                                staticSection: sectionName,
                                source: 'static'
                        });
                });
        });
}

function sheepfoldDeviceConfigByMac() {
        var byMac = {};

        safeUciSections('sheepfold', 'device').forEach(function (section) {
                var mac = normalizeMac(section.mac);

                if (reservedSheepfoldListSection(section['.name']))
                        return;

                if (!mac)
                        return;

                byMac[mac] = section;
        });

        return byMac;
}

function sheepfoldListMacs(listName) {
        var result = {};

        safeUciSections('sheepfold', 'list').forEach(function (section) {
                if (section['.name'] !== listName)
                        return;

                listOptionValues(section.mac).concat(listOptionValues(section.macs)).forEach(function (mac) {
                        mac = normalizeMac(mac);
                        if (mac)
                                result[mac] = true;
                });
        });

        return result;
}

function macInSheepfoldList(listName, mac) {
        var normalizedMac = normalizeMac(mac);
        var found = false;

        safeUciSections('sheepfold', 'list').forEach(function (section) {
                if (found || section['.name'] !== listName)
                        return;

                found = listOptionValues(section.mac).concat(listOptionValues(section.macs)).map(normalizeMac).indexOf(normalizedMac) !== -1;
        });

        return found;
}

function generatedSectionName(prefix, mac) {
        return prefix + '_' + normalizeMac(mac).toLowerCase().replace(/:/g, '');
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
        var values = listOptionValues(uci.get('sheepfold', sectionName, 'mac')).map(normalizeMac).filter(Boolean);
        var normalizedMac = normalizeMac(mac);
        var exists = values.indexOf(normalizedMac) !== -1;

        if (enabled && !exists)
                values.push(normalizedMac);

        if (!enabled)
                values = values.filter(function (value) {
                        return value !== normalizedMac;
                });

        // Сбрасываем list mac целиком: иначе LuCI uci.set не схлопывает add_list с роутера и MAC не попадает в белый список.
        uci.unset('sheepfold', sectionName, 'mac');
        values.forEach(function (value) {
                uci.set('sheepfold', sectionName, 'mac', value);
        });
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

        saveUciChanges(['sheepfold']).then(function () {
                notify(successText, 'info');
                window.setTimeout(function () {
                        window.location.reload();
                }, 500);
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
                uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
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

        return saveUciChanges(['sheepfold']);
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

function routerDeviceNote(item, configured) {
        if (configured && configured.note)
                return configured.note;

        if (configured && configured.detection_reason) {
                var confidence = configured.detection_confidence ?
                        ' (' + _('Detection confidence') + ': ' + configured.detection_confidence + '%)' :
                        '';

                return _('Auto-detected') + ': ' + configured.detection_reason + confidence;
        }

        if (configured)
                return _('Configured in Sheepfold');

        if (item.sources.static && (item.sources.dhcp || item.sources.arp))
                return _('Static DHCP lease, currently online');

        if (item.sources.dhcp)
                return _('Active DHCP lease');

        if (item.sources.arp)
                return _('ARP/neighbor entry');

        if (item.sources.static)
                return _('Static DHCP lease');

        return _('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.');
}

function buildRouterDevices(dhcpLeases, arpTable) {
        var map = {};
        var configuredByMac;
        var allowlist;
        var blocklist;

        parseDhcpLeases(dhcpLeases, map);
        parseArpTable(arpTable, map);
        addStaticDhcpLeases(map);
        configuredByMac = sheepfoldDeviceConfigByMac();

        Object.keys(configuredByMac).forEach(function (mac) {
                var section = configuredByMac[mac];

                if (map[mac])
                        return;

                map[mac] = {
                        ip: section.ip || '',
                        hostname: section.name || '',
                        staticName: section.name || '',
                        sources: {}
                };
        });
        allowlist = sheepfoldListMacs('allowlist');
        blocklist = sheepfoldListMacs('blocklist');

        return Object.keys(map).sort(function (left, right) {
                var leftDevice = map[left];
                var rightDevice = map[right];
                var leftOnline = leftDevice.sources.dhcp || leftDevice.sources.arp ? 1 : 0;
                var rightOnline = rightDevice.sources.dhcp || rightDevice.sources.arp ? 1 : 0;
                var leftName = leftDevice.staticName || leftDevice.hostname || left;
                var rightName = rightDevice.staticName || rightDevice.hostname || right;

                if (leftOnline !== rightOnline)
                        return rightOnline - leftOnline;

                return leftName.localeCompare(rightName);
        }).map(function (mac, index) {
                var item = map[mac];
                var configured = configuredByMac[mac];
                var status = configured && configured.status ? configured.status : 'new';
                var adminDevice = configured && configured.admin_device === '1';
                var groupName = configured && configured.group ? normalizeGroupName(configured.group) : NOT_CONFIGURED_GROUP;
                var groupSection = groupSectionByName(groupName);
                var deviceType = configured && configured.device_type ?
                        configured.device_type :
                        configured && configured.detected_type ?
                                configured.detected_type :
                                inferDeviceType(item, configured);

                if (allowlist[mac])
                        status = 'allow';
                if (blocklist[mac])
                        status = 'blocked';

                var statusBadge = deviceStatusBadge(status, configured);

                return {
                        id: 'D-' + String(index + 1).padStart(4, '0'),
                        name: configured && configured.name &&
                                !reservedSheepfoldListSection(configured.name) &&
                                !isReservedDeviceSourceName(configured.name) ?
                                configured.name :
                                (item.staticName || item.hostname || _('Unknown device')),
                        ip: configured && configured.ip ? configured.ip : (item.ip || item.staticIp || ''),
                        mac: mac,
                        hostname: item.hostname || '',
                        staticIp: item.staticIp || '',
                        staticLease: !!item.sources.static,
                        staticSection: item.staticSection || '',
                        configSection: configured && configured['.name'],
                        sourceLabel: Object.keys(item.sources).map(function (source) {
                                return source === 'dhcp' ? _('Active DHCP lease') :
                                        source === 'arp' ? _('ARP/neighbor entry') :
                                                _('Static DHCP lease');
                        }).join(', '),
                        group: groupName,
                        deviceType: deviceType,
                        manualDeviceType: configured && configured.manual_device_type === '1',
                        detectionConfidence: configured && configured.detection_confidence,
                        detectionReason: configured && configured.detection_reason,
                        autoGroupAssigned: configured && configured.auto_group_assigned === '1',
                        noRestrictionsAutoExcluded: configured && configured.no_restrictions_auto_excluded === '1',
                        status: status,
                        statusBadge: statusBadge,
                        note: routerDeviceNote(item, configured),
                        adminDevice: adminDevice,
                        adminOwner: configured && configured.admin_owner,
                        adminLogin: configured && configured.admin_login,
                        groupAllowlistOnly: groupSection && groupSection.allowlist_only === '1',
                        activityLogEnabled: !adminDevice && status !== 'allow' && status !== 'blocked' && (
                                configured && configured.activity_log_enabled === '1' ||
                                groupSection && groupSection.activity_log_enabled === '1'
                        )
                };
        });
}

function wifiBandKind(band, channel) {
        var value = String(band || '').toLowerCase().trim();
        var channelNum = parseInt(channel, 10);

        if (value === '2g' || value === '2ghz' || value.indexOf('2.4') !== -1)
                return '2g';

        if (value === '5g' || value === '5ghz')
                return '5g';

        if (value === '6g' || value === '6ghz')
                return '6g';

        if (/^11b$|^11g$|^11ng$|^bg$/.test(value))
                return '2g';

        if (/^11a$|^11ac$/.test(value))
                return '5g';

        if (!isNaN(channelNum)) {
                if (channelNum >= 36)
                        return '5g';

                if (channelNum >= 1 && channelNum <= 14)
                        return '2g';
        }

        return '';
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
        return safeUciSections('wireless', 'wifi-iface').filter(function (section) {
                return section.disabled !== '1' && (!section.mode || section.mode === 'ap');
        }).map(function (section) {
                var device = section.device || '';
                var deviceLabel = device || _('Network');
                var band = device ? (safeUciGet('wireless', device, 'band', '') || safeUciGet('wireless', device, 'hwmode', '')) : '';
                var channel = device ? (safeUciGet('wireless', device, 'channel', 'auto') || 'auto') : 'auto';
                var sectionName = section['.name'] || '';
                var ssid = section.ssid || (sectionName ? safeUciGet('wireless', sectionName, 'ssid', '') : '') || '';
                var encryption = section.encryption || (sectionName ? safeUciGet('wireless', sectionName, 'encryption', '') : '') || 'none';
                var password = section.key || (sectionName ? safeUciGet('wireless', sectionName, 'key', '') : '') || '';

                return {
                        title: ssid || deviceLabel,
                        bandKind: wifiBandKind(band, channel),
                        sectionName: sectionName,
                        device: device,
                        ssid: ssid,
                        password: password,
                        encryption: encryption,
                        channel: channel
                };
        });
}

function clearWifiNetworkEditors() {
        wifiNetworkEditors = [];
}

function wifiEditorSnapshot(editor) {
        return {
                ssid: String(editor.ssidInput.value || '').trim(),
                password: String(editor.passwordInput.value || ''),
                encryption: String(editor.securitySelect.value || ''),
                channel: String(editor.channelSelect.value || 'auto')
        };
}

function wifiEditorIsDirty(editor) {
        var current = wifiEditorSnapshot(editor);

        return current.ssid !== editor.original.ssid ||
                current.password !== editor.original.password ||
                current.encryption !== editor.original.encryption ||
                current.channel !== editor.original.channel;
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

function wifiSecurityOptions(value) {
        var options = [
                ['sae-mixed', 'WPA2/WPA3 mixed'],
                ['psk2', 'WPA2-PSK'],
                ['sae', 'WPA3-SAE'],
                ['psk-mixed', 'WPA/WPA2 mixed'],
                ['wep', 'WEP'],
                ['none', _('Open network')]
        ];
        var known = options.some(function (item) {
                return item[0] === value;
        });

        if (value && !known)
                options.unshift([value, value]);

        return options;
}

function wifiNetworkCardColor(index) {
        var palette = groupColorPalette();

        return palette[index % palette.length];
}

function wifiNetworkBox(network, index) {
        var ssidInput = E('input', { 'class': 'cbi-input-text', 'value': network.ssid || '' });
        var passwordInput = E('input', { 'class': 'cbi-input-text', 'value': network.password || '' });
        var securitySelect = E('select', { 'class': 'cbi-input-select' }, wifiSecurityOptions(network.encryption).map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === network.encryption ? 'selected' : null }, item[1]);
        }));
        var channelSelect = E('select', { 'class': 'cbi-input-select' }, [
                ['auto', _('Auto')],
                ['1', '1'],
                ['6', '6'],
                ['11', '11'],
                ['36', '36'],
                ['44', '44'],
                ['149', '149']
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === network.channel ? 'selected' : null }, item[1]);
        }));
        var qrWrap = E('div', { 'class': 'sf-wifi-qr-code' });

        function updateQr() {
                var payload = wifiQrPayload(ssidInput.value, passwordInput.value, securitySelect.value);

                qrWrap.replaceChildren(qrCode(payload));
        }

        ssidInput.addEventListener('input', updateQr);
        passwordInput.addEventListener('input', updateQr);
        securitySelect.addEventListener('change', updateQr);

        updateQr();

        registerWifiNetworkEditor({
                sectionName: network.sectionName || '',
                device: network.device || '',
                ssidInput: ssidInput,
                passwordInput: passwordInput,
                securitySelect: securitySelect,
                channelSelect: channelSelect,
                original: {
                        ssid: String(network.ssid || '').trim(),
                        password: String(network.password || ''),
                        encryption: String(network.encryption || 'none'),
                        channel: String(network.channel || 'auto')
                }
        });

        return E('div', {
                'class': 'sf-box sf-wifi-network',
                'style': 'background-color: ' + wifiNetworkCardColor(index) + ';'
        }, [
                E('h4', { 'class': 'sf-wifi-title' }, wifiNetworkTitle(network)),
                E('div', { 'class': 'sf-wifi-fields' }, [
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, _('SSID')),
                                ssidInput
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, _('Password')),
                                passwordInput
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, _('Security')),
                                securitySelect
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, _('Channel')),
                                channelSelect
                        ])
                ]),
                E('div', { 'class': 'sf-wifi-qr' }, [
                        qrWrap,
                        E('small', {}, _('Scan to connect to this Wi-Fi network.'))
                ])
        ]);
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

                return Promise.all([
                        uci.load('wireless').then(function () {
                                self.uciLoadState.wireless = true;
                        }, function () {
                                self.uciLoadState.wireless = false;
                        }),
                        uci.load('sheepfold').then(function () {
                                self.uciLoadState.sheepfold = true;
                        }, function () {
                                self.uciLoadState.sheepfold = false;
                        }),
                        uci.load('system').then(function () {
                                self.uciLoadState.system = true;
                        }, function () {
                                self.uciLoadState.system = false;
                        }),
                        uci.load('dhcp')
                ]).then(function () {
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
                        }, tab[1]);
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

                if (tab === 'info' && routerInfoState.status !== 'loading')
                        loadRouterInformation(routerInfoState.status !== 'ready').catch(function () {});
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
                        }, tab[1]);
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
                        }, tab[1]);
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
                        }, tab[1]);
                }));
        },

        renderRootPasswordStatus: function () {
                if (rootPasswordIsSet) {
                        return '';
                }

                return E('div', {
                        'class': 'sf-note ' + (rootPasswordIsSet ? 'sf-note-ok' : 'sf-note-danger')
                }, [
                        E('strong', {}, _('Router root password check')),
                        E('span', {}, _('Root password is not set. Sheepfold settings must stay locked until the router password is configured.')),
                        E('a', {
                                'class': 'sf-inline-link',
                                'href': L.url('admin/system/admin')
                        }, _('Open router password page'))
                ]);
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
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('Allow and block rules for devices and groups.'))
                                ]),
                                actionButton(_('Add rule'), 'positive', _('Schedule editor is not implemented in this visual test build.'))
                        ]),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, _('School days')),
                                        E('p', {}, _('Children group')),
                                        E('strong', {}, _('Allow 07:00-20:30, block after bedtime'))
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, _('Temporary access')),
                                        E('div', { 'class': 'sf-chip-row' }, [
                                                '+15', '+30', '+1h', '+2h', '+3h', '+5h', _('End of day'), _('Bedtime')
                                        ].map(function (label) {
                                                return E('button', {
                                                'class': 'sf-chip',
                                                        'click': function (ev) {
                                                                ev.preventDefault();
                                                                notify(_('Temporary access requires confirmation.'), 'info');
                                                        }
                                                }, label);
                                        }))
                                ])
                        ]),
                        E('div', { 'class': 'sf-form-row' }, [
                                field(_('Default bedtime'), '21:00', _('Used by the "until bedtime" quick action.'))
                        ])
                ]);
        },

        renderGroups: function (embedded) {
                var grouped = {};
                var groupSections = {};
                var groupNames;

                safeUciSections('sheepfold', 'group').forEach(function (section) {
                        var groupName = normalizeGroupName(section.name);

                        if (groupName && !grouped[groupName])
                                grouped[groupName] = [];
                        if (groupName)
                                groupSections[groupName] = section;
                });

                ensureDefaultGroupSections(grouped, groupSections);

                devices.forEach(function (device) {
                        if (!device.group)
                                return;

                        device.group = normalizeGroupName(device.group);

                        if (!grouped[device.group])
                                grouped[device.group] = [];

                        grouped[device.group].push(device);
                });

                supplementGroupedDevicesFromUci(grouped);

                function deleteGroup(groupName) {
                        var section = groupSections[groupName];
                        var sectionName = section && section['.name'];

                        if (normalizeGroupName(groupName) === noRestrictionsGroupName()) {
                                notify(_('Protected group cannot be deleted.'), 'warning');
                                return;
                        }

                        if (grouped[groupName] && grouped[groupName].length) {
                                notify(_('This group cannot be deleted while devices are assigned to it.'), 'warning');
                                return;
                        }

                        if (section && section.protected === '1') {
                                notify(_('Protected group cannot be deleted.'), 'warning');
                                return;
                        }

                        if (!sectionName) {
                                notify(_('Group editor is not implemented in this visual test build.'), 'warning');
                                return;
                        }

                        if (!window.confirm(_('Delete group') + ': ' + groupName + '?'))
                                return;

                        uci.remove('sheepfold', sectionName);
                        saveUciChanges(['sheepfold']).then(function () {
                                delete grouped[groupName];
                                delete groupSections[groupName];
                                notify(_('Group deleted.'), 'info');
                                window.setTimeout(function () {
                                        window.location.reload();
                                }, 700);
                        }, function () {
                                notify(_('Could not delete group.'), 'warning');
                        });
                }

                groupNames = Object.keys(grouped).sort(function (left, right) {
                        return left.localeCompare(right);
                });

                var usedCardColors = {};

                function cardColor(groupName, section) {
                        var color = section && validGroupColor(section.color) ? section.color : '';
                        var palette = groupColorPalette();

                        if (!color) {
                                for (var i = 0; i < palette.length; i++) {
                                        if (!usedCardColors[palette[i].toLowerCase()]) {
                                                color = palette[i];
                                                break;
                                        }
                                }
                        }

                        color = color || groupAutoColor(groupName);
                        usedCardColors[color.toLowerCase()] = true;
                        return color;
                }

                function groupCard(groupName) {
                        var section = groupSections[groupName];
                        var groupDevices = grouped[groupName] || [];
                        var visibleDevices = groupDevices.slice(0, 5);
                        var hiddenCount = Math.max(0, groupDevices.length - visibleDevices.length);

                        return E('div', {
                                'class': 'sf-box sf-group-box',
                                'style': 'background-color: ' + cardColor(groupName, section) + ';'
                        }, [
                                E('div', { 'class': 'sf-group-head' }, [
                                        E('div', {}, [
                                                E('h4', { 'class': 'sf-group-title' }, displayGroupName(groupName)),
                                                E('strong', { 'class': 'sf-group-count' }, groupDevices.length + ' ' + _('Devices'))
                                        ]),
                                        E('div', { 'class': 'sf-row-actions' }, [
                                                iconButton(_('Configure group'), 'gear', 'neutral', function () {
                                                        showGroupSettingsModal(groupName, section);
                                                }),
                                                iconButton(_('Delete group'), 'trash', 'danger', function () {
                                                        deleteGroup(groupName);
                                                })
                                        ])
                                ]),
                                visibleDevices.length ? E('div', { 'class': 'sf-group-device-list' }, visibleDevices.map(function (device) {
                                        return E('div', {}, [
                                                E('span', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                                                E('span', {}, device.name)
                                        ]);
                                }).concat(hiddenCount ? [
                                        E('div', { 'class': 'sf-group-device-more' }, '+ ' + hiddenCount + ' ' + _('more devices hidden'))
                                ] : [])) : E('div', { 'class': 'sf-muted' }, _('No devices'))
                        ]);
                }

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, _('Groups collect devices so schedules and access rules can be applied to several devices at once.'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                                        'click': function (ev) {
                                                var existingNames = {};

                                                ev.preventDefault();
                                                groupNames.forEach(function (groupName) {
                                                        existingNames[groupName] = true;
                                                });
                                                showAddGroupModal(existingNames);
                                        }
                                }, _('Add group'))
                        ]),
                        groupNames.length ?
                                E('div', { 'class': 'sf-grid two' }, groupNames.map(groupCard)) :
                                E('div', { 'class': 'sf-note sf-note-warning' }, _('No groups yet. Assign devices to groups in device settings.'))
                ]);
        },

        renderEmergency: function () {
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
                        E('div', { 'class': 'sf-domain-list' }, emergencySites.map(domainCard))
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
                var table = E('div', { 'class': 'sf-admin-table' }, [
                        E('div', { 'class': 'sf-admin-row sf-admin-head' }, [
                                E('div', {}, adminSortHeader(_('Admin name'), 'name')),
                                E('div', {}, adminSortHeader(_('Login'), 'login')),
                                E('div', {}, _('Admin devices')),
                                E('div', {}, _('Actions'))
                        ])
                ].concat(admins.map(adminTableRow)));

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, _('Administrator accounts'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showAddAdministratorModal(function (admin) {
                                                        table.appendChild(adminTableRow(admin));
                                                });
                                        }
                                }, _('Add administrator'))
                        ]),
                        table
                ]);
        },

        renderLogs: function () {
                var logNode = E('div', { 'class': 'sf-log' }, renderLogRows());
                var filterUi;

                function refreshLogView() {
                        logNode.replaceChildren.apply(logNode, renderLogRows());
                }

                filterUi = createLogFilterUi(refreshLogView);

                return E('div', { 'class': 'sf-panel' }, [
                        E('p', { 'class': 'sf-section-intro' }, _('The log is stored in RAM for fast viewing and is cleared after router reboot. When USB flash or Yandex Disk is configured, events are mirrored there too. Export masks sensitive fields.')),
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
                                ['en', _('English')]
                        ], null, null, _('Applies to the Sheepfold LuCI interface after you press Save. The page reloads automatically.')),
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

        renderSettingsAi: function () {
                return aiSettingsBox();
        },

        renderSettingsStorage: function () {
                return E('div', { 'class': 'sf-flat-form' }, [
                        E('p', { 'class': 'sf-note' },
                                _('Store journals in RAM to protect router flash memory. USB or Yandex Disk can archive rotated logs and configuration backups when configured.')),
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
                        settingsDivider(_('Site list sources')),
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
                        this.renderSettingsPanel('ai', this.renderSettingsAi()),
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
                var header = E('div', { 'class': 'sf-header' }, [
                        E('div', {}, [
                                E('h2', {}, _('Sheepfold Family Internet Control')),
                                E('p', {}, _('Visual test build. Router rules and persistence are not active yet.'))
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
                                }),
                                metric(_('Allowlist'), String(allowlistCount), 'positive', function (button) {
                                        self.openUserListMetric(button, 'allowlist');
                                }),
                                metric(_('Restricted'), String(restrictedCount), 'warning', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }),
                                metric(_('Blocklist'), String(blocklistCount), 'danger', function (button) {
                                        self.openUserListMetric(button, 'blocklist');
                                })
                        ]),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);

                this.runInitialDeepLinkAction();

                return page;
        }
});
