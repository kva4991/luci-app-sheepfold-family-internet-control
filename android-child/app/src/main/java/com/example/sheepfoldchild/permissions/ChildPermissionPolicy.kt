package com.example.sheepfoldchild.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.example.sheepfoldchild.data.ClientStatusData

/**
 * Runtime permissions are derived only from the latest router policy. The child app
 * never asks for SIM or Wi-Fi/location access before Sheepfold confirms that the
 * corresponding parent-controlled feature is enabled. §simchg1 §childwifi1
 */
enum class ChildPermissionFeature {
    NOTIFICATIONS,
    SIM_REPORTING,
    WIFI_REPORTING,
    WIFI_WITH_LOCATION
}

data class ChildPermissionRequest(
    val feature: ChildPermissionFeature,
    val permissions: List<String>
)

object ChildPermissionPolicy {

    fun pending(context: Context, status: ClientStatusData?): List<ChildPermissionRequest> {
        if (status == null) return emptyList()

        val requests = mutableListOf<ChildPermissionRequest>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            missing(context, listOf(Manifest.permission.POST_NOTIFICATIONS))
                .takeIf { it.isNotEmpty() }
                ?.let { requests += ChildPermissionRequest(ChildPermissionFeature.NOTIFICATIONS, it) }
        }

        if (status.simChangeReporting) {
            missing(
                context,
                listOf(
                    Manifest.permission.READ_PHONE_STATE,
                    Manifest.permission.READ_PHONE_NUMBERS
                )
            ).takeIf { it.isNotEmpty() }?.let {
                requests += ChildPermissionRequest(ChildPermissionFeature.SIM_REPORTING, it)
            }
        }

        if (status.wifiNetworkReporting) {
            val requested = buildList {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    add(Manifest.permission.NEARBY_WIFI_DEVICES)
                } else {
                    // Android 9–12 require location permission to expose SSID/BSSID to apps.
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                }
                if (status.wifiLocationReporting) {
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                }
            }.distinct()
            missing(context, requested).takeIf { it.isNotEmpty() }?.let {
                requests += ChildPermissionRequest(
                    if (status.wifiLocationReporting) {
                        ChildPermissionFeature.WIFI_WITH_LOCATION
                    } else {
                        ChildPermissionFeature.WIFI_REPORTING
                    },
                    it
                )
            }
        }

        return requests
    }

    private fun missing(context: Context, permissions: List<String>): List<String> =
        permissions.filter { permission ->
            ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED
        }
}
