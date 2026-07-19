package com.example.sheepfoldchild

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.core.content.ContextCompat
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import com.example.sheepfoldchild.polling.PollingScheduler
import com.example.sheepfoldchild.ui.MainNavigation
import com.example.sheepfoldchild.ui.SetupScreen
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel
import com.example.sheepfoldchild.viewmodel.ChildUiState
import com.example.sheepfoldchild.viewmodel.ChildSetupState

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val permissionLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.RequestMultiplePermissions()
            ) {
                // Отказ не блокирует приложение: уведомления и точные события деградируют мягко.
            }

            LaunchedEffect(Unit) {
                val missingPermissions = buildList {
                    if (
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.READ_PHONE_STATE
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        add(Manifest.permission.READ_PHONE_STATE)
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.READ_PHONE_NUMBERS
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        add(Manifest.permission.READ_PHONE_NUMBERS)
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.ACCESS_FINE_LOCATION
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        add(Manifest.permission.ACCESS_FINE_LOCATION)
                    }
                    if (
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.NEARBY_WIFI_DEVICES
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        add(Manifest.permission.NEARBY_WIFI_DEVICES)
                    }
                }
                if (missingPermissions.isNotEmpty()) {
                    permissionLauncher.launch(missingPermissions.toTypedArray())
                }
            }

            MaterialTheme(
                colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()
            ) {
                val appContext = applicationContext
                val viewModel = remember(appContext) {
                    ChildStatusViewModel(
                        ClientStatusRepository(appContext),
                        appContext
                    )
                }
                if (viewModel.routerBaseUrl.isNullOrBlank()) {
                    SetupScreen(
                        isSearching = viewModel.setupState is ChildSetupState.Searching,
                        errorMessage = (viewModel.uiState as? ChildUiState.Error)?.message,
                        onRetry = viewModel::searchForRouter,
                        onSave = { url -> viewModel.saveRouterUrl(url) }
                    )
                } else {
                    MainNavigation(statusViewModel = viewModel, appContext = appContext)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        AccessEndingScheduler.isAppInForeground = true
        PollingScheduler.schedule(applicationContext, PollingScheduler.Mode.ACTIVE)
    }

    override fun onPause() {
        super.onPause()
        AccessEndingScheduler.isAppInForeground = false
        PollingScheduler.schedule(applicationContext, PollingScheduler.Mode.IDLE)
    }
}
