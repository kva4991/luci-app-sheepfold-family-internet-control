package app.sheepfold.android.updates

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.sheepfold.android.R
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

internal enum class UpdatePhase { IDLE, CHECKING, AVAILABLE, DOWNLOADING, CANCELLING, READY, CURRENT, UNPUBLISHED, FAILED }
internal data class ParentUpdateState(
    val phase: UpdatePhase = UpdatePhase.IDLE,
    val release: ParentRelease? = null,
    val percent: Int = 0,
    val message: Int? = null
)

/** Переживает поворот экрана; не хранит семейные данные и не запускает фоновые проверки. */
class ParentAppUpdateModel(application: Application) : AndroidViewModel(application) {
    private val client = ParentUpdateClient()
    private val installer = ParentUpdateInstaller(application)
    private val directory = File(application.cacheDir, "app-updates")
    private val pending = File(directory, "parent.part")
    private val ready = File(directory, "parent.apk")
    private var job: Job? = null
    val version = installer.installed.versionName
    internal var state by mutableStateOf(ParentUpdateState())
        private set

    fun check() {
        if (job?.isCompleted == false) return
        state = ParentUpdateState(UpdatePhase.CHECKING)
        job = viewModelScope.launch {
            try {
                val release = client.latestRelease()
                state = when {
                    release == null -> ParentUpdateState(UpdatePhase.UNPUBLISHED)
                    ParentUpdatePolicy.compareVersions(release.version, version) == null ->
                        ParentUpdateState(UpdatePhase.FAILED, message = R.string.app_update_version_unknown)
                    ParentUpdatePolicy.compareVersions(release.version, version)!! <= 0 -> ParentUpdateState(UpdatePhase.CURRENT)
                    else -> ParentUpdateState(UpdatePhase.AVAILABLE, release)
                }
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) { state = ParentUpdateState(UpdatePhase.FAILED, message = R.string.app_update_check_failed) }
        }
    }

    fun download() {
        // Отменённый Job уже не active, но его finally ещё может удалять общий .part.
        if (job?.isCompleted == false || state.phase != UpdatePhase.AVAILABLE) return
        val release = state.release ?: return
        state = ParentUpdateState(UpdatePhase.DOWNLOADING, release)
        job = viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    check(directory.isDirectory || directory.mkdirs())
                    check(!pending.exists() || pending.delete())
                    check(!ready.exists() || ready.delete())
                    check(directory.usableSpace > release.size + 8 * 1024 * 1024)
                }
                client.download(release, pending) { percent ->
                    withContext(Dispatchers.Main) { state = state.copy(percent = percent) }
                }
                withContext(Dispatchers.IO) {
                    installer.verify(pending, release)
                    check(pending.renameTo(ready))
                }
                state = ParentUpdateState(UpdatePhase.READY, release)
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) {
                state = ParentUpdateState(UpdatePhase.AVAILABLE, release, message = R.string.app_update_download_failed)
            } finally {
                withContext(kotlinx.coroutines.NonCancellable) {
                    withContext(Dispatchers.IO) { pending.delete() }
                    if (state.phase == UpdatePhase.CANCELLING) state = ParentUpdateState(UpdatePhase.AVAILABLE, release)
                }
            }
        }
    }

    fun cancelDownload() {
        if (state.phase != UpdatePhase.DOWNLOADING) return
        state = state.copy(phase = UpdatePhase.CANCELLING)
        job?.cancel()
    }

    internal suspend fun installationIntent(): Intent {
        check(state.phase == UpdatePhase.READY)
        installer.permissionIntent()?.let {
            state = state.copy(message = R.string.app_update_permission)
            return it
        }
        val release = checkNotNull(state.release)
        // Cache может быть очищен Android между скачиванием и нажатием; перепроверяем до передачи.
        withContext(Dispatchers.IO) { installer.verify(ready, release) }
        state = state.copy(message = R.string.app_update_confirm)
        return installer.installIntent(ready)
    }

    internal fun installationFailed() {
        state = ParentUpdateState(UpdatePhase.AVAILABLE, state.release, message = R.string.app_update_install_failed)
    }
}
