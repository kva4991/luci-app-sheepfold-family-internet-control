package app.sheepfold.android.ui.main

// Пустая Activity: состояния updater и разбор GitHub JSON. Не скачивает и не устанавливает APK.
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.updates.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentAppUpdateTest : ParentUiFixture() {
    private val release = ParentRelease("0.2.0", "https://example.invalid/unused", 1024, "a".repeat(64))

    @Test fun checkButtonIsSeparateAndExplicit() {
        var checks = 0
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(), onCheck = { checks++ }, onDownload = {}, onCancel = {}, onInstall = {}) }
        compose.onNodeWithText(text(R.string.app_update_installed, "0.1.56")).assertIsDisplayed()
        assertEquals(0, checks)
        label(R.string.app_update_check).performClick()
        assertEquals(1, checks)
    }

    @Test fun downloadClickStartsPreparationBeforeAnySystemInstaller() {
        var downloads = 0
        var installs = 0
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(UpdatePhase.AVAILABLE, release), onCheck = {},
            onDownload = { downloads++ }, onCancel = {}, onInstall = { installs++ }) }
        label(R.string.app_update_download).performClick()
        assertEquals(1, downloads)
        assertEquals(0, installs)
        label(R.string.app_update_install).assertDoesNotExist()
    }

    @Test fun downloadingCanBeCancelledWithoutCheckingAgain() {
        var cancels = 0
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(UpdatePhase.DOWNLOADING, release, 42),
            onCheck = {}, onDownload = {}, onCancel = { cancels++ }, onInstall = {}) }
        label(R.string.app_update_check).assertDoesNotExist()
        label(R.string.action_cancel).performClick()
        assertEquals(1, cancels)
    }

    @Test fun readyUpdateOffersRetryWithoutDownloadingAgain() {
        var installs = 0
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(UpdatePhase.READY, release),
            onCheck = {}, onDownload = {}, onCancel = {}, onInstall = { installs++ }) }
        assertEquals(0, installs)
        label(R.string.app_update_install).performClick()
        assertEquals(1, installs)
        savePanelScreenshot("parent-update.png")
    }

    @Test fun helpDoesNotStartUpdate() {
        var checks = 0
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(), onCheck = { checks++ },
            onDownload = {}, onCancel = {}, onInstall = {}) }
        icon(R.string.app_update_help_title).performClick()
        label(R.string.app_update_help).assertIsDisplayed()
        assertEquals(0, checks)
        label(R.string.action_close).performClick()
    }

    @Test fun cancellationHidesRetryUntilFileCleanupCompletes() {
        show { ParentAppUpdateContent("0.1.56", ParentUpdateState(UpdatePhase.CANCELLING, release),
            onCheck = {}, onDownload = {}, onCancel = {}, onInstall = {}) }
        label(R.string.app_update_cancelling).assertIsDisplayed()
        label(R.string.app_update_download).assertDoesNotExist()
        label(R.string.app_update_check).assertDoesNotExist()
        label(R.string.app_update_install).assertDoesNotExist()
    }

    @Test fun preparationHidesAllRepeatedActions() {
        show { ParentAppUpdateContent("0.1.58", ParentUpdateState(UpdatePhase.PREPARING, release),
            onCheck = {}, onDownload = {}, onCancel = {}, onInstall = {}) }
        label(R.string.app_update_preparing).assertIsDisplayed()
        label(R.string.app_update_download).assertDoesNotExist()
        label(R.string.app_update_check).assertDoesNotExist()
        label(R.string.app_update_install).assertDoesNotExist()
    }

    @Test fun fileProviderOnlySharesItsUpdateDirectory() {
        val context = compose.activity
        val authority = "${context.packageName}.updates"
        val file = java.io.File(context.cacheDir, "app-updates/parent.apk")
        val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)
        assertEquals("content", uri.scheme)
        assertThrows(IllegalArgumentException::class.java) {
            androidx.core.content.FileProvider.getUriForFile(context, authority, java.io.File(context.filesDir, "credentials.fixture"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            androidx.core.content.FileProvider.getUriForFile(context, authority, java.io.File(context.cacheDir, "outside.fixture"))
        }
    }

    @Test fun releaseParserIgnoresDraftChildAndUnsignedAssets() {
        fun asset(name: String, hash: String = "sha256:" + "a".repeat(64)) = JSONObject()
            .put("name", name).put("browser_download_url", "https://github.com/${ParentUpdatePolicy.repository}/releases/download/v2/$name")
            .put("state", "uploaded").put("size", 100).put("digest", hash)
        fun entry(draft: Boolean, prerelease: Boolean, vararg assets: JSONObject) = JSONObject()
            .put("draft", draft).put("prerelease", prerelease).put("assets", JSONArray(assets.toList()))
        val data = JSONArray().put(entry(true, false, asset("sheepfold-parent-v99.0.apk")))
            .put(entry(false, true, asset("sheepfold-parent-v99.0.apk")))
            .put(entry(false, false, asset("sheepfold-child-v99.0.apk"), asset("sheepfold-parent-v5.0.apk", ""),
                asset("sheepfold-parent-v0.1.9.apk"), asset("sheepfold-parent-v0.1.10.apk")))
        assertEquals("0.1.10", parseReleases(data.toString())?.version)
        assertNull(parseReleases(JSONArray().put(entry(false, false, asset("router.apk"))).toString()))
    }
}
