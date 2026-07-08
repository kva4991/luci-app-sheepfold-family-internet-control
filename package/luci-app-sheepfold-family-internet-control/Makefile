include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sheepfold-family-internet-control
PKG_VERSION:=0.1.0
PKG_RELEASE:=117
PKG_LICENSE:=MIT
PKG_MAINTAINER:=kva4991
SHEEPFOLD_UI_ASSET_VERSION:=$(PKG_VERSION)-$(PKG_RELEASE)

LUCI_TITLE:=Sheepfold Family Internet Control
LUCI_DESCRIPTION:=Family internet access control for OpenWRT with LuCI, Android, and bot support.
LUCI_DEPENDS:=+luci-base +firewall4 +rpcd +uci +uclient-fetch +ca-bundle +uhttpd

define Package/$(PKG_NAME)/postinst
#!/bin/sh
hardener="$${IPKG_INSTROOT}/usr/libexec/sheepfold/sheepfold-runtime-hardening"
if [ -f "$$hardener" ]; then
	/bin/sh "$$hardener" "$${IPKG_INSTROOT}" || exit 1
fi
[ -n "$${IPKG_INSTROOT}" ] && exit 0
repair_sheepfold_uci_sections() {
	mkdir -p /etc/config
	[ -e /etc/config/sheepfold ] || : > /etc/config/sheepfold
	chmod 600 /etc/config/sheepfold 2>/dev/null || true
	for pair in messenger:messenger_global export:export_global wifi_control:wifi_control_global pairing:pairing_global; do
		type="$${pair%%:*}"
		name="$${pair#*:}"
		if [ "$$(uci -q get sheepfold.global 2>/dev/null)" = "$$type" ]; then
			uci -q rename sheepfold.global="$$name" 2>/dev/null || {
				uci -q delete sheepfold.global 2>/dev/null || true
				uci -q set "sheepfold.$$name=$$type"
			}
		fi
		uci -q rename "sheepfold.@$$type[0]=$$name" 2>/dev/null || true
	done
	if [ "$$(uci -q get sheepfold.global 2>/dev/null)" != "sheepfold" ]; then
		uci -q rename sheepfold.global=legacy_global 2>/dev/null || uci -q delete sheepfold.global 2>/dev/null || true
		uci -q rename sheepfold.@sheepfold[0]=global 2>/dev/null || uci -q set sheepfold.global='sheepfold'
	fi
	uci -q commit sheepfold 2>/dev/null || true
}
repair_sheepfold_uci_sections
uci -q get sheepfold.global >/dev/null || uci -q set sheepfold.global='sheepfold'
ensure_global_option() {
	option="$$1"
	value="$$2"
	[ -n "$$(uci -q get sheepfold.global.$$option 2>/dev/null)" ] || uci -q set sheepfold.global.$$option="$$value"
}
ensure_global_option enabled '0'
ensure_global_option language 'ru'
ensure_global_option block_on_boot '0'
ensure_global_option new_device_policy 'allow'
ensure_global_option auto_configure '1'
ensure_global_option detection_mode 'full'
ensure_global_option no_restrictions_auto_assign '1'
ensure_global_option detector_watch_interval_seconds '10'
ensure_global_option detector_interval_seconds '900'
ensure_global_option detector_max_hosts_per_scan '16'
ensure_global_option detector_min_device_type_confidence '70'
ensure_global_option detector_min_no_restrictions_confidence '80'
ensure_global_option detector_nmap_host_timeout_seconds '20'
ensure_global_option update_check_install_mode 'weekly'
ensure_global_option active_messenger 'none'
ensure_global_option ai_enabled '0'
ensure_global_option ai_provider 'deepseek'
ensure_global_option ai_rate_limit_requests '20'
ensure_global_option ai_rate_limit_window_seconds '3600'
ensure_global_option ai_individual_logs '0'
ensure_global_option deepseek_model 'deepseek-chat'
ensure_global_option deepseek_api_url 'https://api.deepseek.com/chat/completions'
ensure_global_option deepseek_api_key ''
ensure_global_option gemini_model 'gemini-2.5-flash'
ensure_global_option gemini_api_url 'https://generativelanguage.googleapis.com/v1beta/models'
ensure_global_option gemini_api_key ''
ensure_global_option vk_access_token ''
ensure_global_option vk_community_id ''
ensure_global_option vk_admin_user_id ''
ensure_global_option telegram_bot_token ''
ensure_global_option telegram_admin_chat_id ''
ensure_global_option wifi_auto_enable_mode 'never'
ensure_global_option wifi_auto_enable_time '07:00'
ensure_global_option wifi_auto_disable_mode 'never'
ensure_global_option wifi_auto_disable_time '23:00'
ensure_global_option router_ntp_server_enabled '1'
ensure_global_option router_ntp_client_auto_configure '1'
ensure_global_option router_timezone_name 'Europe/Moscow'
ensure_global_option router_timezone 'MSK-3'
ensure_global_option router_ntp_servers 'ntp1.vniiftri.ru ntp2.ntp-servers.net 3.openwrt.pool.ntp.org'
ensure_global_option wps_short_press_action 'router_default'
ensure_global_option wps_long_press_action 'router_default'
ensure_global_option router_led_control 'router_default'
ensure_global_option blocked_page_enabled '1'
ensure_global_option blocked_page_text 'Интернет временно недоступен по семейным правилам. Если это ошибка, обратитесь к родителю.'
ensure_global_option blocked_page_port '5202'
ensure_global_option domain_allowlist_for_blocklist '1'
ensure_global_option site_allowlist_sources 'UT1 child | https://dsi.ut-capitole.fr/blacklists/index_en.php#child'
ensure_global_option site_blocklist_mode 'except_allowlist_admins'
ensure_global_option site_blocklist_sources 'UT1 adult, malware, phishing, gambling, games, vpn | https://dsi.ut-capitole.fr/blacklists/index_en.php; StevenBlack hosts gambling-porn | https://github.com/StevenBlack/hosts; HaGeZi Threat Intelligence Feeds | https://github.com/hagezi/dns-blocklists; URLhaus malware URLs | https://urlhaus.abuse.ch/api/'
ensure_global_option site_lists_update_interval 'weekly'
ensure_global_option activity_log_enabled '0'
ensure_global_option private_logs '0'
ensure_global_option log_days '7'
ensure_global_option log_max_dir_kb '0'
ensure_global_option log_max_device_kb '0'
if [ "$$(uci -q get sheepfold.global.domain_allowlist_for_blocklist_default_migrated 2>/dev/null)" != "1" ]; then
	uci -q set sheepfold.global.domain_allowlist_for_blocklist='1'
	uci -q set sheepfold.global.domain_allowlist_for_blocklist_default_migrated='1'
fi
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
ensure_global_option log_storage 'ram'
ensure_global_option log_cache_path '/tmp/sheepfold/events.log'
uci -q get sheepfold.pairing_global >/dev/null || uci -q set sheepfold.pairing_global='pairing'
ensure_pairing_option() {
	option="$$1"
	value="$$2"
	[ -n "$$(uci -q get sheepfold.pairing_global.$$option 2>/dev/null)" ] || uci -q set sheepfold.pairing_global.$$option="$$value"
}
ensure_pairing_option max_attempts '10'
ensure_pairing_option attempt_window_seconds '600'
uci -q get sheepfold.no_restrictions >/dev/null || uci -q set sheepfold.no_restrictions='group'
uci -q set sheepfold.no_restrictions.name='Без ограничений'
uci -q set sheepfold.no_restrictions.protected='1'
uci -q set sheepfold.no_restrictions.auto_assignable='1'
uci -q set sheepfold.no_restrictions.allowlist_only='0'
uci -q set sheepfold.no_restrictions.activity_log_enabled='0'
uci -q set sheepfold.no_restrictions.description='Trusted home infrastructure devices that should not be limited unless they are blocklisted'
uci -q get sheepfold.child_1 >/dev/null || uci -q set sheepfold.child_1='group'
uci -q set sheepfold.child_1.name='Первый ребёнок'
uci -q set sheepfold.child_1.protected='0'
uci -q set sheepfold.child_1.auto_assignable='0'
uci -q set sheepfold.child_1.allowlist_only='0'
uci -q set sheepfold.child_1.activity_log_enabled='0'
uci -q set sheepfold.child_1.description='Default first child group'
log_cache_path="$$(uci -q get sheepfold.global.log_cache_path 2>/dev/null || printf '%s' /tmp/sheepfold/events.log)"
case "$$log_cache_path" in
	/tmp/sheepfold/*) ;;
	*) log_cache_path='/tmp/sheepfold/events.log' ;;
esac
mkdir -p "$${log_cache_path%/*}"
touch "$$log_cache_path"
chmod 600 "$$log_cache_path"
detect_installed() {
	pkg="$$1"
	init="$$2"
	config="$$3"
	opkg status "$$pkg" 2>/dev/null | grep -q "Status:.* installed" && return 0
	[ -n "$$init" ] && [ -x "/etc/init.d/$$init" ] && return 0
	[ -n "$$config" ] && [ -f "/etc/config/$$config" ] && return 0
	return 1
}
detect_installed AdGuardHome AdGuardHome AdGuardHome || detect_installed adguardhome adguardhome adguardhome
has_adguard="$$?"
detect_installed podkop podkop podkop
has_podkop="$$?"
if [ "$$(uci -q get sheepfold.global.integration_mode_user_set 2>/dev/null)" != "1" ]; then
	if [ "$$has_adguard" = "0" ] && [ "$$has_podkop" = "0" ]; then
		uci -q set sheepfold.global.integration_mode='adguard_podkop'
	elif [ "$$has_adguard" = "0" ]; then
		uci -q set sheepfold.global.integration_mode='adguard'
	elif [ "$$has_podkop" = "0" ]; then
		uci -q set sheepfold.global.integration_mode='podkop'
	else
		uci -q set sheepfold.global.integration_mode='none'
	fi
	uci -q set sheepfold.global.integration_mode_source='auto'
	uci -q set sheepfold.global.adguard_integration="$$([ "$$has_adguard" = "0" ] && printf 1 || printf 0)"
	uci -q set sheepfold.global.podkop_compatibility="$$([ "$$has_podkop" = "0" ] && printf 1 || printf 0)"
fi
uci -q set sheepfold.global.ui_asset_version='$(SHEEPFOLD_UI_ASSET_VERSION)'
uci -q commit sheepfold
for helper in \
	/usr/libexec/sheepfold/sheepfold-site-lists \
	/usr/libexec/sheepfold/sheepfold-api-client-status \
	/usr/libexec/sheepfold/sheepfold-api-pair \
	/usr/libexec/sheepfold/sheepfold-ai-gate \
	/usr/libexec/sheepfold/sheepfold-activity-log \
	/usr/libexec/sheepfold/sheepfold-maintenance-window \
	/usr/libexec/sheepfold/sheepfold-usb-storage \
	/usr/libexec/sheepfold/sheepfold-key-derive \
	/usr/libexec/sheepfold/sheepfold-openssl-ensure \
	/usr/libexec/sheepfold/sheepfold-runtime-hardening \
	/www/.well-known/sheepfold.json.sh; do
	chmod 0755 "$$helper" 2>/dev/null || true
done
if [ "$$(uci -q get sheepfold.global.ai_individual_logs 2>/dev/null)" = "1" ]; then
	/usr/libexec/sheepfold/sheepfold-openssl-ensure >/dev/null 2>&1 || true
fi
# Единый генератор валидирует порт, экранирует hostname и выполняет атомарную запись.
/www/.well-known/sheepfold.json.sh || exit 1
install_sheepfold_cron() {
	cron_file='/etc/crontabs/root'
	mkdir -p /etc/crontabs
	tmp="$$cron_file.sheepfold.tmp"
	if [ -f "$$cron_file" ]; then
		awk '
			/^# BEGIN SHEEPFOLD MANAGED JOBS$$/ { skip=1; next }
			/^# END SHEEPFOLD MANAGED JOBS$$/   { skip=0; next }
			!skip { print }
		' "$$cron_file" > "$$tmp"
	else
		: > "$$tmp"
	fi
	cat >> "$$tmp" <<'EOF'
# BEGIN SHEEPFOLD MANAGED JOBS
5 2 * * * /usr/libexec/sheepfold/sheepfold-maintenance-window && /usr/libexec/sheepfold/sheepfold-activity-log rotate >/dev/null 2>&1
55 4 * * * /usr/libexec/sheepfold/sheepfold-activity-log rotate >/dev/null 2>&1
10 2 * * * /usr/libexec/sheepfold/sheepfold-maintenance-window && /usr/libexec/sheepfold/sheepfold-usb-storage archive-push >/dev/null 2>&1
15 4 * * * /usr/libexec/sheepfold/sheepfold-usb-storage archive-push >/dev/null 2>&1
# END SHEEPFOLD MANAGED JOBS
EOF
	chmod 600 "$$tmp"
	mv -f "$$tmp" "$$cron_file"
	[ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
}
install_sheepfold_cron
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold enable || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold restart || true
exit 0
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
cron_file='/etc/crontabs/root'
if [ -f "$$cron_file" ]; then
	tmp="$$cron_file.sheepfold.tmp"
	awk '
		/^# BEGIN SHEEPFOLD MANAGED JOBS$$/ { skip=1; next }
		/^# END SHEEPFOLD MANAGED JOBS$$/   { skip=0; next }
		!skip { print }
	' "$$cron_file" > "$$tmp" && {
		chmod 600 "$$tmp"
		mv -f "$$tmp" "$$cron_file"
	}
fi
[ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
exit 0
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/sheepfold
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWRT buildroot signature
