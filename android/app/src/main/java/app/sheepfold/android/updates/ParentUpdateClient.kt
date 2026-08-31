package app.sheepfold.android.updates

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

/** Ограниченный foreground transport без Bearer роутера, cookies и бесконечных повторов. */
internal class ParentUpdateClient(
    private val connectionFactory: (String) -> HttpsURLConnection = { URL(it).openConnection() as HttpsURLConnection }
) {
    suspend fun latestRelease(): ParentRelease? = withContext(Dispatchers.IO) {
        val http = open(ParentUpdatePolicy.releasesUrl)
        try {
            if (http.responseCode != 200) throw IOException("release_http")
            val output = ByteArrayOutputStream()
            http.inputStream.use { input ->
                val buffer = ByteArray(8192)
                var count = 0L
                val started = System.nanoTime()
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val bytes = input.read(buffer)
                    if (bytes < 0) break
                    count += bytes
                    if (count > ParentUpdatePolicy.maxMetadataBytes || elapsedSeconds(started) > 30) throw IOException("release_limit")
                    output.write(buffer, 0, bytes)
                }
            }
            parseReleases(output.toString(Charsets.UTF_8.name()))
        } finally { http.disconnect() }
    }

    suspend fun download(release: ParentRelease, target: File, onProgress: suspend (Int) -> Unit) = withContext(Dispatchers.IO) {
        require(ParentUpdatePolicy.release("sheepfold-parent-v${release.version}.apk", release.url, release.size, "sha256:${release.sha256}") == release)
        val http = openDownload(release.url)
        try {
            if (http.responseCode != 200) throw IOException("asset_http")
            val announced = http.contentLengthLong
            if (announced >= 0 && announced != release.size) throw IOException("asset_size")
            val hash = MessageDigest.getInstance("SHA-256")
            http.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    var count = 0L
                    var previous = -1
                    val started = System.nanoTime()
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val bytes = input.read(buffer)
                        if (bytes < 0) break
                        count += bytes
                        if (count > release.size || elapsedSeconds(started) > 300) throw IOException("asset_limit")
                        output.write(buffer, 0, bytes)
                        hash.update(buffer, 0, bytes)
                        val percent = (count * 100 / release.size).toInt()
                        if (percent != previous) { onProgress(percent); previous = percent }
                    }
                    if (count != release.size || hash.digest().hex() != release.sha256) throw IOException("asset_digest")
                }
            }
        } finally { http.disconnect() }
    }

    private fun open(url: String): HttpsURLConnection = connectionFactory(url).apply {
        instanceFollowRedirects = false
        connectTimeout = 5_000
        readTimeout = 15_000
        useCaches = false
        setRequestProperty("User-Agent", "Sheepfold-Parent-Updater")
        setRequestProperty("Accept", if (url == ParentUpdatePolicy.releasesUrl) "application/vnd.github+json" else "application/octet-stream")
        setRequestProperty("Accept-Encoding", "identity")
    }

    private suspend fun openDownload(initial: String): HttpsURLConnection {
        var url = initial
        repeat(4) {
            currentCoroutineContext().ensureActive()
            if (!ParentUpdatePolicy.allowedDownloadUrl(url)) throw IOException("asset_origin")
            val http = open(url)
            try {
                if (http.responseCode !in listOf(301, 302, 303, 307, 308)) return http
                val location = http.getHeaderField("Location") ?: throw IOException("asset_redirect")
                url = URL(URL(url), location).toString()
            } catch (error: Exception) {
                http.disconnect()
                throw error
            }
            http.disconnect()
        }
        throw IOException("asset_redirect_limit")
    }

    private fun elapsedSeconds(started: Long) = (System.nanoTime() - started) / 1_000_000_000
}

internal fun parseReleases(body: String): ParentRelease? {
    val releases = JSONArray(body)
    if (releases.length() > 20) throw IOException("release_count")
    val candidates = mutableListOf<ParentRelease>()
    for (index in 0 until releases.length()) {
        val item = releases.getJSONObject(index)
        if (item.opt("draft") != false || item.opt("prerelease") != false) continue
        val assets = item.optJSONArray("assets") ?: continue
        if (assets.length() > 100) throw IOException("asset_count")
        for (assetIndex in 0 until assets.length()) {
            val asset = assets.getJSONObject(assetIndex)
            if (asset.optString("state") != "uploaded") continue
            ParentUpdatePolicy.release(asset.optString("name"), asset.optString("browser_download_url"),
                asset.optLong("size", -1), asset.optString("digest"))?.let(candidates::add)
        }
    }
    return candidates.maxWithOrNull { a, b -> ParentUpdatePolicy.compareVersions(a.version, b.version) ?: 0 }
}

internal fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }
