// Выполняет настоящие классы сессии с синтетическими credential и платформенными заглушками
// Проверяет атомарность удаления, но не Android lifecycle, Keystore или сеть
import android.content.Context
import app.sheepfold.android.router.*
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

fun connection(token: String, leaf: String? = null): RouterConnectionRequest =
    RouterConnectionRequest("https://192.168.7.1:5201", "Synthetic", administratorLogin = "testParent").also {
        it.bearerToken = token
        it.deviceId = "1"
        it.deviceMac = "02:00:00:00:00:11"
        it.tlsPinSha256 = leaf
        it.tlsSpkiSha256 = "a".repeat(64)
    }

fun main() {
    val context = Context()
    val old = connection("synthetic-old-token")
    val fresh = connection("synthetic-fresh-token")
    val failure = RouterSessionFailure.fromHttp(401, "token_invalid")!!
    SheepfoldConnectionStore.save(context, old)
    SheepfoldConnectionStore.save(context, fresh)
    RouterSessionEvents.report(context, failure, old)
    check(SheepfoldConnectionStore.read(context)!!.bearerToken == fresh.bearerToken)
    check(SheepfoldConnectionStore.consumePairingLoss(context) == null)
    println("PASS stale failure preserves fresh pairing")

    RouterSessionEvents.report(context, failure, fresh)
    check(SheepfoldConnectionStore.read(context) == null)
    check(SheepfoldConnectionStore.consumePairingLoss(context) == RouterPairingLoss.TOKEN_REJECTED)
    RouterSessionEvents.report(context, failure, fresh)
    check(SheepfoldConnectionStore.consumePairingLoss(context) == null)
    println("PASS current failure clears exactly once")

    repeat(50) {
        SheepfoldConnectionStore.save(context, old)
        val start = CountDownLatch(1)
        val writer = thread { start.await(); SheepfoldConnectionStore.save(context, fresh) }
        val reporter = thread { start.await(); RouterSessionEvents.report(context, failure, old) }
        start.countDown()
        writer.join()
        reporter.join()
        check(SheepfoldConnectionStore.read(context)!!.bearerToken == fresh.bearerToken)
        check(SheepfoldConnectionStore.consumePairingLoss(context) == null)
    }
    println("PASS concurrent save and stale failure (50 interleavings)")

    SheepfoldConnectionStore.updateApiUrl(context, "https://192.168.8.1:5201", fresh)
    check(SheepfoldConnectionStore.clearForPairingIfCurrent(context, fresh, RouterPairingLoss.ACCESS_REVOKED))
    println("PASS endpoint failover remains the same session")

    SheepfoldConnectionStore.save(context, connection("synthetic-leaf-token", "b".repeat(64)))
    SheepfoldConnectionStore.save(context, fresh)
    val stored = SheepfoldConnectionStore.read(context)!!
    check(stored.tlsPinSha256 == null)
    check(stored.tlsSpkiSha256 == fresh.tlsSpkiSha256)
    check(SheepfoldConnectionStore.clearForPairingIfCurrent(context, fresh, RouterPairingLoss.TOKEN_REJECTED))
    println("PASS SPKI-only pairing does not inherit stale leaf pin")
}
