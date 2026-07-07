package com.example.sheepfoldchild.polling

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler

/**
 * WorkManager-работа: опрашивает /client-status и обновляет планировщик
 * уведомления при каждом срабатывании.
 * Не показывает UI — только перепланирует Alarm.
 */
class StatusPollWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val repo = ClientStatusRepository(applicationContext)
        val url = repo.getRouterBaseUrl() ?: return Result.success()

        repo.fetchClientStatus(url).onSuccess { response ->
            if (response.ok && response.data != null) {
                // Перепланируем уведомление только если приложение не на переднем плане
                if (!AccessEndingScheduler.isAppInForeground) {
                    AccessEndingScheduler.schedule(
                        applicationContext,
                        response.data.accessEndsAt,
                        response.serverTime,
                        response.data.minutesRemaining
                    )
                }
            }
        }
        return Result.success()
    }
}
