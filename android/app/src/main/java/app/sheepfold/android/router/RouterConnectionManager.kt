package app.sheepfold.android.router

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.RouteInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.URLEncoder
import java.net.URL

data class RouterConnectionRequest(
    val apiUrl: String,
    val routerName: String,
    val temporaryPassword: String? = null,
    val administratorLogin: String? = null
)

data class LocalSheepfoldDiscovery(
    val gatewayHost: String,
    val apiUrl: String,
    val routerName: String
)

private data class SheepfoldProbe(
    val url: String,
    val apiUrl: String
)

class RouterConnectionManager {
    fun getAutoRouterAddress(): String? = "192.168.1.1"

    fun adminSetupLink(gatewayHost: String? = getAutoRouterAddress()): String {
        val host = gatewayHost.orEmpty().ifBlank { "192.168.1.1" }
        return "http://$host/cgi-bin/luci/admin/services/sheepfold?view=admins&action=pair&admin=first"
    }

    fun parseQrPayload(payload: String): RouterConnectionRequest {
        val trimmed = payload.trim()
        if (trimmed.startsWith("{")) {
            val json = JSONObject(trimmed)
            val rawUrl = json.optString("apiUrl")
                .ifBlank { json.optString("routerUrl") }
                .ifBlank { json.optString("routerAddress") }
                .ifBlank { json.optString("host") }
            val apiUrl = normalizeRouterUrl(rawUrl)
            val routerName = json.optString("routerName")
                .ifBlank { json.optString("name") }
                .ifBlank { hostName(apiUrl) }
            val temporaryPassword = json.optString("temporaryPassword")
                .ifBlank { json.optString("pairingToken") }
                .ifBlank { json.optString("token") }
                .ifBlank { json.optString("code") }
                .ifBlank { null }
            val administratorLogin = json.optString("administratorLogin")
                .ifBlank { json.optString("adminLogin") }
                .ifBlank { json.optString("login") }
                .ifBlank { null }
            return RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = routerName,
                temporaryPassword = temporaryPassword,
                administratorLogin = administratorLogin
            )
        }

        if (trimmed.startsWith("SF1|")) {
            val fields = trimmed.split('|')
                .drop(1)
                .mapNotNull { field ->
                    val separatorIndex = field.indexOf('=')
                    if (separatorIndex <= 0) {
                        null
                    } else {
                        field.substring(0, separatorIndex) to field.substring(separatorIndex + 1)
                    }
                }
                .toMap()

            val baseUrl = normalizeRouterUrl(withOptionalPort(fields["h"].orEmpty(), fields["p"].orEmpty()))
            val apiPath = fields["api"].orEmpty().trim().ifBlank { "/cgi-bin/sheepfold-api" }
            val apiUrl = when {
                apiPath.isBlank() -> baseUrl
                apiPath.startsWith("http://") || apiPath.startsWith("https://") -> normalizeRouterUrl(apiPath)
                apiPath.startsWith("/") -> "$baseUrl$apiPath"
                else -> "$baseUrl/$apiPath"
            }

            return RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = fields["name"].orEmpty().ifBlank { hostName(baseUrl) },
                temporaryPassword = fields["c"].orEmpty()
                    .ifBlank { fields["token"].orEmpty() }
                    .ifBlank { null },
                administratorLogin = fields["u"].orEmpty().ifBlank { null }
            )
        }

        val apiUrl = normalizeRouterUrl(trimmed)
        return RouterConnectionRequest(apiUrl = apiUrl, routerName = hostName(apiUrl))
    }

    suspend fun testConnection(request: RouterConnectionRequest): Boolean = withContext(Dispatchers.IO) {
        if (!request.temporaryPassword.isNullOrBlank() && !request.administratorLogin.isNullOrBlank()) {
            return@withContext pairAdminDevice(request)
        }

        val connection = URL(request.apiUrl).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connect()
            connection.responseCode in 200..499
        } finally {
            connection.disconnect()
        }
    }

    private fun pairAdminDevice(request: RouterConnectionRequest): Boolean {
        val pairUrl = "${request.apiUrl.trimEnd('/')}/pair"
        val body = listOf(
            "login" to request.administratorLogin.orEmpty(),
            "code" to request.temporaryPassword.orEmpty(),
            "client" to "android"
        ).joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
        val connection = URL(pairUrl).openConnection() as HttpURLConnection

        try {
            connection.connectTimeout = 3500
            connection.readTimeout = 3500
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Sheepfold Android")
            connection.outputStream.use { output ->
                output.write(body.toByteArray(Charsets.UTF_8))
            }

            val responseCode = connection.responseCode
            val responseBody = (if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            })?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            if (responseCode in 200..299) {
                val response = runCatching { JSONObject(responseBody) }.getOrElse {
                    throw IllegalStateException("Роутер вернул некорректный ответ сопряжения")
                }
                if (!response.optBoolean("ok", false) || !response.optBoolean("paired", false)) {
                    throw IllegalStateException(apiErrorFromJson(response).ifBlank {
                        "Роутер не подтвердил сопряжение"
                    })
                }
                val bearer = response.optString("token").trim()
                if (bearer.isBlank()) {
                    throw IllegalStateException("Роутер не выдал токен административной сессии")
                }
                request.bearerToken = bearer
                return true
            }

            throw IllegalStateException(readApiError(responseBody, responseCode).ifBlank {
                "Не удалось выполнить сопряжение с роутером"
            })
        } finally {
            connection.disconnect()
        }
    }

    suspend fun discoverLocalSheepfold(context: Context): LocalSheepfoldDiscovery? = withContext(Dispatchers.IO) {
        val gatewayHost = currentGatewayHost(context) ?: getAutoRouterAddress() ?: return@withContext null
        val apiBase = "http://$gatewayHost/cgi-bin/luci/admin/services/sheepfold/api"
        val probeUrls = listOf(
            SheepfoldProbe(
                url = "$apiBase/ping",
                apiUrl = apiBase
            ),
            SheepfoldProbe(
                url = "http://$gatewayHost/cgi-bin/luci/admin/sheepfold/api/ping",
                apiUrl = "http://$gatewayHost/cgi-bin/luci/admin/sheepfold/api"
            ),
            SheepfoldProbe(
                url = "http://$gatewayHost/.well-known/sheepfold.json",
                apiUrl = apiBase
            ),
            SheepfoldProbe(
                url = "http://$gatewayHost/luci-static/resources/view/sheepfold/overview.js",
                apiUrl = apiBase
            )
        )

        probeUrls.firstNotNullOfOrNull { probe ->
            probeSheepfold(probe, gatewayHost)
        }
    }

    private fun normalizeRouterUrl(value: String): String {
        require(value.isNotBlank()) { "QR код не содержит адрес роутера" }
        val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) {
            value
        } else {
            "http://$value"
        }
        return withScheme.trimEnd('/')
    }

    private fun withOptionalPort(host: String, port: String): String {
        val trimmedPort = port.trim()
        if (trimmedPort.isBlank()) {
            return host
        }

        val withScheme = if (host.startsWith("http://") || host.startsWith("https://")) {
            host
        } else {
            "http://$host"
        }
        val url = URL(withScheme)
        if (url.port != -1) {
            return host
        }

        return "${url.protocol}://${url.host}:$trimmedPort"
    }

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun readApiError(body: String, responseCode: Int): String {
        val json = runCatching { JSONObject(body) }.getOrNull()
        return json?.let(::apiErrorFromJson).orEmpty()
            .ifBlank { body.trim() }
            .ifBlank { "HTTP $responseCode" }
    }

    private fun apiErrorFromJson(json: JSONObject): String {
        val structured = json.optJSONObject("error")
        return structured?.optString("message").orEmpty()
            .ifBlank { json.optString("message") }
            .ifBlank {
                val error = json.opt("error")
                if (error is String) error else ""
            }
    }

    private fun hostName(apiUrl: String): String {
        return runCatching { URL(apiUrl).host }
            .getOrDefault(apiUrl)
            .ifBlank { "router" }
    }

    private fun probeSheepfold(probe: SheepfoldProbe, gatewayHost: String): LocalSheepfoldDiscovery? {
        val connection = URL(probe.url).openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 1800
            connection.readTimeout = 1800
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connect()
            if (connection.responseCode !in 200..299) {
                return null
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            if (!body.contains("sheepfold", ignoreCase = true)) {
                return null
            }

            val json = runCatching { JSONObject(body) }.getOrNull()
            val routerName = json?.optString("routerName")
                ?.ifBlank { json.optString("name") }
                .orEmpty()
                .ifBlank { gatewayHost }
            val apiUrl = json?.let { discoveryApiUrl(it, gatewayHost, probe.apiUrl) } ?: probe.apiUrl

            LocalSheepfoldDiscovery(
                gatewayHost = gatewayHost,
                apiUrl = apiUrl,
                routerName = routerName
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun currentGatewayHost(context: Context): String? {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val linkProperties = connectivityManager.getLinkProperties(connectivityManager.activeNetwork)
            ?: return null

        return defaultIpv4Route(linkProperties)
            ?.gateway
            ?.hostAddress
    }

    private fun discoveryApiUrl(json: JSONObject, gatewayHost: String, fallbackApiUrl: String): String {
        val absoluteApiUrl = json.optString("apiUrl").trim()
        if (absoluteApiUrl.startsWith("http://") || absoluteApiUrl.startsWith("https://")) {
            return normalizeRouterUrl(absoluteApiUrl)
        }

        val port = json.optString("appPort").trim()
        val path = json.optString("apiPath")
            .ifBlank { json.optString("apiBase") }
            .ifBlank { "/cgi-bin/sheepfold-api" }
        if (port.isNotBlank()) {
            val normalizedPath = if (path.startsWith("/")) path else "/$path"
            return "http://$gatewayHost:$port$normalizedPath".trimEnd('/')
        }

        return fallbackApiUrl
    }

    private fun defaultIpv4Route(linkProperties: LinkProperties): RouteInfo? {
        return linkProperties.routes.firstOrNull { route ->
            route.isDefaultRoute && route.gateway is Inet4Address
        }
    }
}
