import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);
const classifierPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-classifier',
);
const ouiOverridesPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/device-oui-overrides',
);
const reclassifyPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-reclassify',
);
const servicePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
);
const hardeningPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-runtime-hardening',
);
const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function createSignal(fields) {
  const directory = mkdtempSync(join(tmpdir(), 'sheepfold-signals-'));
  const file = join(directory, 'device.dhcp');
  const content = Object.entries(fields)
    .map(([key, value]) => `${key}\t${value}`)
    .join('\n');

  temporaryDirectories.push(directory);
  writeFileSync(file, `${content}\n`, 'utf8');
  return file;
}

function classify({
  name,
  ports = '',
  staticName = '',
  signalFile = '',
  mac = '00:11:22:33:44:55',
  mdnsServices = '',
  mdnsProfile = '',
  ssdpProfile = '',
  wsdProfile = '',
  wifiProfile = '',
}) {
  const result = spawnSync(
    'sh',
    [classifierPath, name, ports, staticName, signalFile, mac, mdnsServices, mdnsProfile, ssdpProfile, wsdProfile, wifiProfile],
    {
      encoding: 'utf8',
      env: { ...process.env, SHEEPFOLD_OUI_OVERRIDES: ouiOverridesPath },
    },
  );

  assert.equal(result.status, 0, result.stderr || `Не удалось классифицировать ${name}`);
  const [
    type,
    confidence,
    targetGroup,
    reason,
    autoScore,
    evidence,
    evidenceCount,
    hardDeny,
    policyVersion,
    ouiVendor,
	competingEvidence,
  ] = result.stdout.trimEnd().split('\t');

  return {
    type,
    confidence: Number(confidence),
    targetGroup,
    reason,
    autoScore: Number(autoScore),
    evidence: evidence ? evidence.split(',') : [],
    evidenceCount: Number(evidenceCount),
    hardDeny: hardDeny === '1',
    policyVersion,
    ouiVendor,
	competingEvidence: competingEvidence ? competingEvidence.split(',') : [],
  };
}

function isAutoAssignable(device, threshold = 80) {
  return !device.hardDeny
    && device.targetGroup === 'Без ограничений'
    && device.autoScore >= threshold
    && device.evidenceCount >= 2;
}

function functionBody(source, name, nextName) {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`\n${nextName}() {`, start);

  assert.notEqual(start, -1, `Не найдена функция ${name}`);
  assert.notEqual(end, -1, `Не найден конец функции ${name}`);
  return source.slice(start, end);
}

describe('Безопасное автоназначение устройств', () => {
  it('проверка списков доступа не подменяет секцию обнаруженного устройства', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const classifier = readFileSync(classifierPath, 'utf8');
    const scriptDirectory = mkdtempSync(join(tmpdir(), 'sheepfold-detector-scope-'));
    const mockUciPath = join(scriptDirectory, 'uci');
    const testScriptPath = join(scriptDirectory, 'scope-test.sh');
    const functionSource = source.slice(
      source.indexOf('COMMAND="${1:-scan}"'),
      source.indexOf('\ncase "$COMMAND" in'),
    );

    temporaryDirectories.push(scriptDirectory);
    // Поддельный UCI оставляет последней domain_allowlist: без local именно она
    // становилась целью последующей записи группы вместо device_test.
    writeFileSync(mockUciPath, `#!/bin/sh
if [ "$1" = "-q" ]; then shift; fi
case "$1:$2" in
  show:sheepfold)
    printf '%s\\n' 'sheepfold.allowlist=list' 'sheepfold.blocklist=list' 'sheepfold.domain_allowlist=list'
    ;;
  get:*) exit 1 ;;
esac
`, 'utf8');
    chmodSync(mockUciPath, 0o755);
    writeFileSync(testScriptPath, `#!/bin/sh
set -eu
${functionSource}
section=device_test
mac_in_named_list blocklist '00:11:22:33:44:55' || true
printf '%s\\n' "$section"
`, 'utf8');

    const result = spawnSync('sh', [testScriptPath], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${scriptDirectory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'device_test');
    assert.match(source, /write_runtime_observation\(\) \{\s+local mac ip name sources now file tmp/);
    assert.match(classifier, /add_competing_evidence\(\) \{\s+local family candidate_type points marker/);
  });

  it('никогда не доверяет OpenWrt-роутеру автоматически', () => {
    const device = classify({ name: 'OpenWrt' });

    assert.equal(device.type, 'network');
    assert.equal(device.targetGroup, '');
    assert.ok(device.confidence >= 90);
    assert.equal(device.autoScore, 0);
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('сетевой маркер старше ложного инженерного маркера', () => {
    const device = classify({
      name: 'OpenWrt alarm controller',
      ports: '22,53,80,443',
    });

    assert.equal(device.type, 'network');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('сетевой DHCP-признак не превращается в сервер из-за открытого порта', () => {
    const signalFile = createSignal({
      vendor_class: 'OpenWrt router',
      requested_options: '1,3,6,15,51',
    });
    const device = classify({
      name: 'alarm controller',
      ports: '8123',
      signalFile,
    });

    assert.equal(device.type, 'network');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('не доверяет умной колонке только по hostname', () => {
    const device = classify({ name: 'Yandex Station' });

    assert.equal(device.type, 'speaker');
    assert.equal(device.evidenceCount, 1);
    assert.equal(device.autoScore, 0);
    assert.equal(isAutoAssignable(device), false);
  });

  it('не назначает колонке привилегированную группу даже после DHCP-подтверждения', () => {
    const signalFile = createSignal({
      vendor_class: 'Yandex Station IoT',
      requested_options: '1,3,6,15,51',
    });
    const device = classify({ name: 'Yandex Station', signalFile });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence.sort(), ['dhcp', 'name']);
    assert.equal(device.autoScore, 0);
    assert.equal(device.targetGroup, '');
    assert.equal(isAutoAssignable(device), false);
  });

  it('считает mDNS аудиосервис независимым подтверждением колонки', () => {
    const device = classify({
      name: 'Yandex Station',
      mdnsServices: '_googlecast._tcp,_raop._tcp',
    });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence.sort(), ['mdns', 'name']);
    assert.equal(device.targetGroup, '');
    assert.equal(isAutoAssignable(device), false);
  });

  it('использует модель из mDNS TXT как отдельный признак, а не как новое имя DHCP', () => {
    const device = classify({
      name: 'unknown-device',
      mdnsProfile: '_googlecast._tcp|living-room.local|Living room|8009|md=Yandex Station',
    });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence, ['mdns']);
    assert.equal(isAutoAssignable(device), false);
  });

  it('подтверждает колонку через независимый UPnP MediaRenderer', () => {
    const device = classify({
      name: 'Yandex Station',
      ssdpProfile: 'urn:schemas-upnp-org:device:MediaRenderer:1|uuid:station-1234|Linux UPnP|http://192.168.1.20/device.xml',
    });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence.sort(), ['name', 'upnp']);
    assert.equal(device.targetGroup, '');
    assert.equal(isAutoAssignable(device), false);
  });

  it('не доверяет UPnP InternetGatewayDevice независимо от остальных признаков', () => {
    const device = classify({
      name: 'home server',
      ports: '8123',
      ssdpProfile: 'urn:schemas-upnp-org:device:InternetGatewayDevice:1|uuid:gateway-1234|OpenWrt UPnP|http://192.168.1.1/root.xml',
    });

    assert.equal(device.type, 'network');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('распознаёт стандартные WS-Discovery типы камеры и принтера как один источник', () => {
    const camera = classify({
      name: 'unknown-device',
      wsdProfile: 'dn:NetworkVideoTransmitter|onvif://www.onvif.org/type/video_encoder',
    });
    const printer = classify({
      name: 'unknown-device',
      wsdProfile: 'wsdp:PrintDeviceType|ldap:///uuid/device',
    });

    assert.equal(camera.type, 'camera');
    assert.deepEqual(camera.evidence, ['wsd']);
    assert.equal(isAutoAssignable(camera), false);
    assert.equal(printer.type, 'printer');
    assert.deepEqual(printer.evidence, ['wsd']);
    assert.equal(isAutoAssignable(printer), false);
  });

  it('не доверяет Chromecast только по медиасервису', () => {
    const device = classify({
      name: 'unknown-device',
      mdnsServices: '_googlecast._tcp',
    });

    assert.equal(device.type, 'tv');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('один mDNS-признак принтера не даёт доверие, но и не включает жёсткий запрет', () => {
    const device = classify({
      name: 'office-device',
      mdnsServices: '_ipp._tcp,_printer._tcp',
    });

    assert.equal(device.type, 'printer');
    assert.equal(device.hardDeny, false);
    assert.equal(device.evidenceCount, 1);
    assert.equal(isAutoAssignable(device), false);
  });

  it('два независимых принтерных признака разрешают безопасное автодоверие', () => {
    const device = classify({
      name: 'Office printer',
      ports: '631,9100',
      mdnsServices: '_ipp._tcp,_printer._tcp',
    });

    assert.equal(device.type, 'printer');
    assert.equal(device.hardDeny, false);
    assert.ok(device.evidenceCount >= 2);
    assert.equal(isAutoAssignable(device), true);
  });

  it('считает статическое имя владельца независимым подтверждением лампы', () => {
    const device = classify({
      name: 'Yeelight lamp',
      staticName: 'Yeelight kitchen lamp',
    });

    assert.equal(device.type, 'smart_home');
    assert.deepEqual(device.evidence.sort(), ['name', 'owner_configured']);
    assert.equal(isAutoAssignable(device), true);
  });

  it('DHCP-профиль компьютера запрещает доверие поддельному имени лампы', () => {
    const signalFile = createSignal({
      vendor_class: 'MSFT 5.0',
      requested_options: '1,3,6,15,31,33,43,44,46,47,119,121,249,252',
    });
    const device = classify({ name: 'Yeelight lamp', signalFile });

    assert.equal(device.type, 'smart_home');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
	assert.ok(device.competingEvidence.includes('dhcp:computer'));
  });

  it('штрафует победивший тип за независимый признак конкурирующего типа', () => {
	const device = classify({
		name: 'Yandex Station',
		mdnsProfile: '_ipp._tcp|printer.local|Office printer|631|note=printer',
	});

	assert.ok(device.competingEvidence.includes('mdns:printer'));
	assert.ok(device.confidence < 84);
	assert.equal(isAutoAssignable(device), false);
  });

  it('не использует метку источника arp как имя устройства', () => {
    const source = readFileSync(detectorPath, 'utf8');

    assert.match(source, /\$3 == "0x2"/);
    assert.match(source, /print \$4 "\\t" \$1 "\\t\*\\tarp"/);
    assert.match(source, /is_reserved_device_name/);
    assert.match(source, /\$3 !~ \/[\^]\(arp\|dhcp\|static\)/);
  });

  it('повторяет автоназначение для закреплённого типа, если группа ещё не назначена', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const lockedBody = functionBody(source, 'write_locked_device_observation', 'write_detection');
    const assignmentCalls = source.match(/assign_detected_group_if_allowed\s+"\$section"/g) || [];

    assert.match(lockedBody, /assign_detected_group_if_allowed/);
    assert.equal(assignmentCalls.length, 2, 'Автоназначение должно вызываться и после закреплённого определения');
    assert.match(source, /device_group_unassigned/);
	assert.match(source, /remove_stale_auto_no_restrictions/);
  });

  it('не заменяет автогруппой чёрный, администраторский или белый доступ устройства', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const assignmentBody = functionBody(
      source,
      'assign_detected_group_if_allowed',
      'needs_more_auto_group_evidence',
    );
    const blocklistCheck = assignmentBody.indexOf('mac_in_named_list blocklist');
    const administratorCheck = assignmentBody.indexOf('admin_device');
    const allowlistCheck = assignmentBody.indexOf('mac_in_named_list allowlist');
    const groupChoiceCheck = assignmentBody.indexOf('device_group_unassigned');

    assert.ok(blocklistCheck >= 0, 'Не найдена защита чёрного списка устройств');
    assert.ok(administratorCheck > blocklistCheck, 'Админская политика должна проверяться после чёрного списка');
    assert.ok(allowlistCheck > administratorCheck, 'Белый список должен проверяться после админской политики');
    assert.ok(groupChoiceCheck > allowlistCheck, 'Явные политики должны проверяться до автогруппы');
    assert.match(assignmentBody, /administrator_device/);
    assert.match(assignmentBody, /allowlisted_device/);
  });

  it('не замораживает инфраструктурный тип, пока автогруппе не хватает независимых признаков', () => {
    const source = readFileSync(detectorPath, 'utf8');

    assert.match(source, /needs_more_auto_group_evidence/);
    assert.match(source, /! needs_more_auto_group_evidence "\$section"/);
    assert.match(source, /independent_evidence_required/);
  });

  it('назначает уверенно распознанные личные экраны в отдельную непривилегированную группу', () => {
    const phone = classify({ name: 'Android Pixel phone' });
    const watch = classify({ name: 'Galaxy Watch 6' });
    const player = classify({ name: 'Dune HD media player' });

    assert.equal(phone.targetGroup, 'Персональные устройства');
    assert.equal(watch.type, 'smart_watch');
    assert.equal(watch.targetGroup, 'Персональные устройства');
    assert.equal(player.type, 'media_player');
    assert.equal(player.targetGroup, 'Персональные устройства');
  });

  it('использует Wi-Fi capabilities только как слабую подсказку типа', () => {
    const ordinaryPhone = classify({ name: 'Android Pixel phone' });
    const modernPhone = classify({
      name: 'Android Pixel phone',
      wifiProfile: 'generation=he,speed=very_fast',
    });
    const smartHome = classify({
      name: 'Tasmota relay',
      wifiProfile: 'generation=ht,speed=slow',
    });

    assert.equal(modernPhone.type, ordinaryPhone.type);
    assert.ok(modernPhone.confidence > ordinaryPhone.confidence);
    assert.deepEqual(modernPhone.evidence, ordinaryPhone.evidence);
    assert.equal(smartHome.type, 'smart_home');
    assert.equal(smartHome.evidenceCount, 1);
    assert.equal(isAutoAssignable(smartHome), false);
  });

  it('распознаёт Tuya по локальному дополнению к устаревшей OUI-базе роутера', () => {
    const device = classify({
      name: 'wlan0',
      mac: 'FC:67:1F:95:F9:55',
      wifiProfile: 'generation=ht,speed=slow',
    });

    assert.equal(device.type, 'smart_home');
    assert.ok(device.confidence >= 70);
    assert.equal(device.ouiVendor, 'Tuya Smart Inc.');
    assert.deepEqual(device.evidence, ['oui']);
    assert.equal(isAutoAssignable(device), false);
  });

  it('считает случайные Wi-Fi MAC ZTE и TECNO с совпадающим DHCP client-id личными телефонами', () => {
    for (const [mac, name] of [
      ['72:ED:B7:B6:DD:77', 'qwerty6'],
      ['76:5A:AF:5F:67:84', ''],
    ]) {
      const signalFile = createSignal({ client_id: `01:${mac}` });
      const device = classify({
        name,
        mac,
        signalFile,
        wifiProfile: 'generation=ht,speed=slow',
      });

      assert.equal(device.type, 'phone');
      assert.equal(device.confidence, 70);
      assert.equal(device.targetGroup, 'Персональные устройства');
      assert.equal(device.hardDeny, true);
      assert.ok(!device.ouiVendor);
    }
  });

  it('не пропускает online-устройство только потому, что DHCP не сообщил hostname', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const aggregateBody = functionBody(source, 'aggregate_router_devices', 'scan_ports');

    assert.match(aggregateBody, /name\[mac\] == "" \? "\*" : name\[mac\]/);
    assert.match(source, /''\|'\*'\|arp\|dhcp\|static/);
    assert.match(source, /ensure_dhcp_signal_file "\$mac" "\$ip" "\$name"/);
  });

  it('не включает Wi-Fi capabilities в доверенный identity baseline', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const identityBody = functionBody(source, 'build_identity_keys', 'build_fingerprint');
    const fingerprintBody = functionBody(source, 'build_fingerprint', 'collect_wifi_capabilities');

    assert.doesNotMatch(identityBody, /wifi/i);
    assert.match(fingerprintBody, /wifi_profile/);
    assert.match(source, /Текущие скорости остаются в \/tmp/);
    assert.doesNotMatch(source, /uci_set_if_changed[^\n]*detection_wifi_(?:max|last)/);
    assert.match(source, /uci_delete_if_present[^\n]*detection_wifi_max_rate_kbps/);
  });

  it('повторное определение снимает ручную фиксацию, но не меняет группу и списки доступа', () => {
    const source = readFileSync(reclassifyPath, 'utf8');

    assert.match(source, /manual_device_type=0/);
    assert.match(source, /delete[^\n]*\.device_type/);
    assert.doesNotMatch(source, /delete[^\n]*\.group/);
    assert.doesNotMatch(source, /delete[^\n]*(allowlist|blocklist)/);
  });

  it('ограничивает тяжёлое сканирование и ставит вручную выбранное устройство первым', () => {
    const detector = readFileSync(detectorPath, 'utf8');
    const reclassify = readFileSync(reclassifyPath, 'utf8');

    assert.match(detector, /detector_full_rescan_seconds 86400/);
    assert.match(detector, /detector_low_confidence_retry_seconds 86400/);
    assert.match(detector, /detection_ports_scanned_at/);
    assert.match(detector, /--max-retries 1/);
    assert.match(detector, /priority_mac/);
    assert.match(reclassify, /scan full "\$mac"/);
  });

  it('не распознаёт и не сканирует устройство из чёрного списка устройств', () => {
    const detector = readFileSync(detectorPath, 'utf8');
    const processBody = functionBody(detector, 'process_detected_device', 'scan_devices');
    const blocklistCheck = processBody.indexOf('device_is_blocklisted');
    const identityBuild = processBody.indexOf('build_identity_keys');
    const portScan = processBody.indexOf('scan_ports');

    assert.ok(blocklistCheck >= 0 && blocklistCheck < identityBuild);
    assert.ok(blocklistCheck < portScan);
    assert.match(processBody, /write_blocklisted_device_observation/);
  });

  it('хранит карантин отдельно от постоянных прав настоящего устройства', () => {
    const detector = readFileSync(detectorPath, 'utf8');
    const reclassify = readFileSync(reclassifyPath, 'utf8');
    const processBody = functionBody(detector, 'process_detected_device', 'scan_devices');
    const identityCheck = processBody.indexOf('evaluate_identity_state');
    const manualTypeCheck = processBody.indexOf('manual_device_type');
    const portScan = processBody.indexOf('scan_ports');

    assert.ok(identityCheck >= 0 && identityCheck < manualTypeCheck);
    assert.ok(identityCheck < portScan);
    assert.match(detector, /trusted_identity_keys/);
    assert.match(detector, /identity_quarantine_mode/);
    assert.match(detector, /clear_identity_quarantine/);
    assert.doesNotMatch(
      functionBody(detector, 'apply_identity_quarantine', 'evaluate_identity_state'),
      /blocklist\.mac|\.group|admin_device|allowlist/,
    );
    assert.match(reclassify, /trusted_identity_keys=\$quarantine_keys/);
  });

  it('передаёт mDNS, SSDP, WS-Discovery и identity аргументы без постороннего сдвига', () => {
    const detector = readFileSync(detectorPath, 'utf8');

    assert.match(detector, /build_fingerprint "\$mac" "\$name" "\$static_name" "\$signal_file" "\$ports" \\\n\s+"\$mdns_services"/);
    assert.match(detector, /"\$CLASSIFIER" "\$name" "\$ports" "\$static_name" "\$signal_file" "\$mac" \\\n\s+"\$mdns_services"/);
    assert.match(detector, /"\$mdns_services" "\$mdns_profile" "\$ssdp_profile" "\$wsd_profile"/);
    assert.doesNotMatch(detector, /"\$ports" \+\s+"\$mdns_services"/);
  });

  it('оставляет быстрый firewall tick, но реже запускает остальные фоновые операции', () => {
    const service = readFileSync(servicePath, 'utf8');

    assert.match(service, /service_control_interval_seconds[^\n]*printf 30/);
    assert.match(service, /handle_router_control periodic/);
    assert.match(service, /handle_router_control force/);
    assert.match(service, /"\$FIREWALL_HELPER" sync/);
  });

  it('сверяет версии политики classifier и detector без зашитого номера', () => {
    const hardening = readFileSync(hardeningPath, 'utf8');

    assert.match(hardening, /classifier_policy=/);
    assert.match(hardening, /detector_policy=/);
    assert.match(hardening, /"\$classifier_policy" = "\$detector_policy"/);
    assert.doesNotMatch(hardening, /grep -q 'POLICY_VERSION="\d+"'/);
    assert.match(hardening, /evidence_count.*-lt 2/);
    assert.match(hardening, /assign_detected_group_if_allowed/);
  });
});
/*
 * Проверяет границы доверия классификатора и статические инварианты detector.
 * Поддельные UCI/DHCP-признаки запускаются локально, поэтому тест ловит регрессии
 * решений и shell wiring, но не заменяет nmap/mDNS/SSDP-прогон на живом роутере.
 */
