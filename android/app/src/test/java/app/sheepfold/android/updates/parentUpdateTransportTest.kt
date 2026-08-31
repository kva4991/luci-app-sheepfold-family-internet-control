package app.sheepfold.android.updates

// Исполняет потоковое скачивание на fake HTTPS: ни DNS, ни GitHub, ни системного installer.
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

class ParentUpdateTransportTest {
    private val url = "https://github.com/${ParentUpdatePolicy.repository}/releases/download/v2/sheepfold-parent-v0.2.0.apk"
    private val payload = ByteArray(70_000) { (it % 251).toByte() }
    private val release = ParentRelease("0.2.0", url, payload.size.toLong(), MessageDigest.getInstance("SHA-256").digest(payload).hex())

    private class FakeHttps(val bytes: ByteArray, val status: Int = 200, val location: String? = null) : HttpsURLConnection(URL("https://example.invalid")) {
        var disconnected = false
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun connect() = Unit
        override fun getResponseCode() = status
        override fun getInputStream() = ByteArrayInputStream(bytes)
        override fun getContentLengthLong() = -1L
        override fun getHeaderField(name: String?) = if (name == "Location") location else null
        override fun getCipherSuite() = "fixture"
        override fun getLocalCertificates(): Array<Certificate>? = null
        override fun getServerCertificates(): Array<Certificate> = emptyArray()
    }

    private fun withTarget(block: (File) -> Unit) {
        val file = File.createTempFile("sheepfold-update-", ".fixture")
        try { block(file) } finally { file.delete() }
    }

    @Test fun validDownloadIsBoundedAndReportsProgress() = withTarget { target ->
        val http = FakeHttps(payload)
        val progress = mutableListOf<Int>()
        runBlocking { ParentUpdateClient { http }.download(release, target) { progress += it } }
        assertArrayEquals(payload, target.readBytes())
        assertEquals(100, progress.last())
        assertTrue(http.disconnected)
        assertFalse(http.instanceFollowRedirects)
        assertNull(http.getRequestProperty("Authorization"))
    }

    @Test fun wrongDigestAndTruncationAndOversizeFail() {
        for (bytes in listOf(payload.copyOf(100), payload + byteArrayOf(1), payload.copyOf().apply { this[0] = 99 })) {
            withTarget { target ->
                val http = FakeHttps(bytes)
                assertThrows(Exception::class.java) {
                    runBlocking { ParentUpdateClient { http }.download(release, target) {} }
                }
                assertTrue(http.disconnected)
                assertTrue(target.length() <= release.size)
            }
        }
    }

    @Test fun foreignRedirectIsRejectedBeforeOpeningDestination() = withTarget { target ->
        val opened = mutableListOf<String>()
        val http = FakeHttps(byteArrayOf(), 302, "http://127.0.0.1/private")
        assertThrows(Exception::class.java) {
            runBlocking { ParentUpdateClient { opened += it; http }.download(release, target) {} }
        }
        assertEquals(listOf(url), opened)
        assertTrue(http.disconnected)
    }

    @Test fun officialRedirectWorksButLoopIsBounded() = withTarget { target ->
        val redirect = FakeHttps(byteArrayOf(), 302, "https://release-assets.githubusercontent.com/asset?signature=fixture")
        val data = FakeHttps(payload)
        runBlocking { ParentUpdateClient { if (it == url) redirect else data }.download(release, target) {} }
        assertTrue(redirect.disconnected)
        assertTrue(data.disconnected)
        var requests = 0
        assertThrows(Exception::class.java) {
            runBlocking { ParentUpdateClient { requests++; redirect }.download(release, target) {} }
        }
        assertEquals(4, requests)
    }

    @Test fun cancellationClosesConnectionAndStopsWriting() = withTarget { target ->
        val http = FakeHttps(payload)
        assertThrows(CancellationException::class.java) {
            runBlocking { ParentUpdateClient { http }.download(release, target) { throw CancellationException("fixture") } }
        }
        assertTrue(http.disconnected)
        assertTrue(target.length() < release.size)
    }
}
