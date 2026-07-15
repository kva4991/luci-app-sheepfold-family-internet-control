include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sheepfold-family-internet-control
PKG_VERSION:=0.1.0
PKG_RELEASE:=165
PKG_LICENSE:=MIT
PKG_MAINTAINER:=kva4991
SHEEPFOLD_UI_ASSET_VERSION:=$(PKG_VERSION)-$(PKG_RELEASE)

LUCI_TITLE:=Sheepfold Family Internet Control
LUCI_DESCRIPTION:=Family internet access control for OpenWRT with LuCI, Android, and bot support.
LUCI_DEPENDS:=+luci-base +firewall4 +rpcd +uci +uclient-fetch +ca-bundle +uhttpd +uhttpd-mod-tls +curl

# Supported LuCI languages (gettext)
LUCI_LANGUAGES:=en ru zh_Hans
LUCI_LANG.zh_Hans:=中文 (简体)

# ... (the rest of the long postinst and other sections remain unchanged)

define Package/$(PKG_NAME)/preinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
case "$$1" in
	upgrade|install)
		if [ -s /etc/config/sheepfold ]; then
			mkdir -p /etc/sheepfold/migrations
			cp /etc/config/sheepfold /etc/sheepfold/migrations/sheepfold.config.pre-upgrade
			chmod 600 /etc/config/sheepfold/migrations/sheepfold.config.pre-upgrade 2>/dev/null || true
		fi
		;;
esac
exit 0
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
hardener="$${IPKG_INSTROOT}/usr/libexec/sheepfold/sheepfold-runtime-hardening"
if [ -f "$$hardener" ]; then
	/bin/sh "$$hardener" "$${IPKG_INSTROOT}" || exit 1
fi
[ -n "$${IPKG_INSTROOT}" ] && exit 0
cleanup_opkg_conffile_artifacts() {
	for leftover in /etc/config/sheepfold-opkg /etc/config/sheepfold-opkg.old; do
		[ -e "$$leftover" ] || continue
		rm -f "$$leftover"
	done
}
cleanup_stale_update_artifacts() {
	rm -f /tmp/sheepfold/update/*.ipk /tmp/sheepfold/update/sheepfold-config-before-update 2>/dev/null || true
}
recover_sheepfold_config() {
	mkdir -p /etc/config /etc/sheepfold/migrations
	if [ -s /etc/config/sheepfold ]; then
		return 0
	fi
	for candidate in \
		/etc/sheepfold/migrations/sheepfold.config.pre-upgrade \
		/etc/config/sheepfold-opkg \
		/etc/config/sheepfold-opkg.old \
		/tmp/sheepfold/update/sheepfold-config-before-update; do
		if [ -s "$$candidate" ]; then
			cp "$$candidate" /etc/config/sheepfold
			chmod 600 /etc/config/sheepfold 2>/dev/null || true
			return 0
		done
	if [ -r /usr/share/sheepfold/sheepfold.uci.defaults ]; then
		cp /usr/share/sheepfold/sheepfold.uci.defaults /etc/config/sheepfold
	else
		: > /etc/config/sheepfold
	fi
	chmod 600 /etc/config/sheepfold 2>/dev/null || true
}
recover_sheepfold_config
cleanup_stale_update_artifacts
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
ensure_global_option lan_firewall_zones 'lan'
ensure_global_option integration_mode 'none'
ensure_global_option integration_mode_source 'default'
ensure_global_option integration_mode_user_set '0'
ensure_global_option new_device_policy 'allow'
ensure_global_option auto_configure '1'
ensure_global_option detection_mode 'full'
ensure_global_option no_restrictions_auto_assign '1'
ensure_global_option detector_watch_interval_seconds '10'
ensure_global_option detector_interval_seconds '900'
ensure_global_option detector_min_device_type_confidence '70'
ensure_global_option detector_min_no_restrictions_confidence '80'
ensure_global_option detector_nmap_host_timeout_seconds '20'
ensure_global_option update_check_install_mode 'weekly'
ensure_global_option active_messenger 'none'
ensure_global_option ai_enabled '0'
ensure_global_option ai_provider 'none'
ensure_global_option ai_rate_limit_requests '20'
ensure_global_option ai_rate_limit_window_seconds '3600'
ensure_global_option ai_individual_logs '0'
ensure_global_option child_ai_parental_consent '0'
ensure_global_option child_ai_consent_version 'child-ai-v1'
ensure_global_option parent_ai_prompt_version 'v2'
ensure_global_option child_ai_prompt_version 'v1'
ensure_global_option deepseek_model 'deepseek-chat'
ensure_global_option deepseek_api_url 'https://api.deepseek.com/chat/completions'
ensure_global_option deepseek_api_key ''
ensure_global_option gemini_model 'gemini-2.5-flash'
ensure_global_option gemini_api_url 'https://generativelanguage.googleapis.com/v1beta/models'
ensure_global_option gemini_api_key ''
ensure_global_option grok_model 'grok-3-mini'
ensure_global_option grok_api_url 'https://api.x.ai/v1/chat/completions'
ensure_global_option grok_api_key ''
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
ensure_global_option router_led_repair '0'
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
uci -q delete sheepfold.global.app_https_port 2>/dev/null || true
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
ensure_named_section() {
	name="$$1"
	type="$$2"
	uci -q get "sheepfold.$$name" >/dev/null 2>&1 || uci -q set "sheepfold.$$name=$$type"
}
ensure_named_section allowlist list
ensure_named_section blocklist list
ensure_named_section domain_allowlist list
ensure_named_section adguard integration
ensure_named_section podkop integration
ensure_named_section messenger_global messenger
ensure_named_section export_global export
ensure_named_section wifi_control_global wifi_control
ensure_named_section usb usb
ensure_named_section cloud yandex_disk
ensure_yandex_option() {
	option="$$1"
	value="$$2"
	[ -n "$$(uci -q get sheepfold.cloud.$$option 2>/dev/null)" ] || uci -q set sheepfold.cloud.$$option="$$value"
}
ensure_yandex_option login ''
ensure_yandex_option password ''
ensure_yandex_option root_folder '/sheepfold'
ensure_yandex_option quota_mb '500'
ensure_yandex_option authorized '0'
ensure_named_section gdrive google_drive
ensure_gdrive_option() {
	option="$$1"
	value="$$2"
	[ -n "$$(uci -q get sheepfold.gdrive.$$option 2>/dev/null)" ] || uci -q set sheepfold.gdrive.$$option="$$value"
}
ensure_gdrive_option client_id ''
ensure_gdrive_option client_secret ''
ensure_gdrive_option refresh_token ''
ensure_gdrive_option root_folder '/sheepfold'
ensure_gdrive_option quota_mb '500'
ensure_gdrive_option authorized '0'
uci -q get sheepfold.owner >/dev/null || uci -q set sheepfold.owner=administrator
[ -n "$$(uci -q get sheepfold.owner.id 2>/dev/null)" ] || uci -q set sheepfold.owner.id='1'
[ -n "$$(uci -q get sheepfold.owner.login 2>/dev/null)" ] || uci -q set sheepfold.owner.login='SuperParent'
[ -n "$$(uci -q get sheepfold.owner.role 2>/dev/null)" ] || uci -q set sheepfold.owner.role='owner'
[ -n "$$(uci -q get sheepfold.owner.password_setup_required 2>/dev/null)" ] || uci -q set sheepfold.owner.password_setup_required='1'
# Администраторы используют ту же понятную числовую схему ID, что и устройства.
used_admin_ids=' 1 '
next_admin_id=2
for section in $$(uci -q show sheepfold 2>/dev/null | sed -n 's/^sheepfold\.\([^.=]*\)=administrator$$/\1/p'); do
	[ "$$section" = owner ] && continue
	current="$$(uci -q get sheepfold.$$section.id 2>/dev/null || true)"
	current="$$(printf '%s' "$$current" | sed 's/[^0-9][^0-9]*/ /g' | awk '{print $$NF}' | sed 's/^0*//')"
	case "$$current" in ''|*[!0-9]*|0) current='' ;; esac
	case "$$used_admin_ids" in *" $$current "*) current='' ;; esac
	if [ -z "$$current" ]; then
		while case "$$used_admin_ids" in *" $$next_admin_id "*) true ;; *) false ;; esac; do next_admin_id=$$((next_admin_id + 1)); done
		current="$$next_admin_id"
	fi
	uci -q set sheepfold.$$section.id="$$current"
	used_admin_ids="$$used_admin_ids$$current "
	[ "$$next_admin_id" -gt "$$current" ] || next_admin_id=$$((current + 1))
done
[ -x /usr/libexec/sheepfold/sheepfold-default-groups ] && /usr/libexec/sheepfold/sheepfold-default-groups apply
[ -x /usr/libexec/sheepfold/sheepfold-device-id ] && /usr/libexec/sheepfold/sheepfold-device-id ensure-all
if [ "$$(uci -q get sheepfold.global.luci_language_synced 2>/dev/null)" != "1" ]; then
	lang="$$(uci -q get sheepfold.global.language 2>/dev/null || printf ru)"
	case "$$lang" in
		en|ru|zh_Hans) ;;
		*) lang=ru ;;
esac
	uci -q get luci.main >/dev/null 2>&1 || uci -q set luci.main=core
	uci -q set luci.main.lang="$$lang"
	uci -q set sheepfold.global.luci_language_synced='1'
	uci -q commit luci 2>/dev/null || true
fi
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
find /usr/libexec/sheepfold -type f -exec chmod 0755 {} + 2>/dev/null || true
for helper in \
	/etc/hotplug.d/dhcp/90-sheepfold-device-signals \
	/www/.well-known/sheepfold.json.sh \
	/www/cgi-bin/sheepfold-api \
	/www/cgi-bin/sheepfold-blocked; do
	[ -e "$$helper" ] && chmod 0755 "$$helper" 2>/dev/null || true
done
if [ "$$(uci -q get sheepfold.global.ai_individual_logs 2>/dev/null)" = "1" ]; then
	/usr/libexec/sheepfold/sheepfold-openssl-ensure >/dev/null 2>&1 || true
fi
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
10 2 * * * /usr/libexec/sheepfold/sheepfold-maintenance-window && /usr/libexec/sheepfold/sheepfold-log-storage archive-push >/dev/null 2>&1
55 4 * * * /usr/libexec/sheepfold/sheepfold-activity-log rotate >/dev/null 2>&1
0 5 * * * /usr/libexec/sheepfold/sheepfold-log-storage archive-push >/dev/null 2>&1
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
cleanup_opkg_conffile_artifacts
cleanup_stale_update_artifacts
exit 0
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
# До удаления исполняемых файлов очищаем только собственные наборы Sheepfold.
# Чужие таблицы, правила и packet marks, включая Podkop, не изменяются. §v7x2k9p
[ -x /usr/libexec/sheepfold/sheepfold-firewall ] && \
	/usr/libexec/sheepfold/sheepfold-firewall clear >/dev/null 2>&1 || true
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

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWRT buildroot signature
