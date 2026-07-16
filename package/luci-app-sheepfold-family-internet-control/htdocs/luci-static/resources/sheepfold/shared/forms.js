'use strict';
'require baseclass';

function hintNode(hint) {
	return hint ? E('small', {}, hint) : '';
}

function field(label, value, hint) {
	return E('label', { 'class': 'sf-field' }, [
		E('span', {}, label),
		E('input', { 'class': 'cbi-input-text', 'value': value || '' }),
		hintNode(hint)
	]);
}

function selectField(label, value, values, hint) {
	return E('label', { 'class': 'sf-field' }, [
		E('span', {}, label),
		E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
			return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
		})),
		hintNode(hint)
	]);
}

function textareaField(label, value, hint) {
	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, label),
		E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || ''),
		hintNode(hint)
	]);
}

function inputControl(label, value, attrs, hint) {
	var input = E('input', Object.assign({ 'class': 'cbi-input-text', 'value': value || '' }, attrs || {}));

	return {
		input: input,
		node: E('label', { 'class': 'sf-field' }, [E('span', {}, label), input, hintNode(hint)])
	};
}

function selectControl(label, value, values, hint) {
	var input = E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
		return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
	}));

	return {
		input: input,
		node: E('label', { 'class': 'sf-field' }, [E('span', {}, label), input, hintNode(hint)])
	};
}

function checkboxControl(label, checked, hint, attrs) {
	var input = E('input', Object.assign({
		'type': 'checkbox',
		'checked': checked ? 'checked' : null
	}, attrs || {}));

	return {
		input: input,
		node: E('label', { 'class': 'sf-check-field' }, [input, E('span', {}, label), hintNode(hint)])
	};
}

return baseclass.extend({
	field: field,
	selectField: selectField,
	textareaField: textareaField,
	inputControl: inputControl,
	selectControl: selectControl,
	checkboxControl: checkboxControl
});
