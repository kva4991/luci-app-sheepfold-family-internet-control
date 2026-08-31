package app.sheepfold.android.updates

import android.util.AtomicFile
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

internal data class SavedParentUpdate(val release: ParentRelease, val permissionRequestedAt: Long = 0) {
    fun mayResumePermission(now: Long): Boolean =
        permissionRequestedAt > 0 && now >= permissionRequestedAt && now - permissionRequestedAt <= 30 * 60_000L
}

/** Только публичные метаданные APK; после восстановления подпись и байты проверяются заново. */
internal class ParentUpdateStore(directory: File) {
    private val metadata = AtomicFile(File(directory, "ready.json"))

    fun read(): SavedParentUpdate? = try {
        val json = metadata.openRead().use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                check(output.size() + count <= 4096)
                output.write(buffer, 0, count)
            }
            JSONObject(output.toString(Charsets.UTF_8.name()))
        }
        check(json.getInt("schema") == 1)
        val release = ParentUpdatePolicy.release(
            "sheepfold-parent-v${json.getString("version")}.apk", json.getString("url"),
            json.getLong("size"), "sha256:${json.getString("sha256")}") ?: error("invalid_update_metadata")
        SavedParentUpdate(release, json.getLong("permissionRequestedAt"))
    } catch (_: Exception) { null }

    fun write(update: SavedParentUpdate) {
        val release = update.release
        val bytes = JSONObject().put("schema", 1).put("version", release.version).put("url", release.url)
            .put("size", release.size).put("sha256", release.sha256)
            .put("permissionRequestedAt", update.permissionRequestedAt).toString().toByteArray(Charsets.UTF_8)
        check(bytes.size <= 4096)
        val output = metadata.startWrite()
        try {
            output.write(bytes)
            metadata.finishWrite(output)
        } catch (error: Exception) {
            metadata.failWrite(output)
            throw error
        }
    }

    fun clear() = metadata.delete()
}
