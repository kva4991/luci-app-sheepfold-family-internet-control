'use strict';
'require baseclass';

/* §frontmod §coordclean1 §ovaudit3
 * Упорядоченные эффекты после сохранения общего черновика Settings. Результат
 * каждой команды роутера проверяется, повторная синхронизация расписаний
 * объединяется, а ошибки discovery/service не замалчиваются.
 */
function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function create(deps) {
	function checkedRun(args, fallback) {
		return Promise.resolve().then(function () { return deps.run(args); }).then(function (result) {
			return deps.ensureOk(result, fallback);
		});
	}

	function checkedResult(task, fallback) {
		return Promise.resolve().then(task).then(function (result) {
			if (result && Object.prototype.hasOwnProperty.call(result, 'code'))
				deps.ensureOk(result, fallback);
			return result;
		});
	}

	function apply(options) {
		var chain = Promise.resolve();
		var needsScheduleSync = hasOwn(options, 'schedule_conflict_internet') || hasOwn(options, 'new_device_policy');

		if (hasOwn(options, 'site_lists_update_interval'))
			chain = chain.then(function () { return checkedRun(['site-lists-cron-apply'], deps.siteCronError()); });

		if (hasOwn(options, 'site_blocklist_mode') ||
			hasOwn(options, 'site_allowlist_sources') ||
			hasOwn(options, 'site_blocklist_sources') ||
			hasOwn(options, 'integration_mode') ||
			hasOwn(options, 'site_filter_backend') ||
			hasOwn(options, 'adguard_auto_manage') ||
			hasOwn(options, 'adguard.url') ||
			hasOwn(options, 'adguard.username') ||
			hasOwn(options, 'adguard.password')) {
			chain = chain.then(function () {
				return checkedRun(['site-lists-apply'], deps.sitePolicyError()).then(function () {
					return Promise.resolve().then(function () { return deps.refreshSiteStatus(); }).catch(function () { return null; });
				});
			});
		}

		if (hasOwn(options, 'router_led_control'))
			chain = chain.then(function () { return checkedRun(['led-apply'], deps.ledError()); });

		if (hasOwn(options, 'router_ipv6_disabled') || hasOwn(options, 'integration_mode'))
			chain = chain.then(function () { return checkedRun(['ipv6-apply'], deps.ipv6Error()); });

		if (needsScheduleSync)
			chain = chain.then(function () { return checkedRun(['schedule-sync'], deps.scheduleError()); });

		if (hasOwn(options, 'domain_allowlist_for_blocklist') && !deps.emergencySitesChanged())
			chain = chain.then(function () { return checkedRun(['emergency-sites-apply'], deps.emergencyError()); });

		if (hasOwn(options, 'app_port')) {
			chain = chain.then(function () {
				return checkedResult(function () { return deps.writeDiscovery(options.app_port); }, deps.discoveryError());
			}).then(function () {
				return checkedResult(deps.restartService, deps.restartError());
			});
		}

		/* SHEEPFOLD_AI_BEGIN */
		if (hasOwn(options, 'ai_individual_logs') && options.ai_individual_logs === '1')
			chain = chain.then(function () { return deps.ensureAiLogs(); });
		/* SHEEPFOLD_AI_END */

		return chain;
	}

	function applyPostSave(options) {
		var chain = Promise.resolve();

		if (hasOwn(options, 'country_profile')) {
			chain = chain.then(function () {
				return checkedRun(['country-profile-apply', options.country_profile], deps.countryProfileError());
			}).then(function () {
				return deps.reloadConfig('sheepfold');
			}).then(function () {
				return deps.refreshEmergencySites();
			});
		}

		if (hasOwn(options, 'language'))
			chain = chain.then(function () { return deps.reloadPage(600); });

		return chain;
	}

	return { apply: apply, applyPostSave: applyPostSave };
}

return baseclass.extend({ hasOwn: hasOwn, create: create });
