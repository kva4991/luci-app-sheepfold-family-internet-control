'use strict';
'require baseclass';
'require fs';
'require ui';
'require uci';

function rebootButton(notify) {
	return E('button', {
		'class': 'sf-action sf-action-danger',
		'click': function (event) {
			event.preventDefault();
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

function updateButton(notify) {
	return E('button', {
		'class': 'sf-action sf-action-danger',
		'click': function (event) {
			var button = event.currentTarget;
			var spinner;
			var statusNode;
			var outputNode;
			var pollTimer = null;
			var polling = true;

			event.preventDefault();
			if (!window.confirm(_('Install Sheepfold update now?')))
				return;

			button.disabled = true;
			spinner = E('span', { 'class': 'sf-spinner' });
			statusNode = E('p', {}, _('Update started. Do not close this page until the result appears.'));
			outputNode = E('pre', { 'class': 'sf-pre' }, _('Starting update...'));

			function closeModal() {
				polling = false;
				if (pollTimer) window.clearTimeout(pollTimer);
				ui.hideModal();
			}

			function finish(spinnerClass, message, level) {
				polling = false;
				if (pollTimer) window.clearTimeout(pollTimer);
				spinner.className = 'sf-spinner ' + spinnerClass;
				statusNode.textContent = message;
				button.disabled = false;
				if (level) notify(message, level);
			}

			function poll() {
				if (!polling)
					return;

				Promise.all([
					fs.read('/tmp/sheepfold/update.status').catch(function () { return ''; }),
					fs.read('/tmp/sheepfold/update.log').catch(function () { return ''; })
				]).then(function (values) {
					var status = String(values[0] || '').trim();
					var log = String(values[1] || '').trim();

					outputNode.textContent = log || _('Update log is empty yet.');
					if (status === 'ok') {
						finish('sf-spinner-done', _('Update completed. Refresh LuCI if the interface still shows old files.'), 'info');
						return;
					}
					if (status === 'no_update') {
						finish('sf-spinner-done', _('No updates available. Installed version is already current.'), 'info');
						return;
					}
					if (status.indexOf('failed') === 0) {
						finish('sf-spinner-failed', _('Update failed. See log above.'), 'warning');
						return;
					}

					statusNode.textContent = _('Update is running. Waiting for router response...');
					pollTimer = window.setTimeout(poll, 2000);
				}, function () {
					statusNode.textContent = _('Update is running. Waiting for router response...');
					pollTimer = window.setTimeout(poll, 2000);
				});
			}

			ui.showModal(_('Update result'), [
				E('div', { 'class': 'sf-update-progress' }, [spinner, statusNode]),
				outputNode,
				E('div', { 'class': 'right sf-modal-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': closeModal }, _('Close'))
				])
			]);

			Promise.all([
				fs.write('/tmp/sheepfold/update.status', 'queued\n'),
				fs.write('/tmp/sheepfold/update.log', _('Checking for updates...') + '\n'),
				fs.write('/tmp/sheepfold/update.request', String(Date.now()) + '\n')
			]).then(function () {
				statusNode.textContent = _('Checking for updates...');
				outputNode.textContent = _('Checking for updates...');
				poll();
			}, function (error) {
				outputNode.textContent = String(error && error.message ? error.message : error);
				finish('sf-spinner-failed', _('Could not queue update request.'), 'warning');
			});
		}
	}, _('Update app'));
}

function versionStatusText(version, status) {
	return _('current version') + ' ' + version + ' (' + _(status) + ')';
}

function currentVersion() {
	try {
		return uci.get('sheepfold', 'global', 'ui_asset_version') || 'unknown';
	} catch (error) {
		return 'unknown';
	}
}

function updateRow(notify) {
	var version = currentVersion();
	var statusNode = E('span', { 'class': 'sf-update-version sf-update-version-checking' }, versionStatusText(version, 'checking'));

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
			statusNode.textContent = versionStatusText(version, status);
		}, function () {
			statusNode.className = 'sf-update-version sf-update-version-unknown';
			statusNode.textContent = versionStatusText(version, 'could not check');
		});
	}, 0);

	return E('div', { 'class': 'sf-update-row' }, [updateButton(notify), statusNode]);
}

return baseclass.extend({
	rebootButton: rebootButton,
	updateButton: updateButton,
	versionStatusText: versionStatusText,
	updateRow: updateRow
});
