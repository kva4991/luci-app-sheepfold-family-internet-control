include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sheepfold-family-internet-control
PKG_VERSION:=0.1.0
PKG_RELEASE:=28
PKG_LICENSE:=MIT
PKG_MAINTAINER:=kva4991
SHEEPFOLD_UI_ASSET_VERSION:=$(PKG_VERSION)-$(PKG_RELEASE)

LUCI_TITLE:=Sheepfold Family Internet Control
LUCI_DESCRIPTION:=Family internet access control for OpenWRT with LuCI, Android, and bot support.
LUCI_DEPENDS:=+luci-base +firewall4 +rpcd +uci +uclient-fetch +ca-bundle

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
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
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
exit 0
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/sheepfold
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWRT buildroot signature
