package com.example.sheepfoldchild.data

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/** Не позволяет детскому локальному API превратиться в запрос к внешнему серверу. §dnsbind1 */
object ChildLocalRouterAddress {
    fun isLocalIpLiteral(host: String): Boolean {
        val address = parseLiteral(normalizeHost(host)) ?: return false
        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isMulticastAddress) return false
        if (address.isSiteLocalAddress || address.isLinkLocalAddress) return true
        if (address is Inet4Address) {
            val octets = address.address.map { it.toInt() and 0xff }
            return octets[0] == 100 && octets[1] in 64..127
        }
        if (address is Inet6Address) {
            val firstByte = address.address.firstOrNull()?.toInt()?.and(0xff) ?: return false
            return firstByte and 0xfe == 0xfc
        }
        return false
    }

    private fun parseLiteral(host: String): InetAddress? {
        if (host.isBlank()) return null
        if (host.contains(':')) {
            return runCatching { InetAddress.getByName(host.replace("%25", "%")) }
                .getOrNull()
                ?.takeIf { it is Inet6Address }
        }

        val octets = host.split('.')
        if (octets.size != 4) return null
        val bytes = octets.map { octet ->
            if (octet.isEmpty() || octet.length > 3 || octet.any { !it.isDigit() }) return null
            val value = octet.toIntOrNull()?.takeIf { it in 0..255 } ?: return null
            value.toByte()
        }.toByteArray()
        return InetAddress.getByAddress(bytes)
    }

    private fun normalizeHost(host: String): String = host.trim()
        .removePrefix("[")
        .removeSuffix("]")
}
