package com.example.sheepfoldchild.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.sheepfoldchild.data.ClientStatusRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val repo = ClientStatusRepository(context.applicationContext)
        CoroutineScope(Dispatchers.IO).launch {
            val url = repo.getRouterBaseUrl() ?: return@launch
            repo.fetchClientStatus(url).onSuccess { response ->
                if (response.ok && response.data != null) {
                    AccessEndingScheduler.schedule(
                        context,
                        response.data.accessEndsAt,
                        response.serverTime,
                        response.data.minutesRemaining
                    )
                }
            }
        }
    }
}
