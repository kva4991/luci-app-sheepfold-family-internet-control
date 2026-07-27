package com.example.sheepfoldchild.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.sheepfoldchild.polling.PollingScheduler

class SafeBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val appContext = context.applicationContext
        PollingScheduler.schedule(appContext, PollingScheduler.Mode.IDLE)
        PollingScheduler.refreshNow(appContext)
    }
}
