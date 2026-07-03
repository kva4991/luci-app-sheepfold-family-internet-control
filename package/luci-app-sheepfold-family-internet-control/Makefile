include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sheepfold-family-internet-control
PKG_VERSION:=0.1.0
PKG_RELEASE:=18
PKG_LICENSE:=MIT
PKG_MAINTAINER:=kva4991
SHEEPFOLD_UI_ASSET_VERSION:=$(PKG_VERSION)-$(PKG_RELEASE)

LUCI_TITLE:=Sheepfold Family Internet Control
LUCI_DESCRIPTION:=Family internet access control for OpenWRT with LuCI, Android, and bot support.
LUCI_DEPENDS:=+firewall4 +rpcd +uci +uclient-fetch +ca-bundle +jsonfilter

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
uci -q set sheepfold.global.ui_asset_version='$(SHEEPFOLD_UI_ASSET_VERSION)'
uci -q commit sheepfold
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWRT buildroot signature
