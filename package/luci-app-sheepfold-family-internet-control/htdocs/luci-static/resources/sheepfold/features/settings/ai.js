'use strict';
'require baseclass';

var create;

/* SHEEPFOLD_AI_BEGIN */
create = function (deps) {
	function hasConfiguredProvider() {
		var provider = deps.value('ai_provider', 'none');
		var keyOption;

		if (!provider || provider === 'none')
			return false;

		keyOption = provider === 'gemini' ? 'gemini_api_key' :
			(provider === 'grok' ? 'grok_api_key' : 'deepseek_api_key');
		return !!String(deps.value(keyOption, '') || '').trim();
	}

	function render() {
		var container = E('div', { 'class': 'sf-flat-form' });

		function currentProvider() {
			return deps.value('ai_provider', 'none');
		}

		function rebuild() {
			var provider = currentProvider();
			var fields = [
				E('label', { 'class': 'sf-field sf-field-wide' }, [
					E('span', {}, _('AI provider')),
					E('select', {
						'class': 'cbi-input-select',
						'change': function (event) {
							deps.setOption('ai_provider', event.currentTarget.value);
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
				deps.fields.saveSelectGlobalField(
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
					deps.fields.saveSelectGlobalField(_('AI assistant model'), 'deepseek_model', 'deepseek-v4-flash', [
						['deepseek-v4-flash', 'DeepSeek V4 Flash'],
						['deepseek-v4-pro', 'DeepSeek V4 Pro']
					], null, null, _('DeepSeek requests are sent from the router. The Android app does not store the API key.')),
					deps.fields.globalInputOptionField(
						_('DeepSeek API key'), 'deepseek_api_key', '', 'sk-...',
						_('Create the key in DeepSeek Platform and save it here. It is stored only on the router.'), true
					)
				);
			} else if (provider === 'gemini') {
				fields.push(
					deps.fields.saveSelectGlobalField(_('Gemini Free') + ' - ' + _('AI assistant model'), 'gemini_model', 'gemini-2.5-flash', [
						['gemini-2.5-flash', 'Gemini 2.5 Flash'],
						['gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite']
					], null, null, _('Gemini Free uses Google AI Studio free-tier limits. The API key is stored only on the router.')),
					deps.fields.globalInputOptionField(
						_('Gemini API key'), 'gemini_api_key', '', 'AIza...',
						_('Create the key in Google AI Studio and save it here. Free limits depend on Google account and region.'), true
					)
				);
			} else if (provider === 'grok') {
				fields.push(
					deps.fields.globalInputOptionField(
						_('Grok model'), 'grok_model', 'grok-3-mini', 'grok-3-mini',
						_('The model identifier is configurable because available Grok models may change.'), false
					),
					deps.fields.globalInputOptionField(
						_('Grok API key'), 'grok_api_key', '', 'xai-...',
						_('Create the key in the xAI console and save it here. It is stored only on the router.'), true
					)
				);
			}

			if (provider !== 'none') {
				if (!hasConfiguredProvider()) {
					fields.push(E('p', { 'class': 'sf-note' },
						_('Save the API key for the selected provider before enabling the assistant and protected logs.')));
				} else {
					fields.push(
						deps.fields.settingsDivider(_('Access and limits')),
						deps.fields.globalFlagOptionField(_('Enable AI assistant'), 'ai_enabled', '1'),
						deps.fields.globalFlagOptionField(
							_('Allow the AI assistant on child devices'),
							'child_ai_parental_consent',
							'0',
							_('Enable only after talking with the child. The child client never receives router diagnostics or admin logs.')
						),
						deps.fields.globalInputOptionField(_('Requests per device'), 'ai_rate_limit_requests', '20', '20', null, false),
						deps.fields.globalInputOptionField(_('Rate limit window, seconds'), 'ai_rate_limit_window_seconds', '3600', '3600', null, false),
						deps.fields.globalFlagOptionField(
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

	return { render: render };
};
/* SHEEPFOLD_AI_END */

/* После удаления AI-маркеров Standard сохраняет корректный модуль-заглушку. */
if (!create) {
	create = function () {
		return { render: function () { return ''; } };
	};
}

return baseclass.extend({ create: create });
