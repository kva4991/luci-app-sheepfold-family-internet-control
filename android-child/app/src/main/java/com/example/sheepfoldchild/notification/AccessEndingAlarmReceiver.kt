package com.example.sheepfoldchild.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.example.sheepfoldchild.MainActivity
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.SheepfoldChildApp

class AccessEndingAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Если приложение сейчас открыто — не показываем уведомление
        if (AccessEndingScheduler.isAppInForeground) return

        val minsLeft = intent.getIntExtra("minutes_remaining", -1)

        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val tapPi = PendingIntent.getActivity(
            context, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val text = if (minsLeft > 0)
            context.getString(R.string.notif_text_with_time, minsLeft)
        else
            context.getString(R.string.notif_text)

        val notification = NotificationCompat.Builder(context, SheepfoldChildApp.NOTIF_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(context.getString(R.string.notif_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPi)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(SheepfoldChildApp.NOTIF_ID, notification)
    }
}
