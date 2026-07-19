package app.sheepfold.android.router

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.UnknownHostException

/** Разрешает имя роутера один раз и не выпускает административный API из локальной сети. §dnsbind1 */
object LocalRouterAddress {
    fun resolvedUrlHosts(host: String, allowHostname: Boolean): List<String> {
        val normalizedHost = normalizeHost(host)
        require(normalizedHost.isNotBlank()) { "Адрес роутера не указан" }
        require(allowHostname || isIpLiteral(normalizedHost)) {
            "Для ручного подключения укажите локальный IP-адрес роутера, а не сетевое имя"
        }

        val addresses = try {
            InetAddress.getAllByName(normalizedHost).toList()
        } catch (_: UnknownHostException) {
            throw IllegalArgumentException("Не удалось определить локальный IP-адрес роутера")
        }
        val localAddresses = addresses
            .filter(::isLocalAddress)
            .distinctBy { it.hostAddress.orEmpty() }
            .sortedBy { if (it is Inet4Address) 0 else 1 }

        require(localAddresses.isNotEmpty()) {
            "Адрес Sheepfold не относится к локальной сети. Подключитесь к домашнему Wi-Fi или Ethernet"
        }
        return localAddresses.map(::urlHost)
    }

    fun isLocalIpLiteral(host: String): Boolean {
        val address = parseLiteral(normalizeHost(host)) ?: return false
        return isLocalAddress(address)
    }

    fun isIpLiteral(host: String): Boolean = parseLiteral(normalizeHost(host)) != null

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

    private fun isLocalAddress(address: InetAddress): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isMulticastAddress) return false
        if (address.isSiteLocalAddress || address.isLinkLocalAddress) return true
        if (address is Inet4Address) {
            val octets = address.address.map { it.toInt() and 0xff }
            // Диапазон RFC 6598 встречается между домашним роутером и сетью оператора,
            // но не маршрутизируется как обычный публичный IPv4. §dnsbind1
            return octets[0] == 100 && octets[1] in 64..127
        }
        if (address is Inet6Address) {
            val firstByte = address.address.firstOrNull()?.toInt()?.and(0xff) ?: return false
            return firstByte and 0xfe == 0xfc
        }
        return false
    }

    private fun urlHost(address: InetAddress): String {
        val host = address.hostAddress
            ?.replace("%", "%25")
            ?.takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException("Не удалось получить локальный IP-адрес роутера")
        return if (address is Inet6Address) "[$host]" else host
    }

    private fun normalizeHost(host: String): String = host.trim()
        .removePrefix("[")
        .removeSuffix("]")
}
