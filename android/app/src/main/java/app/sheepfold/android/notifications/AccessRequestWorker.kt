package app.sheepfold.android.notifications

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.SheepfoldConnectionStore
import java.util.concurrent.TimeUnit

class AccessRequestWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val connection = SheepfoldConnectionStore.read(applicationContext) ?: return Result.success()
        if (!SheepfoldConnectionStore.hasConnection(applicationContext)) return Result.success()

        return runCatching {
            val client = RouterAdminClient(connection, applicationContext)
            client.loadChildAccessRequests().forEach { request ->
                SheepfoldNotifications.notifyAccessRequestOnce(applicationContext, request)
            }
            client.loadAdminNotifications().forEach { event ->
                SheepfoldNotifications.notifyAdminEventOnce(applicationContext, event)
            }
        }.fold(
            onSuccess = { Result.success() },
            // Роутер может быть недоступен вне домашней сети; WorkManager повторит проверку позже.
            onFailure = { Result.retry() }
        )
    }

    companion object {
        private const val workName = "sheepfold-child-access-requests"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = PeriodicWorkRequestBuilder<AccessRequestWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                workName,
                ExistingPeriodicWorkPolicy.UPDATE,
                work
            )
        }
    }
}
