package com.example.sheepfoldchild

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class SheepfoldChildApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIF_CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.notif_channel_desc)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    companion object {
        const val NOTIF_CHANNEL_ID = "access_ending"
        const val NOTIF_ID = 1001
    }
}
