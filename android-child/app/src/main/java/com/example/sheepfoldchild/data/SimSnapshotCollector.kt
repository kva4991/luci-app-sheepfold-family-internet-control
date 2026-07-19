package com.example.sheepfoldchild.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.PhoneNumberUtils
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import java.security.MessageDigest

/**
 * Собирает доступный обычному Android-приложению снимок активных подписок.
 * ICCID, IMSI и IMEI намеренно не запрашиваются: эти идентификаторы недоступны
 * обычному приложению и не должны становиться скрытым трекером. §simchg1
 */
object SimSnapshotCollector {

    fun payload(context: Context): String? {
        if (!hasPermission(context, Manifest.permission.READ_PHONE_STATE)) return null
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_SUBSCRIPTION)) {
            return null
        }

        val subscriptionManager = context.getSystemService(SubscriptionManager::class.java)
            ?: return null
        val subscriptions = try {
            subscriptionManager.activeSubscriptionInfoList.orEmpty()
        } catch (_: SecurityException) {
            return null
        } catch (_: UnsupportedOperationException) {
            return null
        }

        return buildString {
            appendLine("version=1")
            subscriptions
                .sortedBy { it.simSlotIndex }
                .take(4)
                .forEach { subscription ->
                    val number = phoneNumber(context, subscriptionManager, subscription)
                    append("sim=")
                    append(subscription.simSlotIndex.coerceIn(0, 3))
                    append('|')
                    append(fingerprint(subscription))
                    append('|')
                    append(number)
                    append('|')
                    append(mcc(subscription))
                    append('|')
                    append(mnc(subscription))
                    appendLine()
                }
        }
    }

    private fun fingerprint(subscription: SubscriptionInfo): String {
        // Номер не участвует в отпечатке: Android может сообщить его позже для
        // той же SIM, и это не должно создавать ложное событие замены.
        val source = listOf(
            subscription.subscriptionId.toString(),
            subscription.simSlotIndex.toString(),
            mcc(subscription),
            mnc(subscription),
            subscription.countryIso.orEmpty().lowercase(),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && subscription.isEmbedded) "esim" else "sim"
        ).joinToString("|")
        return MessageDigest.getInstance("SHA-256")
            .digest(source.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun phoneNumber(
        context: Context,
        manager: SubscriptionManager,
        subscription: SubscriptionInfo
    ): String {
        if (!hasPermission(context, Manifest.permission.READ_PHONE_NUMBERS)) return ""
        val raw = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                manager.getPhoneNumber(subscription.subscriptionId)
            } else {
                @Suppress("DEPRECATION")
                subscription.number
            }
        } catch (_: SecurityException) {
            ""
        }
        return PhoneNumberUtils.normalizeNumber(raw).take(21)
    }

    @Suppress("DEPRECATION")
    private fun mcc(subscription: SubscriptionInfo): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            subscription.mccString.orEmpty().filter(Char::isDigit).take(3)
        } else {
            subscription.mcc.takeIf { it > 0 }?.toString().orEmpty()
        }

    @Suppress("DEPRECATION")
    private fun mnc(subscription: SubscriptionInfo): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            subscription.mncString.orEmpty().filter(Char::isDigit).take(3)
        } else {
            subscription.mnc.takeIf { it >= 0 }?.toString().orEmpty()
        }

    private fun hasPermission(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}
