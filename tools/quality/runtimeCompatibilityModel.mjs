/*
 * Описывает компактную конфигурационную модель Sheepfold для all-pairs ревью.
 * Это план проверок, а не симулятор OpenWrt: фактические DNS/firewall эффекты
 * подтверждаются отдельными integration и live-router тестами. §pairmat §testwhy
 */

export const runtimeFactors = Object.freeze({
  packageFormat: Object.freeze(['ipk24', 'apk25']),
  packageVariant: Object.freeze(['standard', 'aiSupport']),
  integrationMode: Object.freeze(['none', 'podkop', 'adguard', 'adguardPodkop']),
  siteBackend: Object.freeze(['auto', 'sheepfold', 'adguard']),
  adguardManage: Object.freeze(['off', 'on']),
  detectionMode: Object.freeze(['reduced', 'full']),
  newDeviceSetup: Object.freeze(['manual', 'automatic']),
});

export const requiredRuntimeRows = Object.freeze([
  Object.freeze({
    packageFormat: 'ipk24', packageVariant: 'standard', integrationMode: 'none',
    siteBackend: 'auto', adguardManage: 'on', detectionMode: 'full', newDeviceSetup: 'automatic',
  }),
  Object.freeze({
    packageFormat: 'apk25', packageVariant: 'aiSupport', integrationMode: 'adguardPodkop',
    siteBackend: 'adguard', adguardManage: 'on', detectionMode: 'reduced', newDeviceSetup: 'manual',
  }),
  Object.freeze({
    packageFormat: 'ipk24', packageVariant: 'standard', integrationMode: 'podkop',
    siteBackend: 'sheepfold', adguardManage: 'off', detectionMode: 'reduced', newDeviceSetup: 'automatic',
  }),
  Object.freeze({
    packageFormat: 'apk25', packageVariant: 'aiSupport', integrationMode: 'adguard',
    siteBackend: 'auto', adguardManage: 'off', detectionMode: 'full', newDeviceSetup: 'manual',
  }),
  // Ошибочная явная настройка тоже важна: UI/backend должны показать деградацию,
  // а не молча объявить отсутствующий AdGuard рабочим.
  Object.freeze({
    packageFormat: 'ipk24', packageVariant: 'aiSupport', integrationMode: 'none',
    siteBackend: 'adguard', adguardManage: 'on', detectionMode: 'full', newDeviceSetup: 'manual',
  }),
]);

export function expectedRuntime(row) {
  const hasPodkop = row.integrationMode === 'podkop' || row.integrationMode === 'adguardPodkop';
  const hasAdguard = row.integrationMode === 'adguard' || row.integrationMode === 'adguardPodkop';
  let activeSiteBackend = row.siteBackend;
  let siteStatus = 'ready';

  if (row.siteBackend === 'auto') activeSiteBackend = hasAdguard ? 'adguard' : 'sheepfold';
  if (row.siteBackend === 'adguard' && !hasAdguard) siteStatus = 'missingAdguard';
  else if (activeSiteBackend === 'adguard' && row.adguardManage === 'off') siteStatus = 'manualUnverified';

  return {
    activeSiteBackend,
    siteStatus,
    forceIpv6Off: hasPodkop,
    aiBackendIncluded: row.packageVariant === 'aiSupport',
  };
}
