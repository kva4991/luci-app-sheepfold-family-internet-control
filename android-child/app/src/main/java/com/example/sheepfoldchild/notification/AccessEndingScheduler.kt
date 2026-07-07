package com.example.sheepfoldchild.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Планирует (или отменяет) локальное уведомление за 5 минут до accessEndsAt.
 * Использует serverTime для расчёта, чтобы не зависеть от часов устройства.
 */
object AccessEndingScheduler {

    private const val REQUEST_CODE = 42
    private const val FIVE_MIN_MS = 5L * 60 * 1000

    fun schedule(context: Context, accessEndsAt: String?, serverTime: String?) {
        cancel(context) // сначала отменяем предыдущее

        if (accessEndsAt.isNullOrBlank() || serverTime.isNullOrBlank()) return

        try {
            val formatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME
            val endsAt = OffsetDateTime.parse(accessEndsAt, formatter)
            val server = OffsetDateTime.parse(serverTime, formatter)

            val nowEpochMs = System.currentTimeMillis()
            val serverEpochMs = server.toInstant().toEpochMilli()
            val endsAtEpochMs = endsAt.toInstant().toEpochMilli()

            // Сдвиг между часами устройства и сервером
            val drift = nowEpochMs - serverEpochMs
            val triggerAt = endsAtEpochMs + drift - FIVE_MIN_MS

            // Уведомление имеет смысл только если до конца > 5 минут
            if (triggerAt <= nowEpochMs) return

            val intent = Intent(context, AccessEndingAlarmReceiver::class.java)
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
        } catch (e: Exception) {
            // Некорректный формат времени — молча пропускаем
        }
    }

    fun cancel(context: Context) {
        val intent = Intent(context, AccessEndingAlarmReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pi)
        pi.cancel()
    }
}
