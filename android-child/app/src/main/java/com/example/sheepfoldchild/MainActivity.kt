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
import com.example.sheepfoldchild.ui.ChildStatusScreen
import com.example.sheepfoldchild.ui.SetupScreen
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModelFactory

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            // Тема по умолчанию — системная (ThemeMode.SYSTEM)
            val darkTheme = isSystemInDarkTheme()
            MaterialTheme(
                colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()
            ) {
                val vm: ChildStatusViewModel = viewModel(
                    factory = ChildStatusViewModelFactory(applicationContext)
                )
                val routerUrl = vm.routerBaseUrl
                if (routerUrl.isNullOrBlank()) {
                    SetupScreen(onSave = { url -> vm.saveRouterUrl(url) })
                } else {
                    ChildStatusScreen(viewModel = vm)
                }
            }
        }
    }
}
