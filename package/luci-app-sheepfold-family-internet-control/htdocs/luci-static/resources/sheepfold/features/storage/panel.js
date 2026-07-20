'use strict';
'require baseclass';

/* §frontmod
 * Панель хранения владеет локальными статусами облачных операций. UCI-черновик
 * и backend-команды приходят через узкие зависимости от координатора маршрута.
 */
function create(deps) {
	function storageStatusText(payload) {
		var message = payload && payload.message ? String(payload.message) : '';

		// Backend возвращает стабильную английскую строку: так один ответ одинаково
		// понимают LuCI на любом языке и диагностические инструменты. Переводим её
		// только на границе интерфейса, не смешивая локаль с backend-протоколом.
		return message ? _(message) : _('Could not read storage status.');
	}

	function logStorageStatusView() {
		var lamp = E('span', { 'class': 'sf-storage-status-lamp warn' });
		var text = E('span', { 'class': 'sf-storage-status-text' }, _('Checking storage status...'));

		function applyStatus(payload) {
			var state = payload && payload.state ? payload.state : 'error';

			lamp.className = 'sf-storage-status-lamp ' + (state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : 'error');
			text.textContent = storageStatusText(payload);
		}

	        function refresh() {
	                text.textContent = _('Checking storage status...');
	                lamp.className = 'sf-storage-status-lamp warn';

	                return deps.routerControl(['log-storage-status']).then(function (result) {
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

	function formatSyncAge(at) {
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

	function cloudMaintenancePanel(config) {
		var classPrefix = config.classPrefix;
		var statusNode = E('div', { 'class': classPrefix + '-actions-status sf-note' });
		var syncStatusNode = E('div', { 'class': classPrefix + '-sync-status sf-muted' });
		var listNode = E('div', { 'class': classPrefix + '-file-list' });
		var backupSelect = E('select', { 'class': 'cbi-input-select ' + classPrefix + '-backup-select' }, [
			E('option', { value: '' }, _('Latest backup'))
		]);

		function setStatus(message, tone) {
			statusNode.textContent = message || '';
			statusNode.className = classPrefix + '-actions-status sf-note' +
				(tone ? ' sf-note-' + tone : '');
		}

		function renderSyncStatus(payload) {
			var when;
			var line;

			if (!payload) {
				syncStatusNode.textContent = config.syncReadError;
				syncStatusNode.className = classPrefix + '-sync-status sf-note sf-note-warning';
				return;
			}

			if (payload.ok === false && payload.message === 'no sync yet') {
				syncStatusNode.textContent = config.noSync;
				syncStatusNode.className = classPrefix + '-sync-status sf-muted';
				return;
			}

			when = formatSyncAge(payload.at);
			line = config.lastSync + ' ' + (when || deps.infoValue(payload.at)) +
				(payload.message ? ' — ' + payload.message : '');

			syncStatusNode.textContent = line;
			syncStatusNode.className = classPrefix + '-sync-status sf-note' +
				(payload.ok ? ' sf-note-info' : ' sf-note-warning');
		}

		function refreshSyncStatus() {
			deps.routerControl([config.commandPrefix + '-sync-status']).then(function (result) {
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
				config.restoreNamed.replace('%s', selected) :
				config.restoreLatest;

			if (!window.confirm(confirmMessage))
				return;

			setStatus(config.restoring);

			deps.routerControl(selected ?
				[config.commandPrefix + '-restore-config', selected] :
				[config.commandPrefix + '-restore-config']
			).then(function (result) {
				var payload = parseRouterJsonOutput(result);

				if (payload && payload.ok) {
					setStatus(config.restored + ' ' + deps.infoValue(payload.restored), 'info');
					refreshSyncStatus();
					window.setTimeout(function () {
						window.location.reload();
					}, 1200);
					return;
				}

				setStatus(config.restoreFailed, 'warning');
			}, function () {
				setStatus(config.restoreFailed, 'warning');
			});
		}

		function renderFileList(payload) {
			if (!payload || !payload.ok) {
				listNode.replaceChildren(E('div', { 'class': 'sf-muted' }, config.listFailed));
				return;
			}

			populateBackupSelect(payload.backups || []);
			listNode.replaceChildren.apply(listNode, [
				[config.logsTitle, payload.logs || []],
				[config.backupsTitle, payload.backups || []]
			].map(function (section) {
				var items = section[1];

				return E('div', { 'class': classPrefix + '-file-group' }, [
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

		function testConnection(event) {
			event.preventDefault();
			setStatus(config.testing);

			deps.routerControl([config.commandPrefix + '-test']).then(function (result) {
				var payload = parseRouterJsonOutput(result);

				if (payload && payload.ok)
					setStatus(payload.message || config.testSuccess, 'info');
				else
					setStatus(config.testFailed, 'warning');
			}, function () {
				setStatus(config.testFailed, 'warning');
			});
		}

		function loadFiles(event) {
			event.preventDefault();
			setStatus(config.loadingFiles);

			deps.routerControl([config.commandPrefix + '-list']).then(function (result) {
				var payload = parseRouterJsonOutput(result);

				renderFileList(payload);
				if (payload && payload.ok)
					setStatus(config.listUpdated, 'info');
				else
					setStatus(config.listFailed, 'warning');
			}, function () {
				setStatus(config.listFailed, 'warning');
			});
		}

		window.setTimeout(refreshSyncStatus, 0);

		return E('div', { 'class': classPrefix + '-actions' }, [
			E('div', { 'class': 'sf-toolbar ' + classPrefix + '-toolbar' }, [
				E('button', { 'class': 'sf-action sf-action-neutral', 'click': testConnection }, config.testLabel),
				E('button', { 'class': 'sf-action sf-action-neutral', 'click': loadFiles }, _('Show files on disk')),
				E('button', {
					'class': 'sf-action sf-action-neutral',
					'click': function (event) {
						event.preventDefault();
						refreshSyncStatus();
					}
				}, _('Refresh sync status'))
			]),
			syncStatusNode,
			E('div', { 'class': classPrefix + '-restore-row' }, [
				backupSelect,
				E('button', {
					'class': 'sf-action sf-action-positive',
					'click': function (event) {
						event.preventDefault();
						restoreSelectedBackup();
					}
				}, _('Restore configuration backup'))
			]),
			statusNode,
			listNode
		]);
	}

	function yandexDiskMaintenancePanel() {
		return cloudMaintenancePanel({
			classPrefix: 'sf-yandex-disk',
			commandPrefix: 'yandex-disk',
			syncReadError: _('Could not read Yandex Disk sync status.'),
			noSync: _('No sync to Yandex Disk yet.'),
			lastSync: _('Last Yandex Disk sync:'),
			restoreNamed: _('Restore Sheepfold settings from configuration backup %s on Yandex Disk?'),
			restoreLatest: _('Restore Sheepfold settings from the latest configuration backup on Yandex Disk?'),
			restoring: _('Restoring configuration from Yandex Disk...'),
			restored: _('Configuration restored from Yandex Disk:'),
			restoreFailed: _('Could not restore configuration from Yandex Disk.'),
			logsTitle: _('Logs on Yandex Disk'),
			backupsTitle: _('Configuration backups on Yandex Disk'),
			testing: _('Testing Yandex Disk login...'),
			testSuccess: _('Yandex Disk login works.'),
			testFailed: _('Yandex Disk login failed.'),
			testLabel: _('Test Yandex Disk login'),
			loadingFiles: _('Loading file list from Yandex Disk...'),
			listUpdated: _('Yandex Disk file list updated.'),
			listFailed: _('Could not read Yandex Disk file list.')
		});
	}

	function googleDriveMaintenancePanel() {
		return cloudMaintenancePanel({
			classPrefix: 'sf-google-drive',
			commandPrefix: 'google-drive',
			syncReadError: _('Could not read Google Drive sync status.'),
			noSync: _('No sync to Google Drive yet.'),
			lastSync: _('Last Google Drive sync:'),
			restoreNamed: _('Restore Sheepfold settings from configuration backup %s on Google Drive?'),
			restoreLatest: _('Restore Sheepfold settings from the latest configuration backup on Google Drive?'),
			restoring: _('Restoring configuration from Google Drive...'),
			restored: _('Configuration restored from Google Drive:'),
			restoreFailed: _('Could not restore configuration from Google Drive.'),
			logsTitle: _('Logs on Google Drive'),
			backupsTitle: _('Configuration backups on Google Drive'),
			testing: _('Testing Google Drive authorization...'),
			testSuccess: _('Google Drive authorization works.'),
			testFailed: _('Google Drive authorization failed.'),
			testLabel: _('Test Google Drive authorization'),
			loadingFiles: _('Loading file list from Google Drive...'),
			listUpdated: _('Google Drive file list updated.'),
			listFailed: _('Could not read Google Drive file list.')
		});
	}

	function logStorageLocationField() {
	        var currentValue = deps.settingValue('log_storage', 'ram');
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
	                        deps.setOption('log_storage', ev.currentTarget.value);
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

	        yandexBlock.appendChild(deps.divider(_('Yandex Disk settings')));
	        yandexBlock.appendChild(deps.sectionInputField(
	                'cloud',
	                _('Yandex Disk login'),
	                'login',
	                '',
	                'login@yandex.ru',
	                _('Use an app password from Yandex ID security settings.')
	        ));
	        yandexBlock.appendChild(deps.sectionInputField(
	                'cloud',
	                _('Yandex Disk password'),
	                'password',
	                '',
	                '',
	                _('Use an app password from Yandex ID security settings.'),
	                true
	        ));
	        yandexBlock.appendChild(deps.sectionInputField(
	                'cloud',
	                _('Root folder on disk for Sheepfold'),
	                'root_folder',
	                '/sheepfold',
	                '/sheepfold'
	        ));
	        yandexBlock.appendChild(deps.sectionSelectField(
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

	        googleBlock.appendChild(deps.divider(_('Google Drive settings')));
	        googleBlock.appendChild(deps.sectionInputField(
	                'gdrive',
	                _('Google OAuth client ID'),
	                'client_id',
	                '',
	                '',
	                _('Create an OAuth client in Google Cloud Console (Desktop app type).')
	        ));
	        googleBlock.appendChild(deps.sectionInputField(
	                'gdrive',
	                _('Google OAuth client secret'),
	                'client_secret',
	                '',
	                '',
	                _('Optional for some clients, but usually required for refresh-token exchange.'),
	                true
	        ));
	        googleBlock.appendChild(deps.sectionInputField(
	                'gdrive',
	                _('Google OAuth refresh token'),
	                'refresh_token',
	                '',
	                '',
	                _('Obtain once on a PC and paste here. Sheepfold stores it only on the router.'),
	                true
	        ));
	        googleBlock.appendChild(deps.sectionInputField(
	                'gdrive',
	                _('Root folder on disk for Sheepfold'),
	                'root_folder',
	                '/sheepfold',
	                '/sheepfold'
	        ));
	        googleBlock.appendChild(deps.sectionSelectField(
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
	        googleBlock.appendChild(googleDriveMaintenancePanel());

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

	return {
		render: logStorageLocationField
	};
}

return baseclass.extend({
	create: create
});
