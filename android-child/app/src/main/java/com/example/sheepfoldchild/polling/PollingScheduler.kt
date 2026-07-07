package com.example.sheepfoldchild.polling

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Планировщик опроса роутера через WorkManager.
 *
 * Режимы интервала:
 *   ACTIVE   — пользователь активен: 5 мин
 *   IDLE     — приложение в фоне, устройство не используется: 30 мин
 *
 * WorkManager автоматически уважает Doze/App Standby:
 * в глубом сне Android работа откладывается до следующего окна Doze — это норма.
 */
object PollingScheduler {

    private const val WORK_NAME = "sheepfold_status_poll"

    /** Вызывать из onResume (=ACTIVE) и onPause (=IDLE). */
    fun schedule(context: Context, mode: Mode) {
        val intervalMinutes = when (mode) {
            Mode.ACTIVE -> 5L
            Mode.IDLE   -> 30L
        }

        val request = PeriodicWorkRequestBuilder<StatusPollWorker>(
            intervalMinutes, TimeUnit.MINUTES
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(
                BackoffPolicy.LINEAR,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        WorkManager.getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
    }

    enum class Mode { ACTIVE, IDLE }
}
