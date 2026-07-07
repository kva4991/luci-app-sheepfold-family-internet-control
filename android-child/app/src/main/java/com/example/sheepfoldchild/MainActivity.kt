package com.example.sheepfoldchild

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.remember
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import com.example.sheepfoldchild.polling.PollingScheduler
import com.example.sheepfoldchild.ui.MainNavigation
import com.example.sheepfoldchild.ui.SetupScreen
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel

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
                    SetupScreen(onSave = { url -> viewModel.saveRouterUrl(url) })
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
