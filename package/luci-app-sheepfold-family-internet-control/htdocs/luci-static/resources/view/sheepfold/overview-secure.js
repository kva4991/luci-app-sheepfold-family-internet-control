'use strict';
'require view.sheepfold.overview as overview';
'require uci';
'require ui';
'require fs';

/*
 * Совместимая обёртка над основным экраном overview.
 *
 * Настройки ИИ раньше находились в общей секции. Теперь ими управляет отдельный
 * экран sheepfold/ai: там находятся включение, квоты, согласие для детского
 * режима и проверка OpenSSL. Два редактора создавали бы конкурирующие пути
 * сохранения и показывали устаревшие значения моделей.
 */
var renderSettingsGeneral = overview.renderSettingsGeneral;
var renderSettings = overview.renderSettings;
var renderAdmins = overview.renderAdmins;

function routerControl(args) {
	return fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', args);
}

function parseKeyValueOutput(text) {
	var values = {};

	String(text || '').split(/\r?\n/).forEach(function(line) {
		var separator = line.indexOf('=');

		if (separator > 0)
			values[line.slice(0, separator)] = line.slice(separator + 1);
	});

	return values;
}

function commandErrorText(error, fallback) {
	var message = fallback;

	if (error)
		message = error.stderr || error.stdout || error.message || fallback;

	return String(message || fallback).trim();
}

function findLedControlSelect(root) {
	var selects = Array.prototype.slice.call(root.querySelectorAll('select'));

	return selects.find(function(select) {
		return !!select.querySelector('option[value="off_forever"]') &&
			!!select.querySelector('option[value="new_device_alert_until_luci_login"]');
	}) || null;
}

function continueSettingsSave(button) {
	button.dataset.sheepfoldLedDependencyBypass = '1';
	button.click();
}

function confirmLedDependencyInstall(packageName) {
	return new Promise(function(resolve) {
		var completed = false;

		function finish(confirmed) {
			if (completed)
				return;

			completed = true;
			ui.hideModal();
			resolve(confirmed);
		}

		ui.showModal(_('Зависимость для управления светодиодами'), [
			E('div', { 'class': 'cbi-section' }, [
				E('p', {}, _('Для управления светодиодами на Cudy WR3000S будет установлен дополнительный пакет.')),
				E('p', {}, [
					E('strong', {}, _('Пакет') + ': '),
					E('code', {}, packageName)
				]),
				E('p', {}, _('Установить зависимость и продолжить сохранение настроек?'))
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': function(event) {
						event.preventDefault();
						finish(false);
					}
				}, _('Нет')),
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': function(event) {
						event.preventDefault();
						finish(true);
					}
				}, _('Да'))
			])
		]);
	});
}

function installLedDependency(packageName) {
	return new Promise(function(resolve, reject) {
		var spinner = E('span', { 'class': 'sf-spinner' });
		var statusNode = E('p', {}, _('Устанавливается зависимость. Не закрывайте страницу.'));
		var outputNode = E('pre', { 'class': 'sf-pre' }, _('Подготовка установки…'));
		var closeButton = E('button', {
			'class': 'btn cbi-button',
			'hidden': 'hidden',
			'click': function(event) {
				event.preventDefault();
				ui.hideModal();
			}
		}, _('Закрыть'));

		ui.showModal(_('Установка зависимости'), [
			E('div', { 'class': 'sf-update-progress' }, [
				spinner,
				statusNode
			]),
			outputNode,
			E('div', { 'class': 'right sf-modal-actions' }, [closeButton])
		]);

		routerControl(['led-dependency-install']).then(function(result) {
			var code = Number(result && result.code || 0);
			var output = String(result && (result.stdout || result.stderr) || '').trim();

			outputNode.textContent = output || packageName;
			if (code !== 0)
				throw new Error(output || _('Не удалось установить зависимость.'));

			spinner.className = 'sf-spinner sf-spinner-done';
			statusNode.textContent = _('Зависимость успешно установлена.');
			closeButton.hidden = false;

			window.setTimeout(function() {
				ui.hideModal();
				resolve();
			}, 1000);
		}).catch(function(error) {
			spinner.className = 'sf-spinner sf-spinner-failed';
			statusNode.textContent = _('Не удалось установить зависимость.');
			outputNode.textContent = commandErrorText(error, _('Не удалось установить пакет mdio-tools.'));
			closeButton.hidden = false;
			reject(error);
		});
	});
}

function attachLedDependencyCheck(root, button) {
	button.addEventListener('click', function(event) {
		var ledSelect;

		if (button.dataset.sheepfoldLedDependencyBypass === '1') {
			delete button.dataset.sheepfoldLedDependencyBypass;
			return;
		}

		ledSelect = findLedControlSelect(root);
		if (!ledSelect || ledSelect.value === 'router_default')
			return;

		event.preventDefault();
		event.stopImmediatePropagation();

		routerControl(['led-dependency-status']).then(function(result) {
			var code = Number(result && result.code || 0);
			var status;

			if (code !== 0)
				throw new Error(String(result && (result.stderr || result.stdout) || ''));

			status = parseKeyValueOutput(result && result.stdout || '');
			if (status.board !== 'cudy,wr3000s-v1' || status.required !== '1' || status.installed === '1') {
				continueSettingsSave(button);
				return null;
			}

			return confirmLedDependencyInstall(status.package || 'mdio-tools').then(function(confirmed) {
				if (!confirmed) {
					ledSelect.value = 'router_default';
					ledSelect.dispatchEvent(new Event('change', { bubbles: true }));
					continueSettingsSave(button);
					return null;
				}

				return installLedDependency(status.package || 'mdio-tools').then(function() {
					continueSettingsSave(button);
				});
			});
		}).catch(function(error) {
			ui.addNotification(null, E('p', {},
				_('Не удалось проверить или установить зависимость для светодиодов: ') +
				commandErrorText(error, _('неизвестная ошибка'))), 'error');
		});
	}, true);
}

overview.renderSettingsGeneral = function() {
	var node = renderSettingsGeneral.apply(this, arguments);
	var children = Array.prototype.slice.call(node.children || []);

	/*
	 * Порядок элементов legacy-секции:
	 * 0 — язык, 1 — порт, 2 — политика новых устройств,
	 * 3 — автонастройка, 4 — обновления, 5–9 — старые поля ИИ.
	 * После полного удаления legacy-полей из overview этот блок нужно удалить.
	 */
	children.slice(5, 10).forEach(function(child) {
		child.remove();
	});

	return node;
};

overview.renderSettings = function() {
	var node = renderSettings.apply(this, arguments);

	node.querySelectorAll('[data-settings-save]').forEach(function(button) {
		attachLedDependencyCheck(node, button);
	});

	return node;
};

function administratorLoginExists(login) {
	var normalized = String(login || '').trim().toLowerCase();
	var exists = false;

	uci.sections('sheepfold', 'administrator', function(section) {
		if (String(section.login || '').trim().toLowerCase() === normalized)
			exists = true;
	});

	return exists;
}

function showSafeAddAdministratorModal() {
	var nameInput = E('input', { 'class': 'cbi-input-text' });
	var loginInput = E('input', { 'class': 'cbi-input-text' });
	var errorNode = E('p', {
		'class': 'alert-message error',
		'hidden': 'hidden'
	});

	function showError(message) {
		errorNode.textContent = message;
		errorNode.hidden = false;
	}

	ui.showModal(_('Добавить администратора'), [
		E('div', { 'class': 'cbi-section' }, [
			E('p', {}, _('Сначала создаётся только учётная запись. Телефон получает административные права исключительно после QR-сопряжения с проверкой MAC, blocklist и одноразового кода.')),
			errorNode,
			E('label', { 'class': 'cbi-value' }, [
				E('span', { 'class': 'cbi-value-title' }, _('Имя администратора')),
				E('div', { 'class': 'cbi-value-field' }, nameInput)
			]),
			E('label', { 'class': 'cbi-value' }, [
				E('span', { 'class': 'cbi-value-title' }, _('Логин')),
				E('div', { 'class': 'cbi-value-field' }, loginInput)
			])
		]),
		E('div', { 'class': 'right' }, [
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.hideModal
			}, _('Отмена')),
			E('button', {
				'class': 'btn cbi-button cbi-button-positive',
				'click': function() {
					var displayName = nameInput.value.trim();
					var login = loginInput.value.trim();
					var sectionName;

					errorNode.hidden = true;
					if (!displayName || !login) {
						showError(_('Имя и логин обязательны.'));
						return;
					}
					if (!/^[A-Za-z0-9_.@+-]{1,64}$/.test(login)) {
						showError(_('Логин может содержать только латинские буквы, цифры и символы . _ - @ +'));
						return;
					}
					if (administratorLoginExists(login)) {
						showError(_('Этот логин уже используется.'));
						return;
					}

					sectionName = uci.add('sheepfold', 'administrator');
					uci.set('sheepfold', sectionName, 'display_name', displayName);
					uci.set('sheepfold', sectionName, 'login', login);
					uci.set('sheepfold', sectionName, 'role', 'administrator');
					uci.set('sheepfold', sectionName, 'password_hash', '');
					uci.set('sheepfold', sectionName, 'password_setup_required', '1');

					uci.save('sheepfold').then(function() {
						return uci.apply();
					}).then(function() {
						ui.addNotification(null, E('p', {}, _('Администратор создан. Откройте его настройки и выполните QR-сопряжение.')), 'info');
						ui.hideModal();
						window.location.reload();
					}).catch(function(error) {
						showError(error.message || _('Не удалось создать администратора.'));
					});
				}
			}, _('Создать'))
		])
	]);
}

overview.renderAdmins = function() {
	var node = renderAdmins.apply(this, arguments);
	var addButton = node.querySelector('.sf-panel-head .sf-action-positive');

	if (addButton) {
		addButton.replaceWith(E('button', {
			'class': 'sf-action sf-action-positive',
			'click': function(event) {
				event.preventDefault();
				showSafeAddAdministratorModal();
			}
		}, _('Добавить администратора')));
	}

	/*
	 * Ручная привязка обходила серверную повторную проверку blocklist.
	 * В secure-экране устройство становится административным только через QR.
	 */
	node.querySelectorAll('.sf-admin-row:not(.sf-admin-head) .sf-row-actions').forEach(function(actions) {
		var buttons = actions.querySelectorAll('button');
		if (buttons.length > 1)
			buttons[1].remove();
	});

	node.insertBefore(E('div', { 'class': 'sf-note sf-note-warning' },
		_('Ручная выдача административных прав устройству отключена. Используйте QR-код в настройках администратора.')), node.firstChild);

	return node;
};

return overview;
