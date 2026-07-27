package com.example.sheepfoldchild.polling

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Планирует один именованный периодический опрос статуса через WorkManager.
 *
 * ACTIVE использует минимально поддерживаемые 15 минут, IDLE — 30 минут.
 * Точное время здесь не требуется; окончание доступа обслуживается отдельным alarm. §andwork1
 */
object PollingScheduler {

    private const val PERIODIC_WORK_NAME = "sheepfold-child-status-poll"
    private const val REFRESH_WORK_NAME = "sheepfold-child-status-refresh"
    private const val ACTIVE_INTERVAL_MS = 15L * 60L * 1000L
    private const val IDLE_INTERVAL_MS = 30L * 60L * 1000L
    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedule(context: Context, mode: Mode) {
        val interval = when (mode) {
            Mode.ACTIVE -> ACTIVE_INTERVAL_MS
            Mode.IDLE -> IDLE_INTERVAL_MS
        }
        val request = PeriodicWorkRequestBuilder<StatusPollWorker>(
            interval,
            TimeUnit.MILLISECONDS
        )
            .setConstraints(networkConstraints)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    fun refreshNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<StatusPollWorker>()
            .setConstraints(networkConstraints)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            REFRESH_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    fun cancel(context: Context) {
        val workManager = WorkManager.getInstance(context.applicationContext)
        workManager.cancelUniqueWork(PERIODIC_WORK_NAME)
        workManager.cancelUniqueWork(REFRESH_WORK_NAME)
    }

    enum class Mode { ACTIVE, IDLE }
}
