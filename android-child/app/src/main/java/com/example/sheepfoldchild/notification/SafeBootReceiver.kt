package com.example.sheepfoldchild.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.polling.PollingScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SafeBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val pending = goAsync()
        val appContext = context.applicationContext
        PollingScheduler.schedule(appContext, PollingScheduler.Mode.IDLE)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val repository = ClientStatusRepository(appContext)
                val routerUrl = repository.getRouterBaseUrl() ?: return@launch
                repository.fetchClientStatus(routerUrl).onSuccess { response ->
                    val status = response.data ?: return@onSuccess
                    AccessEndingScheduler.schedule(
                        appContext,
                        status.accessEndsAt,
                        response.serverTime,
                        status.minutesRemaining
                    )
                }
            } finally {
                pending.finish()
            }
        }
    }
}
