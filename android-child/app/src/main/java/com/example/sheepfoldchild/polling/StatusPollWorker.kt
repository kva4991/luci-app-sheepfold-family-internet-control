package com.example.sheepfoldchild.polling

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Фоновый опрос статуса, запускаемый AlarmManager. */
class StatusPollReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_POLL) return
        val pendingResult = goAsync()
        val appContext = context.applicationContext

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val repo = ClientStatusRepository(appContext)
                val url = repo.getRouterBaseUrl() ?: return@launch
                repo.fetchClientStatus(url).onSuccess { response ->
                    val data = response.data ?: return@onSuccess
                    if (!AccessEndingScheduler.isAppInForeground) {
                        AccessEndingScheduler.schedule(
                            appContext,
                            data.accessEndsAt,
                            response.serverTime,
                            data.minutesRemaining
                        )
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_POLL = "com.example.sheepfoldchild.action.POLL_STATUS"
    }
}
