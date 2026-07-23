package com.example.sheepfoldchild

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import com.example.sheepfoldchild.polling.PollingScheduler
import com.example.sheepfoldchild.ui.ChildPermissionBanner
import com.example.sheepfoldchild.ui.MainNavigation
import com.example.sheepfoldchild.ui.SetupScreen
import com.example.sheepfoldchild.viewmodel.ChildSetupState
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel
import com.example.sheepfoldchild.viewmodel.ChildUiState

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
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
                        onSave = viewModel::saveRouterUrl
                    )
                } else {
                    Column(modifier = Modifier.fillMaxSize()) {
                        // The banner appears only after a successful router status has
                        // supplied the parent-controlled feature policy. No sensitive
                        // permission dialog is launched during the first app start.
                        ChildPermissionBanner(
                            status = viewModel.latestStatus,
                            onPermissionsChanged = viewModel::refresh
                        )
                        Box(modifier = Modifier.weight(1f)) {
                            MainNavigation(statusViewModel = viewModel, appContext = appContext)
                        }
                    }
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
