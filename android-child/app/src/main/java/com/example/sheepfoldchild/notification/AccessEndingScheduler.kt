package com.example.sheepfoldchild.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Планирует локальное уведомление за 5 минут до accessEndsAt.
 *
 * Логика:
 * - Если до конца > 5 минут  → уведомление ставится на (accessEndsAt − 5 мин).
 * - Если до конца ≤ 5 минут  → уведомление ставится НЕМЕДЛЕННО (сейчас), но только
 *   если приложение сейчас не на переднем плане (проверяется через флаг AppForeground).
 * - Если приложение открыто  → уведомление не нужно: пользователь уже видит таймер.
 * - При каждом вызове предыдущий Alarm отменяется.
 */
object AccessEndingScheduler {

    private const val REQUEST_CODE = 42
    private const val FIVE_MIN_MS = 5L * 60 * 1000

    // Флаг: установить в true в onResume/onStart MainActivity, false в onPause/onStop
    var isAppInForeground: Boolean = false

    fun schedule(context: Context, accessEndsAt: String?, serverTime: String?, minutesRemaining: Int?) {
        cancel(context)

        if (accessEndsAt.isNullOrBlank() || serverTime.isNullOrBlank()) return
        if (minutesRemaining != null && minutesRemaining <= 0) return // уже истекло

        try {
            val formatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME
            val endsAt = OffsetDateTime.parse(accessEndsAt, formatter)
            val server = OffsetDateTime.parse(serverTime, formatter)

            val nowEpochMs = System.currentTimeMillis()
            val serverEpochMs = server.toInstant().toEpochMilli()
            val endsAtEpochMs = endsAt.toInstant().toEpochMilli()

            val drift = nowEpochMs - serverEpochMs
            val idealTriggerAt = endsAtEpochMs + drift - FIVE_MIN_MS

            val triggerAt = if (idealTriggerAt <= nowEpochMs) {
                // Менее 5 минут осталось: если приложение открыто — не нужно
                if (isAppInForeground) return
                nowEpochMs + 500L // показываем почти сразу
            } else {
                idealTriggerAt
            }

            val intent = Intent(context, AccessEndingAlarmReceiver::class.java).apply {
                minutesRemaining?.let { putExtra("minutes_remaining", it) }
            }
            val pi = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (_: Exception) {}
    }

    fun cancel(context: Context) {
        val intent = Intent(context, AccessEndingAlarmReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            context, REQUEST_CODE, intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        pi.cancel()
    }
}
