package com.example.sheepfoldchild

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import com.example.sheepfoldchild.polling.PollingScheduler
import com.example.sheepfoldchild.ui.MainNavigation
import com.example.sheepfoldchild.ui.SetupScreen
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModelFactory

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(
                colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()
            ) {
                val vm: ChildStatusViewModel = viewModel(
                    factory = ChildStatusViewModelFactory(applicationContext)
                )
                if (vm.routerBaseUrl.isNullOrBlank()) {
                    SetupScreen(onSave = { url -> vm.saveRouterUrl(url) })
                } else {
                    MainNavigation(statusViewModel = vm, appContext = applicationContext)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Приложение активно: уведомления выключаем, поллинг чаще
        AccessEndingScheduler.isAppInForeground = true
        PollingScheduler.schedule(applicationContext, PollingScheduler.Mode.ACTIVE)
    }

    override fun onPause() {
        super.onPause()
        // Приложение в фоне: уведомления разрешаем, поллинг реже
        AccessEndingScheduler.isAppInForeground = false
        PollingScheduler.schedule(applicationContext, PollingScheduler.Mode.IDLE)
    }
}
