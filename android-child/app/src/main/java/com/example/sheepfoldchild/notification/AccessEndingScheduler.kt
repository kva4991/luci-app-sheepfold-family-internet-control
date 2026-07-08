package com.example.sheepfoldchild.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.ceil

/** Планирует локальное уведомление за пять минут до изменения доступа. */
object AccessEndingScheduler {

    private const val REQUEST_CODE = 42
    private const val FIVE_MIN_MS = 5L * 60L * 1000L

    var isAppInForeground: Boolean = false

    fun schedule(context: Context, accessEndsAt: String?, serverTime: String?, minutesRemaining: Int?) {
        cancel(context)
        if (accessEndsAt.isNullOrBlank()) return
        if (minutesRemaining != null && minutesRemaining <= 0) return

        try {
            val nowEpochMs = System.currentTimeMillis()
            val endsAtEpochMs = parseTimestamp(accessEndsAt) ?: return
            val serverEpochMs = parseTimestamp(serverTime) ?: nowEpochMs

            // Компенсируем разницу часов телефона и роутера.
            val drift = nowEpochMs - serverEpochMs
            val localEndsAt = endsAtEpochMs + drift
            val idealTriggerAt = localEndsAt - FIVE_MIN_MS
            val triggerAt = if (idealTriggerAt <= nowEpochMs) {
                if (isAppInForeground) return
                nowEpochMs + 500L
            } else {
                idealTriggerAt
            }
            val minutesAtTrigger = ceil(
                ((localEndsAt - triggerAt).coerceAtLeast(0L)) / 60_000.0
            ).toInt().coerceAtLeast(1)

            val intent = Intent(context, AccessEndingAlarmReceiver::class.java).apply {
                putExtra("minutes_remaining", minutesAtTrigger)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
            )

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    !alarmManager.canScheduleExactAlarms() -> {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                }
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerAt,
                        pendingIntent
                    )
                }
                else -> {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                }
            }
        } catch (_: Exception) {
            // Некорректное время от старой версии роутера не должно ломать приложение.
        }
    }

    private fun parseTimestamp(value: String?): Long? {
        val text = value?.trim().orEmpty()
        if (text.isEmpty()) return null

        text.toLongOrNull()?.let { numeric ->
            return if (text.length >= 13) numeric else numeric * 1000L
        }

        return runCatching {
            OffsetDateTime.parse(text, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                .toInstant()
                .toEpochMilli()
        }.recoverCatching {
            Instant.parse(text).toEpochMilli()
        }.getOrNull()
    }

    fun cancel(context: Context) {
        val intent = Intent(context, AccessEndingAlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            pendingIntentFlags(PendingIntent.FLAG_NO_CREATE)
        ) ?: return
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
        pendingIntent.cancel()
    }

    private fun pendingIntentFlags(baseFlags: Int): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            baseFlags or PendingIntent.FLAG_IMMUTABLE
        } else {
            baseFlags
        }
    }
}
