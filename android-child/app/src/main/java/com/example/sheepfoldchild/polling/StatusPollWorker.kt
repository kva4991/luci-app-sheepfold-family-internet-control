package com.example.sheepfoldchild.polling

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler

/**
 * Выполняет отложенный сетевой опрос вне короткого жизненного цикла BroadcastReceiver.
 *
 * Точный момент окончания доступа по-прежнему обслуживает AccessEndingScheduler:
 * WorkManager подходит для периодической синхронизации, но не для точного времени. §andwork1
 */
class StatusPollWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val repository = ClientStatusRepository(applicationContext)
        val routerUrl = repository.getRouterBaseUrl() ?: return Result.success()
        repository.fetchClientStatus(routerUrl).onSuccess { response ->
            val status = response.data ?: return@onSuccess
            if (!AccessEndingScheduler.isAppInForeground) {
                AccessEndingScheduler.schedule(
                    applicationContext,
                    status.accessEndsAt,
                    response.serverTime,
                    status.minutesRemaining
                )
            }
        }
        // Ошибка локальной сети не должна создавать плотный retry-цикл. Периодическая
        // работа попробует снова в следующем окне, а экран имеет ручное обновление.
        return Result.success()
    }
}
