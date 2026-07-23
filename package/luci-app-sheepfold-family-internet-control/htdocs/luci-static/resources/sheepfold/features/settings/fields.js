'use strict';
'require baseclass';

/* §frontmod §settingview1
 * Общие поля вкладок Settings получают только черновик и UI-фабрики. Они не знают
 * про UCI commit, backend-команды, порядок runtime side effects или страницу overview.
 */
function create(deps) {
	function secretControl(input) {
		return E('span', { 'class': 'sf-secret-row' }, [
			input,
			E('button', {
				'class': 'sf-icon-action sf-secret-toggle',
				'type': 'button',
				'title': _('Show secret'),
				'aria-label': _('Show secret'),
				'click': function (event) {
					var visible;

					event.preventDefault();
					visible = input.type === 'password';
					input.type = visible ? 'text' : 'password';
					event.currentTarget.setAttribute('title', visible ? _('Hide secret') : _('Show secret'));
					event.currentTarget.setAttribute('aria-label', visible ? _('Hide secret') : _('Show secret'));
				}
			}, deps.icon('eye'))
		]);
	}

	function globalTextareaOptionField(label, option, defaultValue, _savedMessage, _errorMessage, hint, rows) {
		var textareaRows = rows || 5;
		var textarea = E('textarea', {
			'class': 'cbi-input-textarea' + (textareaRows <= 2 ? ' sf-textarea-compact' : ''),
			'rows': textareaRows
		}, deps.value(option, defaultValue || ''));

		function update() {
			deps.setOption(option, textarea.value.trim());
		}

		textarea.addEventListener('input', update);
		textarea.addEventListener('keydown', function (event) {
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				update();
			}
		});

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, label),
			textarea,
			hint ? E('small', {}, hint) : ''
		]);
	}

	function cachePathField() {
		var currentValue = deps.value('log_cache_path', deps.defaultLogCachePath) || deps.defaultLogCachePath;
		var values = [
			[deps.defaultLogCachePath, deps.defaultLogCachePath],
			['/tmp/sheepfold/sheepfold.log', '/tmp/sheepfold/sheepfold.log'],
			['/tmp/sheepfold/log/events.log', '/tmp/sheepfold/log/events.log']
		];
		var select;

		if (!values.some(function (item) { return item[0] === currentValue; }))
			values.unshift([currentValue, currentValue]);

		select = E('select', {
			'class': 'cbi-input-select',
			'change': function (event) {
				deps.setOption('log_cache_path', event.currentTarget.value);
			}
		}, values.map(function (item) {
			return E('option', {
				'value': item[0],
				'selected': item[0] === currentValue ? 'selected' : null
			}, item[1]);
		}));

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, _('Cache file path')),
			select,
			E('small', {}, _('The cache file should be stored under /tmp/ so it does not wear router flash memory.'))
		]);
	}

	function saveSelectGlobalField(label, option, value, values, _successMessage, _errorMessage, hint) {
		var currentValue = deps.value(option, value);
		var select = E('select', {
			'class': 'cbi-input-select',
			'change': function (event) {
				deps.setOption(option, event.currentTarget.value);
			}
		}, values.map(function (item) {
			return E('option', {
				'value': item[0],
				'selected': item[0] === currentValue ? 'selected' : null
			}, item[1]);
		}));

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, label),
			select,
			hint ? E('small', {}, hint) : ''
		]);
	}

	function saveSelectSectionField(section, label, option, defaultValue, values, hint) {
		var currentValue = deps.sectionValue(section, option, defaultValue);
		var select = E('select', {
			'class': 'cbi-input-select',
			'change': function (event) {
				deps.setSectionOption(section, option, event.currentTarget.value);
			}
		}, values.map(function (item) {
			return E('option', {
				'value': item[0],
				'selected': item[0] === currentValue ? 'selected' : null
			}, item[1]);
		}));

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, label),
			select,
			hint ? E('small', {}, hint) : ''
		]);
	}

	function globalFlagOptionField(label, option, defaultValue, hint) {
		var control = deps.checkbox(label, deps.value(option, defaultValue || '0') === '1', hint, {
			'change': function (event) {
				deps.setOption(option, event.currentTarget.checked ? '1' : '0');
			}
		});

		return control.node;
	}

	function sectionFlagOptionField(section, label, option, defaultValue, hint) {
		var control = deps.checkbox(label, deps.sectionValue(section, option, defaultValue || '0') === '1', hint, {
			'change': function (event) {
				deps.setSectionOption(section, option, event.currentTarget.checked ? '1' : '0');
			}
		});

		return control.node;
	}

	function sectionInputField(section, label, option, defaultValue, placeholder, hint, secret) {
		var input = E('input', {
			'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
			'type': secret ? 'password' : 'text',
			'value': deps.sectionValue(section, option, defaultValue || ''),
			'placeholder': placeholder || ''
		});
		var fieldControl = input;
		var inputValue = function () {
			return secret ? input.value : input.value.trim();
		};

		function update() {
			deps.setSectionOption(section, option, inputValue());
		}

		input.addEventListener('input', update);
		input.addEventListener('keydown', function (event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				update();
			}
		});

		if (secret)
			fieldControl = secretControl(input);

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, label),
			fieldControl,
			hint ? E('small', {}, hint) : ''
		]);
	}

	function globalInputOptionField(label, option, defaultValue, placeholder, hint, secret) {
		var input = E('input', {
			'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
			'type': secret ? 'password' : 'text',
			'value': deps.value(option, defaultValue || ''),
			'placeholder': placeholder || ''
		});
		var fieldControl = input;

		function update() {
			deps.setOption(option, input.value.trim());
		}

		input.addEventListener('input', update);
		input.addEventListener('keydown', function (event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				update();
			}
		});

		if (secret)
			fieldControl = secretControl(input);

		return E('label', { 'class': 'sf-field sf-field-wide' }, [
			E('span', {}, label),
			fieldControl,
			hint ? E('small', {}, hint) : ''
		]);
	}

	function settingsDivider(label) {
		return E('div', { 'class': 'sf-settings-divider' }, [
			E('hr'),
			E('span', {}, label)
		]);
	}

	return {
		globalTextareaOptionField: globalTextareaOptionField,
		cachePathField: cachePathField,
		saveSelectGlobalField: saveSelectGlobalField,
		saveSelectSectionField: saveSelectSectionField,
		globalFlagOptionField: globalFlagOptionField,
		sectionFlagOptionField: sectionFlagOptionField,
		sectionInputField: sectionInputField,
		globalInputOptionField: globalInputOptionField,
		settingsDivider: settingsDivider
	};
}

return baseclass.extend({ create: create });
