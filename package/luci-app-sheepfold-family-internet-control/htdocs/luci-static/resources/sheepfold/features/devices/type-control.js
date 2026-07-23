'use strict';
'require baseclass';

/* §frontmod §settingview1
 * Визуальный выбор типа устройства не читает UCI и не сохраняет настройки. Он
 * возвращает обычные input/node, а предметный редактор решает, когда их применить.
 */
function create(deps) {
	function field(label, value, hint) {
		var selected = deps.byValue(value);
		var input = E('input', {
			'type': 'hidden',
			'value': selected.value
		});
		var currentIcon = E('span', { 'class': 'sf-device-type-select-icon' }, [
			deps.icon(selected.value)
		]);
		var currentLabel = E('span', { 'class': 'sf-device-type-select-label' }, selected.label);
		var root;
		var menu;
		var closeOnOutsideClick = function (event) {
			if (root && !root.contains(event.target))
				setOpen(false);
		};
		var closeOnEscape = function (event) {
			if (event.key === 'Escape')
				setOpen(false);
		};
		var toggle = E('button', {
			'class': 'sf-device-type-select-button',
			'type': 'button',
			'aria-haspopup': 'listbox',
			'aria-expanded': 'false',
			'click': function (event) {
				event.preventDefault();
				event.stopPropagation();
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
			currentIcon.replaceChildren(deps.icon(item.value));
			currentLabel.textContent = item.label;
			setOpen(false);
		}

		menu = E('div', {
			'class': 'sf-device-type-select-menu',
			'role': 'listbox',
			'hidden': 'hidden'
		}, deps.definitions().map(function (item) {
			return E('button', {
				'class': 'sf-device-type-select-option' + (item.value === selected.value ? ' is-selected' : ''),
				'type': 'button',
				'role': 'option',
				'aria-selected': item.value === selected.value ? 'true' : 'false',
				'click': function (event) {
					event.preventDefault();
					event.stopPropagation();
					Array.prototype.forEach.call(menu.querySelectorAll('.sf-device-type-select-option'), function (button) {
						button.classList.remove('is-selected');
						button.setAttribute('aria-selected', 'false');
					});
					event.currentTarget.classList.add('is-selected');
					event.currentTarget.setAttribute('aria-selected', 'true');
					chooseType(item);
				}
			}, [
				deps.icon(item.value),
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

	return { field: field };
}

return baseclass.extend({ create: create });
