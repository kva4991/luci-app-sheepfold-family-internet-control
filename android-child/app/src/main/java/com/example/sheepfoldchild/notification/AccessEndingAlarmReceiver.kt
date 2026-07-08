package com.example.sheepfoldchild.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.example.sheepfoldchild.MainActivity
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.SheepfoldChildApp

class AccessEndingAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Если приложение сейчас открыто — не показываем уведомление.
        if (AccessEndingScheduler.isAppInForeground) return

        val minutesLeft = intent.getIntExtra("minutes_remaining", -1)
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val tapPendingIntent = PendingIntent.getActivity(
            context,
            0,
            tapIntent,
            pendingFlags
        )

        val text = if (minutesLeft > 0) {
            context.getString(R.string.notif_text_with_time, minutesLeft)
        } else {
            context.getString(R.string.notif_text)
        }

        val notification = NotificationCompat.Builder(context, SheepfoldChildApp.NOTIF_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(context.getString(R.string.notif_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPendingIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(SheepfoldChildApp.NOTIF_ID, notification)
    }
}
