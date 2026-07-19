'use strict';
/* §frontmod */
'require baseclass';
'require ui';
'require sheepfold.features.logs.model as logModel';
'require sheepfold.shared.forms as sharedForms';

function emptyFilters() {
	return {
		from: '',
		to: '',
		ip: '',
		mac: '',
		deviceName: '',
		phrase: ''
	};
}

function create(deps) {
	var entries = [];
	var filters = emptyFilters();

	function notify(message, type) {
		if (deps.notify)
			deps.notify(message, type);
	}

	function setText(text) {
		entries = logModel.parse(text);
	}

	function setEntries(nextEntries) {
		entries = Array.isArray(nextEntries) ? nextEntries.slice() : [];
	}

	function renderRows() {
		var visibleEntries = logModel.filterView(entries, filters);

		if (!visibleEntries.length)
			return [E('div', { 'class': 'sf-log-empty' }, entries.length ? _('No log entries match the current filters.') : _('Log is empty.'))];

		// Файл остаётся append-only, но интерфейс показывает последние события первыми.
		return visibleEntries.slice().reverse().map(function (entry) {
			return E('div', {}, [
				E('time', {}, entry.time),
				E('span', {}, _(entry.message))
			]);
		});
	}

	function filterControls(onChange) {
		var fromField = sharedForms.inputControl(_('From'), filters.from, { 'type': 'datetime-local' });
		var toField = sharedForms.inputControl(_('To'), filters.to, { 'type': 'datetime-local' });
		var ipField = sharedForms.inputControl(_('IP address'), filters.ip);
		var macField = sharedForms.inputControl(_('MAC address'), filters.mac);
		var deviceField = sharedForms.inputControl(_('Device name'), filters.deviceName);
		var phraseField = sharedForms.selectControl(_('Message type'), filters.phrase, logModel.phraseOptions());

		function syncFilters() {
			filters.from = fromField.input.value;
			filters.to = toField.input.value;
			filters.ip = ipField.input.value.trim();
			filters.mac = macField.input.value.trim();
			filters.deviceName = deviceField.input.value.trim();
			filters.phrase = phraseField.input.value;
			onChange();
		}

		[fromField, toField, ipField, macField, deviceField, phraseField].forEach(function (field) {
			field.input.addEventListener('change', syncFilters);
			field.input.addEventListener('input', syncFilters);
		});

		return E('div', { 'class': 'sf-log-filters' }, [
			fromField.node,
			toField.node,
			ipField.node,
			macField.node,
			deviceField.node,
			phraseField.node,
			E('div', { 'class': 'sf-log-filter-actions' }, [
				E('button', {
					'class': 'sf-action sf-action-neutral',
					'click': function (event) {
						event.preventDefault();
						filters = emptyFilters();
						fromField.input.value = '';
						toField.input.value = '';
						ipField.input.value = '';
						macField.input.value = '';
						deviceField.input.value = '';
						phraseField.input.value = '';
						onChange();
					}
				}, _('Reset filters'))
			])
		]);
	}

	function filterUi(onChange) {
		var expanded = false;
		var filtersWrap = E('div', {
			'class': 'sf-log-filters-wrap',
			'hidden': 'hidden'
		}, filterControls(onChange));
		var toggleButton = E('button', {
			'class': 'sf-action sf-action-neutral',
			'click': function (event) {
				event.preventDefault();
				expanded = !expanded;
				filtersWrap.hidden = expanded ? null : 'hidden';
				toggleButton.classList.toggle('sf-action-positive', expanded);
			}
		}, _('Filter'));

		return {
			toggleButton: toggleButton,
			filtersWrap: filtersWrap
		};
	}

	function showExportModal() {
		var periodField = sharedForms.selectControl(_('Export period'), 'week', [
			['hour', _('Last hour')],
			['week', _('Last week')],
			['custom', _('Custom period')],
			['all', _('All time')]
		]);
		var fromField = sharedForms.inputControl(_('From'), '', { 'type': 'datetime-local' });
		var toField = sharedForms.inputControl(_('To'), '', { 'type': 'datetime-local' });
		var customRange = E('div', { 'class': 'sf-grid two', 'hidden': 'hidden' }, [
			fromField.node,
			toField.node
		]);

		function updateRangeVisibility() {
			customRange.hidden = periodField.input.value === 'custom' ? null : 'hidden';
		}

		periodField.input.addEventListener('change', updateRangeVisibility);
		updateRangeVisibility();

		ui.showModal(_('Export log'), [
			E('div', { 'class': 'sf-device-editor' }, [
				periodField.node,
				customRange
			]),
			E('div', { 'class': 'right sf-modal-actions' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': function () {
						var period = periodField.input.value;
						var exportedEntries = logModel.byPeriod(entries, period, fromField.input.value, toField.input.value);
						var stamp = new Date().toISOString().replace(/[:.]/g, '-');

						if (!exportedEntries.length)
							notify(_('No log entries for selected period.'), 'warning');

						deps.download(
							'sheepfold-log-masked-' + period + '-' + stamp + '.txt',
							logModel.maskedExport(exportedEntries)
						);
						notify(_('Masked log export has been saved.'), 'info');
						ui.hideModal();
					}
				}, _('Export selected period'))
			])
		]);
	}

	function render() {
		var logNode = E('div', { 'class': 'sf-log' }, renderRows());
		var controls;

		function refresh() {
			logNode.replaceChildren.apply(logNode, renderRows());
		}

		controls = filterUi(refresh);

		return E('div', { 'class': 'sf-panel' }, [
			E('p', { 'class': 'sf-section-intro' }, _('The log is stored in RAM for fast viewing and is cleared after router reboot. When USB flash, Yandex Disk, or Google Drive is configured, events are mirrored there too. Export masks sensitive fields.')),
			E('div', { 'class': 'sf-log-toolbar-row' }, [
				controls.toggleButton,
				E('div', { 'class': 'sf-log-toolbar-actions' }, [
					E('button', {
						'class': 'sf-action sf-action-danger',
						'click': function (event) {
							var button = event.currentTarget;

							event.preventDefault();
							button.disabled = true;
							Promise.resolve().then(function () {
								return deps.clear();
							}).then(function () {
								entries = [];
								refresh();
								notify(_('Log cleared.'), 'info');
							}, function () {
								notify(_('Could not clear log.'), 'warning');
							}).then(function () {
								button.disabled = false;
							});
						}
					}, _('Clear log')),
					E('button', {
						'class': 'sf-action sf-action-neutral',
						'click': function (event) {
							event.preventDefault();
							showExportModal();
						}
					}, _('Export masked'))
				])
			]),
			controls.filtersWrap,
			logNode
		]);
	}

	return {
		setText: setText,
		setEntries: setEntries,
		render: render
	};
}

return baseclass.extend({ create: create });
