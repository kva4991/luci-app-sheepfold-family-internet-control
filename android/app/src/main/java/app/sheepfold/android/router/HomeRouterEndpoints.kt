package app.sheepfold.android.router

import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URI

/** Только адреса из успешного закреплённого HTTPS-ответа; подсеть задаёт порядок, не доверие. §homen01 */
object HomeRouterEndpoints {
    private const val maxHeaderLength = 1024
    private const val maxEndpoints = 4

    fun parse(header: String?): List<String>? {
        if (header.isNullOrBlank() || header.length > maxHeaderLength) return null
        val items = header.split(',')
        if (items.size > maxEndpoints) return null
        val endpoints = items.map { value ->
            val uri = runCatching { URI(value.trim()) }.getOrNull() ?: return null
            if (uri.scheme != "https" || uri.rawUserInfo != null || uri.rawQuery != null ||
                uri.rawFragment != null || uri.port !in 1..65535 ||
                uri.rawPath != "/cgi-bin/sheepfold-api" || !isPrivateIpv4(uri.host)) return null
            uri.toASCIIString()
        }
        return endpoints.distinct()
    }

    fun order(current: String, saved: List<String>, subnets: List<Pair<String, Int>>): List<String> =
        (listOf(current) + saved).distinct().sortedBy { endpoint ->
            val host = runCatching { URI(endpoint).host }.getOrNull()
            if (subnets.any { (address, prefix) -> sameSubnet(host, address, prefix) }) 0 else 1
        }

    fun mayRetry(method: String, error: Throwable): Boolean = method == "GET" &&
        (error is ConnectException || error is NoRouteToHostException || error is SocketTimeoutException ||
            error is RouterHttpException && error.statusCode == 404)

    private fun ipv4(host: String?): Long? {
        val parts = host?.split('.')?.takeIf { it.size == 4 } ?: return null
        return parts.fold(0L) { result, part ->
            if (part.isEmpty() || part.any { it !in '0'..'9' } || (part.length > 1 && part[0] == '0')) return null
            val value = part.toIntOrNull()?.takeIf { it in 0..255 } ?: return null
            (result shl 8) or value.toLong()
        }
    }

    private fun isPrivateIpv4(host: String?): Boolean {
        val value = ipv4(host) ?: return false
        return value ushr 24 == 10L || value ushr 20 == 0xac1L || value ushr 16 == 0xc0a8L
    }

    private fun sameSubnet(host: String?, address: String, prefix: Int): Boolean {
        if (prefix !in 1..32) return false
        val first = ipv4(host) ?: return false
        val second = ipv4(address) ?: return false
        return first ushr (32 - prefix) == second ushr (32 - prefix)
    }
}
