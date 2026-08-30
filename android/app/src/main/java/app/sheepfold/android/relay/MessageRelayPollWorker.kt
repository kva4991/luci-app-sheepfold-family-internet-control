package app.sheepfold.android.relay

import android.content.Context
import androidx.work.Constraints
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit

class MessageRelayPollWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val settings = MessageRelayConnectionStore.read(applicationContext).normalized()
        if (!settings.permitsPublicNetwork()) return Result.success()
        val secrets = try {
            MessageRelaySecureStore.read(applicationContext) ?: return Result.success()
        } catch (_: IllegalArgumentException) {
            return Result.failure()
        } catch (_: IllegalStateException) {
            return Result.failure()
        }
        val state = MessageRelayStateStore(
            AndroidMessageRelayStateStorage(applicationContext),
            secrets.stateGeneration
        )
        return try {
            MessageRelaySynchronizer(
                settings,
                secrets,
                state,
                publicTransportFactory = PublicMessageRelayTransportFactory {
                    PublicMessageRelayHttpsClient(settings.baseUrl, secrets)
                }
            ).pollOnce(
                limit = 20,
                waitSeconds = 0
            )
            Result.success()
        } catch (_: IOException) {
            Result.retry()
        } catch (error: MessageRelayHttpException) {
            if (error.httpStatus == 408 || error.httpStatus == 429 || error.httpStatus >= 500) {
                Result.retry()
            } else {
                Result.failure()
            }
        } catch (_: RuntimeException) {
            Result.failure()
        }
    }

    companion object {
        private const val workName = "sheepfold-family-message-relay-poll"

        internal fun shouldSchedule(
            settings: MessageRelaySettings,
            secrets: MessageRelaySecrets?
        ): Boolean = settings.permitsPublicNetwork() && secrets != null

        fun scheduleIfProvisioned(context: Context) {
            val appContext = context.applicationContext
            val settings = MessageRelayConnectionStore.read(appContext).normalized()
            val secrets = runCatching { MessageRelaySecureStore.read(appContext) }.getOrNull()
            if (!shouldSchedule(settings, secrets)) {
                WorkManager.getInstance(appContext).cancelUniqueWork(workName)
                return
            }
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = PeriodicWorkRequestBuilder<MessageRelayPollWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                // Five minutes is the maximum accepted Retry-After, so WorkManager never retries earlier.
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
                workName,
                ExistingPeriodicWorkPolicy.UPDATE,
                work
            )
        }
    }
}
