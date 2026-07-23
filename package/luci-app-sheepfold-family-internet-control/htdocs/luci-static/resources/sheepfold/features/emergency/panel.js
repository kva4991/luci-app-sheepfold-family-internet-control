'use strict';
'require baseclass';
'require ui';

/* §frontmod §overviewcut1 §emerg1
 * Emergency-site presentation owns its local editable collection, CRUD dialogs and
 * settings-saver registration. Persistence/runtime are explicit dependencies; the
 * main view no longer carries this feature's mutable arrays or DOM helpers.
 */
function create(deps) {
	var sites = [];
	var saved = [];

	function clone(value) {
		return deps.model.clone(value || []);
	}

	function load(sections, renderNow) {
		sites = deps.model.fromSections(sections || []);
		saved = clone(sites);
		if (renderNow)
			renderList();
		return sites;
	}

	function changed() {
		return !deps.model.same(sites, saved);
	}

	function accept() {
		saved = clone(sites);
	}

	function registerSaver() {
		deps.registerSaver({
			isChanged: changed,
			save: function () {
				return deps.persistence.mutate(['sheepfold'], function () {
					sites = deps.model.stage(deps.uci, 'sheepfold', sites);
					return clone(sites);
				}).then(function () {
					return deps.run(['emergency-sites-apply']).then(function (result) {
						return deps.ensureOk(result, deps.runtimeError());
					}, function (error) {
						error.persisted = true;
						error.runtimeApplied = false;
						throw error;
					});
				}).catch(function (error) {
					if (!error || typeof error !== 'object') {
						var normalized = new Error(String(error == null ? 'emergency_sites_failed' : error));
						normalized.cause = error;
						error = normalized;
					}
					if (!error.persisted && error.result) {
						error.persisted = true;
						error.runtimeApplied = false;
					}
					throw error;
				});
			},
			accept: accept
		});
	}

	function inputField(label, value) {
		var input = E('input', { 'class': 'cbi-input-text', 'value': value || '' });
		return {
			input: input,
			node: E('label', { 'class': 'sf-field' }, [E('span', {}, label), input])
		};
	}

	function textareaField(label, value) {
		var input = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || '');
		return {
			input: input,
			node: E('label', { 'class': 'sf-field sf-field-wide' }, [E('span', {}, label), input])
		};
	}

	function renderList() {
		document.querySelectorAll('.sf-domain-list').forEach(function (node) {
			node.replaceChildren.apply(node, sites.map(card));
		});
	}

	function prepareChanged(message) {
		renderList();
		deps.markChanged();
		deps.notify(message, 'info');
		ui.hideModal();
	}

	function showEditor(site) {
		var isEdit = !!site;
		var current = site || ['', '', ''];
		var urlField = inputField(_('URL address'), current[0]);
		var nameField = inputField(_('Name'), current[1]);
		var descriptionField = textareaField(_('Description'), current[2]);

		ui.showModal(isEdit ? _('Edit site') : _('Add site'), [
			E('div', { 'class': 'sf-site-modal' }, [
				urlField.node,
				nameField.node,
				descriptionField.node,
				E('div', { 'class': 'sf-note sf-note-warning' },
					_('Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.'))
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': function () {
						var url = deps.model.normalizeDomain(urlField.input.value);
						var name = nameField.input.value.trim();
						var description = descriptionField.input.value.trim();

						if (!url) {
							deps.notify(_('Enter a valid domain name, for example gosuslugi.ru.'), 'warning');
							return;
						}
						if (sites.some(function (candidate) {
							return candidate !== site && candidate[0] === url;
						})) {
							deps.notify(_('This domain is already in the emergency-useful sites list.'), 'warning');
							return;
						}

						if (isEdit) {
							site[0] = url;
							site[1] = name;
							site[2] = description;
							// A manual edit transfers ownership from the country profile to the family.
							site[4] = '';
							site[5] = '';
							site[6] = '';
						} else {
							sites.push([url, name, description, '', '', '', '']);
						}
						prepareChanged(_('Site prepared. Press Save settings to apply it.'));
					}
				}, _('Save'))
			])
		]);
	}

	function remove(site) {
		var index = sites.indexOf(site);
		if (index === -1)
			return;
		sites.splice(index, 1);
		prepareChanged(_('Site removal prepared. Press Save settings to apply it.'));
	}

	function showDelete(site) {
		ui.showModal(_('Delete site'), [
			E('div', { 'class': 'sf-site-modal' }, [
				E('p', {}, _('Delete this site?')),
				E('strong', {}, site[0]),
				E('small', {}, _('This site will be removed from the emergency-useful list.'))
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-negative',
					'click': function () { remove(site); }
				}, _('Delete'))
			])
		]);
	}

	function card(site) {
		return E('div', { 'class': 'sf-domain' }, [
			E('div', { 'class': 'sf-domain-actions sf-domain-actions-top' }, [
				deps.iconButton(_('Edit site'), 'gear', 'neutral', function () { showEditor(site); })
			]),
			E('strong', {}, site[0]),
			E('span', {}, site[1]),
			E('small', {}, site[2]),
			E('div', { 'class': 'sf-domain-actions sf-domain-actions-bottom' }, [
				deps.iconButton(_('Delete site'), 'trash', 'danger', function () { showDelete(site); })
			])
		]);
	}

	function render() {
		registerSaver();
		return E('div', { 'class': 'sf-settings-section' }, [
			E('div', { 'class': 'sf-panel-head' }, [
				E('div', {}, [
					E('p', { 'class': 'sf-section-intro' },
						_('Emergency-useful sites are a small editable list of necessary services that may stay available during restricted access.'))
				]),
				E('button', {
					'class': 'sf-action sf-action-positive',
					'click': function (event) {
						event.preventDefault();
						showEditor();
					}
				}, _('Add site'))
			]),
			E('div', { 'class': 'sf-domain-list' }, sites.map(card)),
			E('div', { 'class': 'sf-note' },
				_('Some services load maps, sign-in pages, or images from additional technical domains. If a site opens incompletely, add only the domains required for its useful function.'))
		]);
	}

	return {
		load: load,
		changed: changed,
		accept: accept,
		render: render,
		renderList: renderList,
		sites: function () { return clone(sites); }
	};
}

return baseclass.extend({ create: create });
