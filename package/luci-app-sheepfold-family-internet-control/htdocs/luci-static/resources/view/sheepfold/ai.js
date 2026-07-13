'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require sheepfold.i18n as sheepfoldI18n';

return view.extend({
	load: function() {
		return uci.load('sheepfold').then(function() {
			return sheepfoldI18n.installApplicationTranslator(
				uci.get('sheepfold', 'global', 'language') || 'ru'
			);
		});
	},

	render: function() {
		var hasConfiguredProvider = function() {
			var provider = uci.get('sheepfold', 'global', 'ai_provider') || 'none';
			if (!provider || provider === 'none')
				return false;
			var key = provider === 'gemini'
				? uci.get('sheepfold', 'global', 'gemini_api_key')
				: uci.get('sheepfold', 'global', 'deepseek_api_key');
			return !!String(key || '').trim();
		};

		function showOpenSslProgress() {
			var status = E('div', { 'class': 'cbi-section' }, [
				E('p', { 'class': 'spinning' }, _('Checking OpenSSL and generating key material. Do not close this page.'))
			]);
			ui.showModal(_('Configuring protected logs'), [status]);

			return fs.exec('/usr/libexec/sheepfold/sheepfold-openssl-ensure', []).then(function(result) {
				if (result.code !== 0)
					throw new Error(result.stderr || _('OpenSSL check failed.'));

				status.replaceChildren(
					E('p', { 'class': 'alert-message success' }, _('OpenSSL verified, key material is ready.')),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-positive',
							'click': function() { ui.hideModal(); }
						}, _('Close'))
					])
				);
				ui.addNotification(null, E('p', {}, _('Protected per-device logs are configured.')), 'info');
			}, function(error) {
				status.replaceChildren(
					E('p', { 'class': 'alert-message error' }, error.message || _('Failed to configure OpenSSL.')),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn cbi-button',
							'click': function() { ui.hideModal(); }
						}, _('Close'))
					])
				);
				throw error;
			});
		}

		var m = new form.Map('sheepfold', _('AI assistant'),
			_('The provider key is stored only on the router. Role and device identity are verified from LAN data and are never trusted from the client.'));
		var s = m.section(form.NamedSection, 'global', 'sheepfold', _('Provider connection'));
		s.anonymous = true;

		var o = s.option(form.ListValue, 'ai_provider', _('Provider'));
		o.value('none', _('Not set up'));
		o.value('deepseek', 'DeepSeek');
		o.value('gemini', 'Google Gemini');
		o.default = 'none';

		o = s.option(form.Value, 'deepseek_model', _('DeepSeek model'));
		o.depends('ai_provider', 'deepseek');
		o.default = 'deepseek-chat';
		o.placeholder = 'deepseek-chat';

		o = s.option(form.Value, 'deepseek_api_url', _('DeepSeek API URL'));
		o.depends('ai_provider', 'deepseek');
		o.default = 'https://api.deepseek.com/chat/completions';

		o = s.option(form.Value, 'deepseek_api_key', _('DeepSeek API key'));
		o.depends('ai_provider', 'deepseek');
		o.password = true;
		o.rmempty = true;
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'deepseek_api_key', value || '');
			if ((value || '').trim())
				uci.set('sheepfold', sectionId, 'ai_enabled', '1');
		};

		o = s.option(form.Value, 'gemini_model', _('Gemini model'));
		o.depends('ai_provider', 'gemini');
		o.default = 'gemini-2.5-flash';
		o.placeholder = 'gemini-2.5-flash';

		o = s.option(form.Value, 'gemini_api_url', _('Gemini API URL'));
		o.depends('ai_provider', 'gemini');
		o.default = 'https://generativelanguage.googleapis.com/v1beta/models';

		o = s.option(form.Value, 'gemini_api_key', _('Gemini API key'));
		o.depends('ai_provider', 'gemini');
		o.password = true;
		o.rmempty = true;
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'gemini_api_key', value || '');
			if ((value || '').trim())
				uci.set('sheepfold', sectionId, 'ai_enabled', '1');
		};

		s = m.section(form.NamedSection, 'global', 'sheepfold', _('Access and limits'));
		s.anonymous = true;

		var renderAdvanced = s.render;
		var parseAdvanced = s.parse;
		var advancedWasRendered = false;
		s.render = function() {
			if (!hasConfiguredProvider()) {
				advancedWasRendered = false;
				return E('div', { 'class': 'cbi-section' }, [
					E('p', { 'class': 'alert-message notice' },
						_('Save the API key for the selected provider. Once saved, the assistant toggle, limits, and protected logs will appear.'))
				]);
			}
			advancedWasRendered = true;
			return renderAdvanced.apply(this, arguments);
		};
		s.parse = function() {
			if (!advancedWasRendered)
				return Promise.resolve();
			return parseAdvanced.apply(this, arguments);
		};

		o = s.option(form.Flag, 'ai_enabled', _('Enable AI assistant'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'child_ai_parental_consent', _('Allow the AI assistant on child devices'));
		o.default = '0';
		o.rmempty = false;
		o.description = _('Enable only after talking with the child. The question, a limited chat history, the verified device ID, role, and a safe summary of current access are sent. Router diagnostics and logs are not available to the child client.');
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'child_ai_parental_consent', value === '1' ? '1' : '0');
			uci.set('sheepfold', sectionId, 'child_ai_consent_version', 'child-ai-v1');
		};

		o = s.option(form.Value, 'ai_rate_limit_requests', _('Requests per device'));
		o.datatype = 'range(1,1000)';
		o.default = '20';
		o.description = _('Maximum number of requests per window for each verified device.');

		o = s.option(form.Value, 'ai_rate_limit_window_seconds', _('Rate limit window, seconds'));
		o.datatype = 'range(60,86400)';
		o.default = '3600';

		o = s.option(form.Flag, 'ai_individual_logs', _('Allow per-device logs for AI'));
		o.default = '0';
		o.rmempty = false;
		o.description = _('Enabling this opens the OpenSSL setup dialog. Sending a log still requires an administrator token and a separate opt-in in the app.');
		o.write = function(sectionId, value) {
			uci.set('sheepfold', sectionId, 'ai_individual_logs', value === '1' ? '1' : '0');
			if (value !== '1')
				return Promise.resolve();

			return showOpenSslProgress().catch(function(error) {
				uci.set('sheepfold', sectionId, 'ai_individual_logs', '0');
				ui.addNotification(null, E('p', {},
					_('OpenSSL is not installed or failed verification. Per-device logs are disabled.')), 'error');
				throw error;
			});
		};

		return m.render();
	}
});
