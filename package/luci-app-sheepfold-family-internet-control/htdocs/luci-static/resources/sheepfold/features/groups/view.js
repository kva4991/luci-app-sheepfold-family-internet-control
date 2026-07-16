'use strict';
'require baseclass';

function render(deps, embedded) {
	var grouped = {};
	var groupSections = {};
	var usedColors = {};
	var root;

	deps.sections().forEach(function (section) {
		var name = deps.normalize(section.name);
		if (name && !grouped[name]) grouped[name] = [];
		if (name) groupSections[name] = section;
	});

	deps.ensureDefaults(grouped, groupSections);
	deps.devices.forEach(function (device) {
		var name;
		if (!device.group) return;
		name = deps.normalize(device.group);
		if (!grouped[name]) grouped[name] = [];
		grouped[name].push(device);
	});
	deps.supplement(grouped);

	var names = Object.keys(grouped).sort(function (left, right) { return left.localeCompare(right); });

	function refresh() {
		var replacement = render(deps, embedded);

		if (root && root.parentNode)
			root.replaceWith(replacement);
	}

	function removeGroup(name) {
		var section = groupSections[name];
		var sectionName = section && section['.name'];
		var reason = deps.deletionBlockReason({
			protectedGroup: section && section.protected === '1',
			noRestrictionsGroup: deps.normalize(name) === deps.noRestrictionsName(),
			deviceCount: grouped[name] ? grouped[name].length : 0,
			hasSection: !!sectionName
		});

		if (reason === 'protected') {
			deps.notify(_('Protected group cannot be deleted.'), 'warning');
			return;
		}
		if (reason === 'assigned') {
			deps.notify(_('This group cannot be deleted while devices are assigned to it.'), 'warning');
			return;
		}
		if (reason === 'missing-section') {
			deps.notify(_('Could not delete group.'), 'warning');
			return;
		}
		if (!window.confirm(_('Delete group') + ': ' + name + '?')) return;

		deps.removeSection(sectionName);
		deps.save().then(function () {
			deps.notify(_('Group deleted.'), 'info');
			refresh();
		}, function () { deps.notify(_('Could not delete group.'), 'warning'); });
	}

	function cardColor(name, section) {
		var color = section && deps.validColor(section.color) ? section.color : '';
		var palette = deps.palette();

		if (!color) {
			palette.some(function (candidate) {
				if (usedColors[candidate.toLowerCase()]) return false;
				color = candidate;
				return true;
			});
		}
		color = color || deps.automaticColor(name);
		usedColors[color.toLowerCase()] = true;
		return color;
	}

	function card(name) {
		var section = groupSections[name];
		var groupDevices = grouped[name] || [];
		var visible = groupDevices.slice(0, 5);
		var hiddenCount = Math.max(0, groupDevices.length - visible.length);

		return E('div', { 'class': 'sf-box sf-group-box', 'style': 'background-color: ' + cardColor(name, section) + ';' }, [
			E('div', { 'class': 'sf-group-head' }, [
				E('div', {}, [E('h4', { 'class': 'sf-group-title' }, deps.displayName(name)), E('strong', { 'class': 'sf-group-count' }, groupDevices.length + ' ' + _('Devices'))]),
				E('div', { 'class': 'sf-row-actions' }, [
					deps.iconButton(_('Configure group'), 'gear', 'neutral', function () { deps.configure(name, section, refresh); }),
					deps.iconButton(_('Delete group'), 'trash', 'danger', function () { removeGroup(name); })
				])
			]),
			visible.length ? E('div', { 'class': 'sf-group-device-list' }, visible.map(function (device) {
				return E('div', {}, [E('span', { 'class': 'sf-device-index' }, deps.deviceId(device)), E('span', {}, device.name)]);
			}).concat(hiddenCount ? [E('div', { 'class': 'sf-group-device-more' }, '+ ' + hiddenCount + ' ' + _('more devices hidden'))] : [])) :
				E('div', { 'class': 'sf-muted' }, _('No devices'))
		]);
	}

	root = E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
		E('div', { 'class': 'sf-panel-head' }, [
			E('div', {}, E('p', {}, _('Groups collect devices so schedules and access rules can be applied to several devices at once.'))),
			E('button', {
				'class': 'sf-action sf-action-positive sf-action-nowrap',
				'click': function (event) {
					var existing = {};
					event.preventDefault();
					names.forEach(function (name) { existing[name] = true; });
					deps.add(existing, refresh);
				}
			}, _('Add group'))
		]),
		names.length ? E('div', { 'class': 'sf-grid two' }, names.map(card)) : E('div', { 'class': 'sf-note sf-note-warning' }, _('No groups yet. Assign devices to groups in device settings.'))
	]);

	return root;
}

return baseclass.extend({ render: render });
