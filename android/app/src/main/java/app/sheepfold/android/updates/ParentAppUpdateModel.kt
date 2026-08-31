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
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.currentCoroutineContext
import java.io.File

internal enum class UpdatePhase {
    RESTORING, IDLE, CHECKING, AVAILABLE, DOWNLOADING, CANCELLING, READY,
    PREPARING, WAITING_PERMISSION, INSTALLING, CURRENT, UNPUBLISHED, FAILED
}
internal enum class UpdateDestination { PERMISSION, INSTALLER }
internal data class UpdateLaunch(val destination: UpdateDestination, val intent: Intent)
internal data class ParentUpdateState(
    val phase: UpdatePhase = UpdatePhase.IDLE,
    val release: ParentRelease? = null,
    val percent: Int = 0,
    val message: Int? = null
)

/** Сохраняет проверенный APK при выгрузке процесса, но не запускает фоновые проверки или установку. */
class ParentAppUpdateModel internal constructor(
    application: Application,
    private val client: ParentUpdateClient,
    private val installer: ParentUpdateInstallation,
    private val directory: File
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, ParentUpdateClient(),
        ParentUpdateInstaller(application), File(application.cacheDir, "app-updates"))

    private val pending = File(directory, "parent.part")
    private val ready = File(directory, "parent.apk")
    private val store = ParentUpdateStore(directory)
    private var job: Job? = null
    private var permissionResultPending = false
    val version = installer.installed.versionName
    internal var state by mutableStateOf(ParentUpdateState(UpdatePhase.RESTORING))
        private set
    internal var launchRequest by mutableStateOf<UpdateLaunch?>(null)
        private set
    internal var showUpdatePanel by mutableStateOf(false)
        private set

    init {
        job = viewModelScope.launch {
            try {
                val saved = withContext(Dispatchers.IO) {
                    pending.delete()
                    store.read()
                }
                if (saved == null || ParentUpdatePolicy.compareVersions(saved.release.version, version)?.let { it <= 0 } != false) {
                    discardFile()
                    state = ParentUpdateState()
                } else {
                    state = ParentUpdateState(UpdatePhase.RESTORING, saved.release)
                    if (verifyReady(saved.release)) {
                        showUpdatePanel = saved.permissionRequestedAt > 0
                        val waiting = saved.mayResumePermission(System.currentTimeMillis())
                        val allowed = installer.permissionIntent() == null
                        if (waiting && !allowed && !permissionResultPending) {
                            // Activity может восстановиться ещё под открытым экраном Settings.
                            state = ParentUpdateState(UpdatePhase.WAITING_PERMISSION, saved.release,
                                message = R.string.app_update_permission)
                        } else {
                            withContext(Dispatchers.IO) { store.write(SavedParentUpdate(saved.release)) }
                            state = ParentUpdateState(UpdatePhase.READY, saved.release)
                            if (waiting && allowed) prepareInstallation()
                        }
                    }
                }
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) {
                withContext(Dispatchers.IO) { store.clear() }
                state = ParentUpdateState(UpdatePhase.FAILED, message = R.string.app_update_download_failed)
            }
        }
    }

    fun check() {
        if (job?.isCompleted == false || launchRequest != null || state.phase in externalPhases) return
        val previous = state
        state = ParentUpdateState(UpdatePhase.CHECKING)
        job = viewModelScope.launch {
            try {
                val release = client.latestRelease()
                state = when {
                    release == null -> ParentUpdateState(UpdatePhase.UNPUBLISHED)
                    ParentUpdatePolicy.compareVersions(release.version, version) == null ->
                        ParentUpdateState(UpdatePhase.FAILED, message = R.string.app_update_version_unknown)
                    ParentUpdatePolicy.compareVersions(release.version, version)!! <= 0 -> ParentUpdateState(UpdatePhase.CURRENT)
                    release == previous.release && previous.phase == UpdatePhase.READY -> previous.copy(message = null)
                    else -> ParentUpdateState(UpdatePhase.AVAILABLE, release)
                }
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) {
                state = if (previous.phase == UpdatePhase.READY) previous.copy(message = R.string.app_update_check_failed)
                else ParentUpdateState(UpdatePhase.FAILED, message = R.string.app_update_check_failed)
            }
        }
    }

    fun download() {
        // Отменённый Job уже не active, но его finally ещё может удалять общий .part.
        if (job?.isCompleted == false || state.phase != UpdatePhase.AVAILABLE) return
        val release = state.release ?: return
        state = ParentUpdateState(UpdatePhase.DOWNLOADING, release)
        job = viewModelScope.launch {
            var downloaded = false
            try {
                withContext(Dispatchers.IO) {
                    check(directory.isDirectory || directory.mkdirs())
                    check(!pending.exists() || pending.delete())
                    check(!ready.exists() || ready.delete())
                    store.clear()
                    check(directory.usableSpace > release.size + 8 * 1024 * 1024)
                }
                client.download(release, pending) { percent ->
                    withContext(Dispatchers.Main) { state = state.copy(percent = percent) }
                }
                withContext(Dispatchers.IO) {
                    installer.verify(pending, release)
                    currentCoroutineContext().ensureActive()
                    check(pending.renameTo(ready))
                    store.write(SavedParentUpdate(release))
                }
                state = ParentUpdateState(UpdatePhase.READY, release)
                downloaded = true
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) {
                state = ParentUpdateState(UpdatePhase.AVAILABLE, release, message = R.string.app_update_download_failed)
            } finally {
                withContext(kotlinx.coroutines.NonCancellable) {
                    withContext(Dispatchers.IO) { pending.delete() }
                    if (state.phase == UpdatePhase.CANCELLING) state = ParentUpdateState(UpdatePhase.AVAILABLE, release)
                }
            }
            if (downloaded && state.phase == UpdatePhase.READY) prepareInstallation()
        }
    }

    fun cancelDownload() {
        if (state.phase != UpdatePhase.DOWNLOADING) return
        state = state.copy(phase = UpdatePhase.CANCELLING)
        job?.cancel()
    }

    internal fun install() {
        if (job?.isCompleted == false || state.phase != UpdatePhase.READY || launchRequest != null) return
        job = viewModelScope.launch { prepareInstallation() }
    }

    private suspend fun prepareInstallation() {
        val release = state.release ?: return
        state = state.copy(phase = UpdatePhase.PREPARING, message = null)
        if (!verifyReady(release)) return
        try {
            val permission = installer.permissionIntent()
            val destination = if (permission == null) UpdateDestination.INSTALLER else UpdateDestination.PERMISSION
            val intent = permission ?: installer.installIntent(ready)
            // Записываем ожидание до ухода в Settings: Android может сразу уничтожить наш процесс.
            withContext(Dispatchers.IO) {
                store.write(SavedParentUpdate(release, if (permission == null) 0 else System.currentTimeMillis()))
            }
            state = state.copy(phase = if (permission == null) UpdatePhase.INSTALLING else UpdatePhase.WAITING_PERMISSION,
                message = if (permission == null) R.string.app_update_confirm else R.string.app_update_permission)
            launchRequest = UpdateLaunch(destination, intent)
            showUpdatePanel = true
        } catch (error: CancellationException) { throw error
        } catch (_: Exception) { state = state.copy(phase = UpdatePhase.READY, message = R.string.app_update_install_failed) }
    }

    internal fun takeLaunch(): UpdateLaunch? = launchRequest.also { launchRequest = null }
    internal fun panelShown() { showUpdatePanel = false }

    internal fun permissionReturned() {
        if (state.phase == UpdatePhase.RESTORING) {
            permissionResultPending = true
            return
        }
        if (job?.isCompleted == false || state.phase != UpdatePhase.WAITING_PERMISSION || launchRequest != null) return
        job = viewModelScope.launch {
            try {
                val saved = withContext(Dispatchers.IO) { store.read() }
                val resume = saved?.mayResumePermission(System.currentTimeMillis()) == true && installer.permissionIntent() == null
                val release = state.release ?: return@launch
                withContext(Dispatchers.IO) { store.write(SavedParentUpdate(release)) }
                state = state.copy(phase = UpdatePhase.READY, message = if (resume) null else R.string.app_update_permission_denied)
                showUpdatePanel = true
                if (resume) prepareInstallation()
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) {
                withContext(Dispatchers.IO) { store.clear() }
                state = state.copy(phase = UpdatePhase.READY, message = R.string.app_update_install_failed)
            }
        }
    }

    internal fun installerReturned() {
        if (state.phase != UpdatePhase.INSTALLING || launchRequest != null) return
        state = state.copy(phase = UpdatePhase.READY, message = R.string.app_update_confirm)
        showUpdatePanel = true
    }

    internal fun installationFailed() {
        val release = state.release
        launchRequest = null
        state = state.copy(phase = UpdatePhase.PREPARING)
        job = viewModelScope.launch {
            withContext(Dispatchers.IO) {
                // Ошибка открытия системного экрана не означает повреждение уже скачанного файла.
                runCatching { release?.let { store.write(SavedParentUpdate(it)) } }.onFailure { store.clear() }
            }
            state = state.copy(phase = UpdatePhase.READY, message = R.string.app_update_install_failed)
        }
    }

    private suspend fun verifyReady(release: ParentRelease): Boolean = try {
        withContext(Dispatchers.IO) { installer.verify(ready, release) }
        true
    } catch (error: CancellationException) { throw error
    } catch (_: Exception) {
        discardFile()
        state = ParentUpdateState(UpdatePhase.AVAILABLE, release, message = R.string.app_update_download_failed)
        false
    }

    private suspend fun discardFile() = withContext(Dispatchers.IO) {
        store.clear()
        ready.delete()
    }

    private val externalPhases get() = listOf(UpdatePhase.PREPARING, UpdatePhase.WAITING_PERMISSION, UpdatePhase.INSTALLING)

    internal fun foregrounded() {
        // Возврат через список задач тоже должен продолжать ранее начатый запрос разрешения.
        permissionReturned()
    }
}
