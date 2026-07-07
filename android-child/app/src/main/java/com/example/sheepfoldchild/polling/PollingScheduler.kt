package com.example.sheepfoldchild.polling

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock

/**
 * Негарантированный фоновый опрос без WorkManager.
 *
 * ACTIVE использует 15 минут, IDLE — 30 минут. AlarmManager вправе объединять
 * срабатывания в Doze; точное время для обычного обновления статуса не нужно.
 */
object PollingScheduler {

    private const val REQUEST_CODE = 4102
    private const val ACTIVE_INTERVAL_MS = 15L * 60L * 1000L
    private const val IDLE_INTERVAL_MS = 30L * 60L * 1000L

    fun schedule(context: Context, mode: Mode) {
        val appContext = context.applicationContext
        val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val interval = when (mode) {
            Mode.ACTIVE -> ACTIVE_INTERVAL_MS
            Mode.IDLE -> IDLE_INTERVAL_MS
        }
        alarmManager.setInexactRepeating(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + interval,
            interval,
            pendingIntent(appContext)
        )
    }

    fun cancel(context: Context) {
        val appContext = context.applicationContext
        val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(appContext))
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, StatusPollReceiver::class.java)
            .setAction(StatusPollReceiver.ACTION_POLL)
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    enum class Mode { ACTIVE, IDLE }
}
