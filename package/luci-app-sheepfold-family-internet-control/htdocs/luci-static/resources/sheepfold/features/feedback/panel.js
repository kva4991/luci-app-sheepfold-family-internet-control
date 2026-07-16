'use strict';
/* §feedback */
'require baseclass';
'require sheepfold.core.backend.router as routerBackend';

function field(label, input, hint) {
	return E('label', { 'class': 'sf-field sf-field-wide' }, [
		E('span', {}, label),
		input,
		hint ? E('small', {}, hint) : ''
	]);
}

function render(deps) {
	var category = E('select', { 'class': 'cbi-input-select' }, [
		['idea', _('Suggestion')],
		['bug', _('Problem or error')],
		['question', _('Question')],
		['other', _('Other')]
	].map(function (item) {
		return E('option', { 'value': item[0] }, item[1]);
	}));
	var subject = E('input', {
		'class': 'cbi-input-text',
		'type': 'text',
		'maxlength': '120',
		'placeholder': _('Short summary')
	});
	var message = E('textarea', {
		'class': 'cbi-input-textarea',
		'rows': '8',
		'maxlength': '4000',
		'placeholder': _('Describe what happened or what you suggest changing.')
	});
	var contact = E('input', {
		'class': 'cbi-input-text',
		'type': 'text',
		'maxlength': '200',
		'placeholder': _('Optional email or messenger contact')
	});
	var diagnostics = E('input', { 'type': 'checkbox' });
	var status = E('div', { 'class': 'sf-note' }, _('Checking whether feedback sending is configured...'));
	var submit = E('button', {
		'class': 'sf-action sf-action-positive',
		'disabled': 'disabled',
		'click': function (event) {
			var button = event.currentTarget;
			var subjectValue = subject.value.trim();
			var messageValue = message.value.trim();

			event.preventDefault();
			if (!subjectValue || subjectValue.length > 120) {
				deps.notify(_('Enter a subject up to 120 characters.'), 'warning');
				return;
			}
			if (messageValue.length < 10 || messageValue.length > 4000) {
				deps.notify(_('The message must contain from 10 to 4000 characters.'), 'warning');
				return;
			}

			button.disabled = true;
			button.textContent = _('Sending...');
			routerBackend.withTimeout([
				'feedback-submit', 'luci', category.value, subjectValue, messageValue,
				contact.value.trim(), diagnostics.checked ? '1' : '0'
			], 35000, _('The feedback service did not respond in time.')).then(function () {
				message.value = '';
				subject.value = '';
				deps.notify(_('Thank you. Your message was sent to the Sheepfold developer.'), 'info');
			}, function (error) {
				deps.notify(deps.errorText(error, _('Could not send the message. Try again later.')), 'warning');
			}).finally(function () {
				button.disabled = false;
				button.textContent = _('Send message');
			});
		}
	}, _('Send message'));

	routerBackend.run(['feedback-status']).then(function (result) {
		var values = routerBackend.parseKeyValues(result.stdout || '');
		if (values.configured === '1') {
			status.className = 'sf-note sf-status-ok';
			status.textContent = _('Feedback sending is available.');
			submit.disabled = false;
		} else {
			status.className = 'sf-note sf-status-warning';
			status.textContent = _('Feedback sending has not been configured by the project owner yet.');
		}
	}, function () {
		status.className = 'sf-note sf-status-warning';
		status.textContent = _('Could not check the feedback service status.');
	});

	return E('div', { 'class': 'sf-flat-form sf-feedback-form' }, [
		E('p', { 'class': 'sf-section-intro' },
			_('Tell the developer about a problem or suggest an improvement. Along with the form fields, the router sends the Sheepfold version and a random installation identifier that is not based on device data.')),
		status,
		field(_('Message type'), category),
		field(_('Subject'), subject),
		field(_('Message'), message),
		field(_('Contact for reply'), contact,
			_('Optional. Leave empty if you do not need a reply. This value will be stored with the message in Yandex Cloud.')),
		E('label', { 'class': 'sf-checkbox-line' }, [
			diagnostics,
			E('span', {}, _('Attach a diagnostic report (recommended for a problem): router and network status, versions, resources, safe Sheepfold settings, and counts of devices and rules. Passwords, tokens, MAC/IP addresses, names, SSIDs, logs, and browsing history are never attached.'))
		]),
		submit
	]);
}

return baseclass.extend({ render: render });
