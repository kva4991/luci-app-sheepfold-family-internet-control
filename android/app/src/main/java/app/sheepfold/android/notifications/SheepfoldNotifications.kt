package app.sheepfold.android.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.sheepfold.android.MainActivity
import app.sheepfold.android.R
import app.sheepfold.android.router.ChildAccessRequest
import app.sheepfold.android.router.RouterAdminNotification

data class NewDeviceNotification(
    val id: Int,
    val name: String,
    val ip: String,
    val mac: String
)

object SheepfoldNotifications {
    private const val channelId = "sheepfold_devices"
    private const val channelName = "Sheepfold devices"
    private const val notifiedDevicesPrefs = "sheepfold_notified_devices"
    private const val notifiedRequestsPrefs = "sheepfold_notified_access_requests"
    private const val notifiedAdminEventsPrefs = "sheepfold_notified_admin_events"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Уведомления о новых устройствах в домашней сети"
        }

        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    fun notifyNewDeviceOnce(context: Context, device: NewDeviceNotification) {
        val appContext = context.applicationContext
        val notifiedPrefs = appContext.getSharedPreferences(notifiedDevicesPrefs, Context.MODE_PRIVATE)
        val notifiedKey = "device_${device.id}_${device.mac}"
        if (notifiedPrefs.getBoolean(notifiedKey, false)) {
            return
        }

        val openAppIntent = Intent(appContext, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            device.id,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Обнаружено новое устройство")
            .setContentText("#${device.id} ${device.name}, IP ${device.ip}")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("#${device.id} ${device.name}, IP ${device.ip}, MAC ${device.mac}")
            )
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        if (!postNotification(appContext, 10_000 + device.id, notification)) {
            return
        }

        notifiedPrefs.edit()
            .putBoolean(notifiedKey, true)
            .apply()
    }

    fun notifyAccessRequestOnce(context: Context, request: ChildAccessRequest) {
        val appContext = context.applicationContext
        val preferences = appContext.getSharedPreferences(notifiedRequestsPrefs, Context.MODE_PRIVATE)
        if (preferences.getBoolean(request.id, false) || !notificationsAllowed(appContext)) {
            return
        }

        val pendingIntent = PendingIntent.getActivity(
            appContext,
            request.id.hashCode(),
            Intent(appContext, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val deviceLabel = request.deviceId.takeIf { it.isNotBlank() }
            ?.let { "#$it ${request.deviceName}" }
            ?: request.deviceName
        val notification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Ребёнок просит 30 минут интернета")
            .setContentText(deviceLabel)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$deviceLabel просит предоставить ещё 30 минут доступа в интернет."))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        if (!postNotification(appContext, 20_000 + request.id.hashCode().and(0x3fff), notification)) {
            return
        }
        preferences.edit().putBoolean(request.id, true).apply()
    }

    fun notifyAdminEventOnce(context: Context, event: RouterAdminNotification) {
        val appContext = context.applicationContext
        val preferences = appContext.getSharedPreferences(notifiedAdminEventsPrefs, Context.MODE_PRIVATE)
        if (preferences.getBoolean(event.id, false) || !notificationsAllowed(appContext)) {
            return
        }

        val pendingIntent = PendingIntent.getActivity(
            appContext,
            event.id.hashCode(),
            Intent(appContext, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(event.title)
            .setContentText(event.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(event.message))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        if (!postNotification(appContext, 30_000 + event.id.hashCode().and(0x3fff), notification)) {
            return
        }
        preferences.edit().putBoolean(event.id, true).apply()
    }

    private fun postNotification(context: Context, id: Int, notification: Notification): Boolean {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled() || !notificationsAllowed(context)) {
            return false
        }

        return try {
            // Разрешение может быть отозвано между проверкой и системным вызовом
            manager.notify(id, notification)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    private fun notificationsAllowed(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
}
