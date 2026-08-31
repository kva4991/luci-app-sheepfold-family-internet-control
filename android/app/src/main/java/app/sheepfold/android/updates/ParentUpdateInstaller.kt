package app.sheepfold.android.updates

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest

internal interface ParentUpdateInstallation {
    val installed: AppIdentity
    fun verify(file: File, release: ParentRelease)
    fun permissionIntent(): Intent?
    fun installIntent(file: File): Intent
}

/** Android подтверждает установку; ни удаления приложения, ни смены доверенного ключа здесь нет. */
internal class ParentUpdateInstaller(private val context: Context) : ParentUpdateInstallation {
    @Suppress("DEPRECATION")
    override val installed: AppIdentity get() = identity(context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES))

    @Suppress("DEPRECATION")
    override fun verify(file: File, release: ParentRelease) {
        check(file.length() == release.size)
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                hash.update(buffer, 0, count)
            }
        }
        check(hash.digest().hex() == release.sha256)
        val archive = context.packageManager.getPackageArchiveInfo(file.path, PackageManager.GET_SIGNING_CERTIFICATES)
            ?: error("invalid_apk")
        check(ParentUpdatePolicy.acceptsArchive(installed, identity(archive), release))
    }

    override fun permissionIntent(): Intent? =
        if (context.packageManager.canRequestPackageInstalls()) null
        else Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    override fun installIntent(file: File): Intent {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            clipData = ClipData.newRawUri("Sheepfold update", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    private fun identity(info: PackageInfo) = AppIdentity(
        info.packageName, info.longVersionCode, info.versionName.orEmpty(),
        info.signingInfo?.apkContentsSigners?.map { MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).hex() }?.toSet().orEmpty()
    )
}

class ParentUpdateFileProvider : FileProvider()
