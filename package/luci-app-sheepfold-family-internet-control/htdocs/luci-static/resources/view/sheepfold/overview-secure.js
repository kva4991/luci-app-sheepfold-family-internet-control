'use strict';
'require view.sheepfold.overview as overview';
'require uci';
'require ui';

/*
 * Совместимая обёртка над основным экраном overview.
 *
 * Настройки ИИ раньше находились в общей секции. Теперь ими управляет отдельный
 * экран sheepfold/ai: там находятся включение, квоты, согласие для детского
 * режима и проверка OpenSSL. Два редактора создавали бы конкурирующие пути
 * сохранения и показывали устаревшие значения моделей.
 */
var renderSettingsGeneral = overview.renderSettingsGeneral;
var renderAdmins = overview.renderAdmins;

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
