'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return uci.load('sheepfold');
	},

	render: function() {
		var provider = uci.get('sheepfold', 'global', 'ai_provider') || 'deepseek';
		var configured = !!(
			(provider === 'gemini' && uci.get('sheepfold', 'global', 'gemini_api_key')) ||
			(provider !== 'gemini' && uci.get('sheepfold', 'global', 'deepseek_api_key'))
		);
		var m = new form.Map('sheepfold', _('ИИ помощник'),
			_('Ключ провайдера хранится только на роутере. Обычные LAN-устройства могут задавать вопросы, но их запросы ограничиваются по MAC-адресу. Диагностика и журналы доступны только с токеном администратора.'));
		var s = m.section(form.NamedSection, 'global', 'sheepfold', _('Подключение к провайдеру'));
		s.anonymous = true;

		var o = s.option(form.ListValue, 'ai_provider', _('Провайдер'));
		o.value('deepseek', 'DeepSeek');
		o.value('gemini', 'Google Gemini');
		o.default = 'deepseek';

		o = s.option(form.Value, 'deepseek_model', _('Модель DeepSeek'));
		o.depends('ai_provider', 'deepseek');
		o.default = 'deepseek-chat';
		o.placeholder = 'deepseek-chat';

		o = s.option(form.Value, 'deepseek_api_url', _('API URL DeepSeek'));
		o.depends('ai_provider', 'deepseek');
		o.default = 'https://api.deepseek.com/chat/completions';

		o = s.option(form.Value, 'deepseek_api_key', _('API-ключ DeepSeek'));
		o.depends('ai_provider', 'deepseek');
		o.password = true;
		o.rmempty = true;
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'deepseek_api_key', value || '');
			if ((value || '').trim())
				uci.set('sheepfold', sectionId, 'ai_enabled', '1');
		};

		o = s.option(form.Value, 'gemini_model', _('Модель Gemini'));
		o.depends('ai_provider', 'gemini');
		o.default = 'gemini-2.5-flash';
		o.placeholder = 'gemini-2.5-flash';

		o = s.option(form.Value, 'gemini_api_url', _('API URL Gemini'));
		o.depends('ai_provider', 'gemini');
		o.default = 'https://generativelanguage.googleapis.com/v1beta/models';

		o = s.option(form.Value, 'gemini_api_key', _('API-ключ Gemini'));
		o.depends('ai_provider', 'gemini');
		o.password = true;
		o.rmempty = true;
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'gemini_api_key', value || '');
			if ((value || '').trim())
				uci.set('sheepfold', sectionId, 'ai_enabled', '1');
		};

		if (!configured) {
			s = m.section(form.TypedSection, '_ai_hint');
			s.anonymous = true;
			s.render = function() {
				return E('div', { 'class': 'cbi-section' }, [
					E('p', { 'class': 'alert-message notice' },
						_('Сохраните API-ключ выбранного провайдера. После сохранения появятся включение помощника, лимиты запросов и настройка индивидуальных журналов.'))
				]);
			};
			return m.render();
		}

		s = m.section(form.NamedSection, 'global', 'sheepfold', _('Доступ и ограничения'));
		s.anonymous = true;

		o = s.option(form.Flag, 'ai_enabled', _('Включить ИИ помощника'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'ai_rate_limit_requests', _('Запросов на устройство'));
		o.datatype = 'range(1,1000)';
		o.default = '20';
		o.description = _('Максимальное число запросов за одно окно для каждого MAC-адреса.');

		o = s.option(form.Value, 'ai_rate_limit_window_seconds', _('Окно ограничения, секунд'));
		o.datatype = 'range(60,86400)';
		o.default = '3600';

		o = s.option(form.Flag, 'ai_individual_logs', _('Разрешить индивидуальные журналы для ИИ'));
		o.default = '0';
		o.rmempty = false;
		o.description = _('При включении роутер проверит OpenSSL и попробует установить его через opkg. Если проверка не пройдёт, настройка автоматически останется выключенной. Передача журнала всё равно требует токен администратора.');
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'ai_individual_logs', value === '1' ? '1' : '0');
			if (value !== '1')
				return Promise.resolve();

			return fs.exec('/usr/libexec/sheepfold/sheepfold-openssl-ensure', []).then(function(res) {
				if (res.code === 0)
					return;
				uci.set('sheepfold', sectionId, 'ai_individual_logs', '0');
				ui.addNotification(null, E('p', {},
					_('OpenSSL не установлен или не прошёл проверку. Индивидуальные журналы отключены.')), 'error');
				throw new Error(res.stderr || _('Проверка OpenSSL завершилась ошибкой.'));
			});
		};

		return m.render();
	}
});
