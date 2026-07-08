#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERVIEW = ROOT / "package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js"
CSS = ROOT / "package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css"
CLASSIFIER = ROOT / "package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-classifier"
DETECTOR = ROOT / "package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector"
RECLASSIFY = ROOT / "package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-reclassify"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


text = OVERVIEW.read_text(encoding="utf-8")

translation_anchor = "        'Detection confidence': 'Уверенность автоопределения',\n"
translation_addition = translation_anchor + """        'Type confidence': 'Уверенность типа',
        'Auto-trust score': 'Балл автодоверия',
        'Evidence sources': 'Источники доказательств',
        'Hard deny': 'Жёсткий запрет',
        'MAC manufacturer': 'Производитель MAC',
        'Detected mDNS services': 'Обнаруженные mDNS-сервисы',
        'Detection details': 'Данные автоопределения',
        'Detection reason': 'Причина определения',
        'Online status': 'онлайн',
        'Now (seen within the last 15 minutes)': 'сейчас (в последние 15 мин)',
        'Was online at': 'был',
        'Never seen online': 'ещё не был замечен онлайн',
        'Detect again': 'Определить заново',
        'Device reclassified.': 'Устройство определено заново.',
        'Could not reclassify device.': 'Не удалось определить устройство заново.',
"""
text = replace_once(text, translation_anchor, translation_addition, "translations")

badge_old = """                restricted: T('Restricted'),
                new: T('New'),
                journal: T('Journal')
"""
badge_new = """                restricted: T('Restricted'),
                new: T('New'),
                journal: T('Journal'),
                online: T('Online')
"""
text = replace_once(text, badge_old, badge_new, "online badge label")

parse_anchor = """        return values;
}

function commandErrorText(error, fallback) {
"""
parse_insert = """        return values;
}

function parseDevicePresenceOutput(text) {
        var result = {};

        String(text || '').split(/\\r?\\n/).forEach(function (line) {
                var fields = line.split('\\t');
                var mac;
                var lastSeen;

                if (fields.length < 3)
                        return;

                mac = normalizeMac(fields[0]);
                if (!mac)
                        return;

                lastSeen = parseInt(fields[1], 10);
                result[mac] = {
                        lastSeenEpoch: isNaN(lastSeen) ? 0 : lastSeen,
                        online: fields[2] === '1',
                        ip: fields[3] || ''
                };
        });

        return result;
}

function applyDevicePresence(rows, presenceByMac) {
        rows.forEach(function (device) {
                var presence = presenceByMac[normalizeMac(device.mac)];

                if (!presence)
                        return;

                device.lastSeenEpoch = presence.lastSeenEpoch;
                device.online = presence.online;
                if (!device.ip && presence.ip)
                        device.ip = presence.ip;
        });

        return rows;
}

function padDatePart(value) {
        return String(value).padStart(2, '0');
}

function formatDeviceSeenTime(epochSeconds) {
        var date = new Date(Number(epochSeconds || 0) * 1000);

        if (!epochSeconds || isNaN(date.getTime()))
                return '-';

        return padDatePart(date.getDate()) + '.' +
                padDatePart(date.getMonth() + 1) + '.' +
                date.getFullYear() + ' ' +
                padDatePart(date.getHours()) + ':' +
                padDatePart(date.getMinutes());
}

function devicePresenceText(device) {
        if (device && device.online)
                return T('Now (seen within the last 15 minutes)');

        if (device && device.lastSeenEpoch)
                return T('Was online at') + ' ' + formatDeviceSeenTime(device.lastSeenEpoch);

        return T('Never seen online');
}

function detectionEvidenceText(value) {
        var labels = {
                name: 'имя/hostname',
                owner_configured: 'настройки владельца',
                dhcp: 'DHCP',
                oui: 'MAC/OUI',
                mdns: 'mDNS',
                ports: 'открытые порты'
        };
        var values = String(value || '').split(',').map(function (item) {
                item = item.trim();
                return labels[item] || item;
        }).filter(Boolean);

        return values.length ? values.join(', ') : '-';
}

function commaSeparatedText(value) {
        var values = String(value || '').split(',').map(function (item) {
                return item.trim();
        }).filter(Boolean);

        return values.length ? values.join(', ') : '-';
}

function reclassifyDevice(device, button) {
        button.disabled = true;

        routerControl(['device-reclassify', device.mac]).then(function () {
                notify(T('Device reclassified.'), 'info');
                window.setTimeout(function () {
                        window.location.reload();
                }, 500);
        }, function (error) {
                notify(commandErrorText(error, T('Could not reclassify device.')), 'warning');
                button.disabled = false;
        });
}

function commandErrorText(error, fallback) {
"""
text = replace_once(text, parse_anchor, parse_insert, "presence helpers")

configured_anchor = """function sheepfoldListMacs(listName) {
"""
configured_insert = """function addConfiguredSheepfoldDevices(map, configuredByMac) {
        Object.keys(configuredByMac).forEach(function (mac) {
                var configured = configuredByMac[mac];
                var current = map[mac] || {
                        mac: mac,
                        sources: {}
                };

                if (!current.ip && configured.ip)
                        current.ip = configured.ip;
                if (!current.hostname && configured.name)
                        current.hostname = configured.name;

                map[mac] = current;
        });
}

function sheepfoldListMacs(listName) {
"""
text = replace_once(text, configured_anchor, configured_insert, "configured offline devices")

note_old = """        if (configured && configured.detection_reason) {
                var confidence = configured.detection_confidence ?
                        ' (' + T('Detection confidence') + ': ' + configured.detection_confidence + '%)' :
                        '';

                return T('Auto-detected') + ': ' + configured.detection_reason + confidence;
        }

"""
text = replace_once(text, note_old, "", "remove detection details from table row")

configured_call_old = """        configuredByMac = sheepfoldDeviceConfigByMac();
        allowlist = sheepfoldListMacs('allowlist');
"""
configured_call_new = """        configuredByMac = sheepfoldDeviceConfigByMac();
        addConfiguredSheepfoldDevices(map, configuredByMac);
        allowlist = sheepfoldListMacs('allowlist');
"""
text = replace_once(text, configured_call_old, configured_call_new, "include configured devices")

build_sort_old = """                var leftOnline = leftDevice.sources.dhcp || leftDevice.sources.arp ? 1 : 0;
                var rightOnline = rightDevice.sources.dhcp || rightDevice.sources.arp ? 1 : 0;
                var leftName = leftDevice.staticName || leftDevice.hostname || left;
                var rightName = rightDevice.staticName || rightDevice.hostname || right;

                if (leftOnline !== rightOnline)
                        return rightOnline - leftOnline;

                return leftName.localeCompare(rightName);
"""
build_sort_new = """                var leftOnline = leftDevice.sources.dhcp || leftDevice.sources.arp ? 1 : 0;
                var rightOnline = rightDevice.sources.dhcp || rightDevice.sources.arp ? 1 : 0;
                var leftIp = ipSortValue(leftDevice.ip || leftDevice.staticIp);
                var rightIp = ipSortValue(rightDevice.ip || rightDevice.staticIp);

                if (leftOnline !== rightOnline)
                        return rightOnline - leftOnline;

                if (leftIp < 0)
                        leftIp = Number.MAX_SAFE_INTEGER;
                if (rightIp < 0)
                        rightIp = Number.MAX_SAFE_INTEGER;
                if (leftIp !== rightIp)
                        return leftIp - rightIp;

                return left.localeCompare(right);
"""
text = replace_once(text, build_sort_old, build_sort_new, "default device sorting")

fields_old = """                        detectionConfidence: configured && configured.detection_confidence,
                        detectionReason: configured && configured.detection_reason,
                        autoGroupAssigned: configured && configured.auto_group_assigned === '1',
"""
fields_new = """                        detectionConfidence: configured && configured.detection_confidence,
                        detectionReason: configured && configured.detection_reason,
                        detectionAutoGroupScore: configured && configured.detection_auto_group_score,
                        detectionEvidence: configured && configured.detection_evidence,
                        detectionHardDeny: configured && configured.detection_hard_deny === '1',
                        detectionOuiVendor: configured && configured.detection_oui_vendor,
                        detectionMdnsServices: configured && configured.detection_mdns_services,
                        autoGroupAssigned: configured && configured.auto_group_assigned === '1',
"""
text = replace_once(text, fields_old, fields_new, "detection metadata fields")

status_old = """                        status: status,
                        note: routerDeviceNote(item, configured),
"""
status_new = """                        status: status,
                        online: !!(item.sources.dhcp || item.sources.arp),
                        lastSeenEpoch: item.sources.dhcp || item.sources.arp ? Math.floor(Date.now() / 1000) : 0,
                        note: routerDeviceNote(item, configured),
"""
text = replace_once(text, status_old, status_new, "initial online state")

load_read_old = """                                fs.read(logCachePath()).catch(function () {
                                        return '';
                                })
"""
load_read_new = """                                fs.read(logCachePath()).catch(function () {
                                        return '';
                                }),
                                routerControl(['device-presence', 'list']).catch(function () {
                                        return { stdout: '' };
                                })
"""
text = replace_once(text, load_read_old, load_read_new, "load presence data")

load_apply_old = """                        devices = buildRouterDevices(results[0], results[1]);
                        logEntries = parseRamLog(results[2]);
"""
load_apply_new = """                        devices = applyDevicePresence(
                                buildRouterDevices(results[0], results[1]),
                                parseDevicePresenceOutput(results[3] && results[3].stdout || '')
                        );
                        logEntries = parseRamLog(results[2]);
"""
text = replace_once(text, load_apply_old, load_apply_new, "apply presence data")

modal_info_old = """        var infoLines = E('div', { 'class': 'sf-device-info-lines' }, [
                settingLine(T('ID'), formattedDeviceDisplayId(device)),
                settingLine(T('MAC address'), device.mac),
                settingLine(T('Hostname'), device.hostname || '-'),
                settingLine(T('Detection source'), device.sourceLabel || '-')
        ]);
"""
modal_info_new = """        var infoLines = E('div', { 'class': 'sf-device-info-lines' }, [
                settingLine(T('ID'), formattedDeviceDisplayId(device)),
                settingLine(T('MAC address'), device.mac),
                settingLine(T('Hostname'), device.hostname || '-')
        ]);
        var detectionDetails = E('div', { 'class': 'sf-device-detection-details' }, [
                E('h4', {}, T('Detection details')),
                settingLine(T('Detection source'), device.sourceLabel || '-'),
                settingLine(T('Detection reason'), device.detectionReason || '-'),
                settingLine(T('Type confidence'), device.detectionConfidence ? device.detectionConfidence + '%' : '-'),
                settingLine(T('Auto-trust score'), device.detectionAutoGroupScore || '0'),
                settingLine(T('Evidence sources'), detectionEvidenceText(device.detectionEvidence)),
                settingLine(T('Hard deny'), device.detectionHardDeny ? T('Yes') : T('No')),
                settingLine(T('MAC manufacturer'), device.detectionOuiVendor || '-'),
                settingLine(T('Detected mDNS services'), commaSeparatedText(device.detectionMdnsServices))
        ]);
        var presenceLine = E('div', { 'class': 'sf-device-presence-line' }, [
                E('strong', {}, T('Online status') + ':'),
                E('span', {}, devicePresenceText(device))
        ]);
        var reclassifyButton = E('button', {
                'class': 'sf-action sf-action-neutral',
                'click': function (ev) {
                        ev.preventDefault();
                        reclassifyDevice(device, ev.currentTarget);
                }
        }, T('Detect again'));
"""
text = replace_once(text, modal_info_old, modal_info_new, "device modal diagnostics")

modal_grid_old = """                                staticLeaseField.node,
                                activityLogField.node
                        ])
                ]),
"""
modal_grid_new = """                                staticLeaseField.node,
                                activityLogField.node
                        ]),
                        detectionDetails,
                        E('div', { 'class': 'sf-device-presence-actions' }, [
                                presenceLine,
                                reclassifyButton
                        ])
                ]),
"""
text = replace_once(text, modal_grid_old, modal_grid_new, "modal bottom details")

function_anchor = """function deviceTable(rows, options) {
        options = options || {};

        var tableRows = rows.map(function (device, index) {
"""
function_insert = """function compareDevicesByPresenceAndIp(left, right) {
        var leftOnline = left && left.online ? 1 : 0;
        var rightOnline = right && right.online ? 1 : 0;
        var leftIp = ipSortValue(left && left.ip);
        var rightIp = ipSortValue(right && right.ip);

        if (leftOnline !== rightOnline)
                return rightOnline - leftOnline;

        if (leftIp < 0)
                leftIp = Number.MAX_SAFE_INTEGER;
        if (rightIp < 0)
                rightIp = Number.MAX_SAFE_INTEGER;
        if (leftIp !== rightIp)
                return leftIp - rightIp;

        return String(left && left.mac || '').localeCompare(String(right && right.mac || ''));
}

function deviceTable(rows, options) {
        options = options || {};

        var sortedRows = rows.slice().sort(compareDevicesByPresenceAndIp);
        var tableRows = sortedRows.map(function (device, index) {
"""
text = replace_once(text, function_anchor, function_insert, "presence-first table sorting")

status_stack_old = """                        E('div', { 'class': 'sf-status-stack' }, [
                                badge(device.status),
                                device.activityLogEnabled ? badge('journal') : ''
                        ]),
"""
status_stack_new = """                        E('div', { 'class': 'sf-status-stack' }, [
                                badge(device.status),
                                device.activityLogEnabled ? badge('journal') : '',
                                device.online ? badge('online') : ''
                        ]),
"""
text = replace_once(text, status_stack_old, status_stack_new, "online badge row")

OVERVIEW.write_text(text, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
css_marker = "/* Device presence and detection details */"
if css_marker not in css:
    css += """

/* Device presence and detection details */
.sf-badge-online {
        background: #d9f1ff;
        border: 1px solid #b6ddec;
        color: #111;
        font-size: .72rem;
        font-weight: 600;
        line-height: 1.2;
        padding: .18rem .42rem;
}

.sf-device-detection-details {
        border-top: 1px solid rgba(0, 0, 0, .12);
        display: grid;
        gap: .45rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 1rem;
        padding-top: 1rem;
}

.sf-device-detection-details h4 {
        grid-column: 1 / -1;
        margin: 0 0 .25rem;
}

.sf-device-detection-details .sf-setting-line {
        min-width: 0;
}

.sf-device-detection-details code {
        overflow-wrap: anywhere;
        white-space: normal;
}

.sf-device-presence-actions {
        align-items: flex-start;
        display: flex;
        flex-direction: column;
        gap: .55rem;
        margin-top: 1rem;
        text-align: left;
}

.sf-device-presence-line {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: .35rem;
        font-size: .82rem;
}

@media (max-width: 700px) {
        .sf-device-detection-details {
                grid-template-columns: 1fr;
        }
}
"""
CSS.write_text(css, encoding="utf-8")

classifier = CLASSIFIER.read_text(encoding="utf-8")
classifier = replace_once(classifier, 'POLICY_VERSION="2"', 'POLICY_VERSION="3"', "classifier policy")
classifier = replace_once(
    classifier,
    "server|engineering|camera|smart_home|vacuum|speaker) return 0 ;;",
    "server|engineering|camera|smart_home|vacuum|speaker|printer) return 0 ;;","
    "printer eligible type",
)
classifier = replace_once(
    classifier,
    "network|phone|tablet|computer|tv|console|printer) return 0 ;;",
    "network|phone|tablet|computer|tv|console) return 0 ;;","
    "printer interactive type",
)
classifier = replace_once(
    classifier,
    """        REASON="printer mDNS service"
        HARD_DENY=1
        add_evidence mdns 0
""",
    """        REASON="printer mDNS service"
        # Принтерный сервис подтверждает тип устройства, но не является причиной
        # запрещать доверенную автонастройку. Для неё всё равно нужны два семейства признаков.
        add_evidence mdns 45
""",
    "printer mDNS evidence",
)
classifier = replace_once(
    classifier,
    """        REASON="printer service is open"
        add_evidence ports 0
        HARD_DENY=1
""",
    """        REASON="printer service is open"
        # IPP/JetDirect подтверждают принтер, а не интерактивное пользовательское устройство.
        add_evidence ports 45
""",
    "printer port evidence",
)
CLASSIFIER.write_text(classifier, encoding="utf-8")

detector = DETECTOR.read_text(encoding="utf-8")
detector = replace_once(detector, 'POLICY_VERSION="2"', 'POLICY_VERSION="3"', "detector policy")
DETECTOR.write_text(detector, encoding="utf-8")

reclassify = RECLASSIFY.read_text(encoding="utf-8")
manual_lock = """[ "$(uci -q get "sheepfold.$section.manual_device_type" 2>/dev/null || printf 0)" != "1" ] || {
        echo "manual_device_type_locked" >&2
        exit 4
}

"""
reclassify = replace_once(reclassify, manual_lock, "", "remove manual reclassify lock")
lock_anchor = """acquire_lock || exit 5

for option in \\
"""
lock_insert = """acquire_lock || exit 5

# Кнопка «Определить заново» является явным решением владельца снять ручную фиксацию
# и снова доверить тип детектору.
uci -q set "sheepfold.$section.manual_device_type=0"
uci -q delete "sheepfold.$section.device_type" 2>/dev/null || true

for option in \\
"""
reclassify = replace_once(reclassify, lock_anchor, lock_insert, "reset manual type on reclassify")
RECLASSIFY.write_text(reclassify, encoding="utf-8")

print("Device presence, diagnostics modal, reclassification button, and printer policy updated.")
