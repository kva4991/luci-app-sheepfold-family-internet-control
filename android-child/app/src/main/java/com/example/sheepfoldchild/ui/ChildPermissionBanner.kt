package com.example.sheepfoldchild.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.data.ClientStatusData
import com.example.sheepfoldchild.permissions.ChildPermissionFeature
import com.example.sheepfoldchild.permissions.ChildPermissionPolicy

/**
 * Shows one explained, parent-enabled permission at a time. The system dialog is
 * launched only after the user presses the explicit button; denial never blocks
 * the status screen and may be dismissed for the current app session.
 */
@Composable
fun ChildPermissionBanner(
    status: ClientStatusData?,
    onPermissionsChanged: () -> Unit
) {
    val context = LocalContext.current
    var dismissed by remember(
        status?.simChangeReporting,
        status?.wifiNetworkReporting,
        status?.wifiLocationReporting
    ) { mutableStateOf(emptySet<ChildPermissionFeature>()) }
    val request = ChildPermissionPolicy.pending(context, status)
        .firstOrNull { it.feature !in dismissed }
        ?: return
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        onPermissionsChanged()
    }
    val title = when (request.feature) {
        ChildPermissionFeature.NOTIFICATIONS -> R.string.permission_notifications_title
        ChildPermissionFeature.SIM_REPORTING -> R.string.permission_sim_title
        ChildPermissionFeature.WIFI_REPORTING -> R.string.permission_wifi_title
        ChildPermissionFeature.WIFI_WITH_LOCATION -> R.string.permission_wifi_location_title
    }
    val description = when (request.feature) {
        ChildPermissionFeature.NOTIFICATIONS -> R.string.permission_notifications_description
        ChildPermissionFeature.SIM_REPORTING -> R.string.permission_sim_description
        ChildPermissionFeature.WIFI_REPORTING -> R.string.permission_wifi_description
        ChildPermissionFeature.WIFI_WITH_LOCATION -> R.string.permission_wifi_location_description
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(stringResource(title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(description), style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { launcher.launch(request.permissions.toTypedArray()) }) {
                    Text(stringResource(R.string.permission_allow))
                }
                TextButton(onClick = { dismissed = dismissed + request.feature }) {
                    Text(stringResource(R.string.permission_later))
                }
            }
        }
    }
}
