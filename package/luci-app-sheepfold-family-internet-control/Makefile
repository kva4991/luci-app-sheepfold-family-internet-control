include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sheepfold-family-internet-control
PKG_VERSION:=0.1.0
PKG_RELEASE:=67
PKG_LICENSE:=MIT
PKG_MAINTAINER:=kva4991
SHEEPFOLD_UI_ASSET_VERSION:=$(PKG_VERSION)-$(PKG_RELEASE)

LUCI_TITLE:=Sheepfold Family Internet Control
LUCI_DESCRIPTION:=Family internet access control for OpenWRT with LuCI, Android, and bot support.
LUCI_DEPENDS:=+luci-base +firewall4 +rpcd +uci +uclient-fetch +ca-bundle +uhttpd

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
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
ensure_global_option detector_min_no_restrictions_confidence '80'
ensure_global_option detector_nmap_host_timeout_seconds '20'
ensure_global_option update_check_install_mode 'weekly'
ensure_global_option wifi_auto_enable_mode 'never'
ensure_global_option wifi_auto_enable_time '07:00'
ensure_global_option wifi_auto_disable_mode 'never'
ensure_global_option wifi_auto_disable_time '23:00'
ensure_global_option wps_short_press_action 'router_default'
ensure_global_option wps_long_press_action 'router_default'
ensure_global_option router_led_control 'router_default'
ensure_global_option blocked_page_enabled '1'
ensure_global_option blocked_page_text 'Интернет временно недоступен по семейным правилам. Если это ошибка, обратитесь к родителю.'
ensure_global_option blocked_page_port '5202'
ensure_global_option domain_allowlist_for_blocklist '1'
if [ "$$(uci -q get sheepfold.global.domain_allowlist_for_blocklist_default_migrated 2>/dev/null)" != "1" ]; then
	uci -q set sheepfold.global.domain_allowlist_for_blocklist='1'
	uci -q set sheepfold.global.domain_allowlist_for_blocklist_default_migrated='1'
fi
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
ensure_global_option log_storage 'ram'
ensure_global_option log_cache_path '/tmp/sheepfold/events.log'
uci -q get sheepfold.no_restrictions >/dev/null || uci -q set sheepfold.no_restrictions='group'
uci -q set sheepfold.no_restrictions.name='Без ограничений'
uci -q set sheepfold.no_restrictions.protected='1'
uci -q set sheepfold.no_restrictions.auto_assignable='1'
uci -q set sheepfold.no_restrictions.description='Trusted home infrastructure devices that should not be limited unless they are blocklisted'
uci -q get sheepfold.child_1 >/dev/null || uci -q set sheepfold.child_1='group'
uci -q set sheepfold.child_1.name='Ребёнок номер 1'
uci -q set sheepfold.child_1.protected='0'
uci -q set sheepfold.child_1.auto_assignable='0'
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
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold enable || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold restart || true
exit 0
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/sheepfold
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWRT buildroot signature
