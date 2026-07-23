'use strict';
'require baseclass';

/* §frontmod §settingview1
 * Вкладка Storage собирает существующие элементы управления хранилищем и общие
 * поля настроек. Она самостоятельно не читает UCI и ничего не сохраняет.
 */
function create(deps) {
	function render() {
		return E('div', { 'class': 'sf-flat-form' }, [
			E('p', { 'class': 'sf-note' },
				_('Store journals in RAM to protect router flash memory. USB, Yandex Disk, or Google Drive can archive rotated logs and configuration backups when configured.')),
			deps.storagePanel(),
			deps.fields.cachePathField(),
			deps.fields.saveSelectGlobalField(_('Log retention on router'), 'log_retention', '3d', [
				['1d', _('1 day')],
				['3d', _('3 days')],
				['7d', _('7 days')],
				['14d', _('14 days')],
				['30d', _('30 days')]
			]),
			deps.fields.saveSelectGlobalField(_('Known offline devices cleanup'), 'offline_device_retention_days', '90', [
				['30', _('30 days')],
				['90', _('90 days')],
				['180', _('180 days')]
			]),
			deps.fields.settingsDivider(_('USB flash settings')),
			deps.fields.sectionFlagOptionField('usb', _('Use USB flash for Sheepfold'), 'enabled', '0'),
			deps.fields.sectionInputField(
				'usb',
				_('USB partition device path'),
				'device',
				'',
				'/dev/sda1',
				_('Example: /dev/sda1. Sheepfold accepts only explicitly confirmed removable devices.')
			),
			deps.fields.saveSelectSectionField('usb', _('USB role'), 'role', 'logs_only', [
				['logs_only', _('Logs only')],
				['swap_logs', _('Swap and logs')]
			], _('Automatic extroot from USB is disabled for safety. Only log archive roles are supported in this version.')),
			deps.fields.sectionFlagOptionField('usb', _('Encrypt USB archive'), 'encrypt', '1')
		]);
	}

	return { render: render };
}

return baseclass.extend({ create: create });
