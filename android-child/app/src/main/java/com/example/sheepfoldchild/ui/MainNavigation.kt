package com.example.sheepfoldchild.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.viewmodel.AiChatViewModel
import com.example.sheepfoldchild.viewmodel.AiChatViewModelFactory
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel

/**
 * Bottom navigation: Статус / Мой доступ / ИИ-помощник
 */
@Composable
fun MainNavigation(statusViewModel: ChildStatusViewModel, appContext: android.content.Context) {
    val aiVm: AiChatViewModel = viewModel(factory = AiChatViewModelFactory(appContext))

    // Синхронизируем статус в AiViewModel при каждом обновлении
    val latestStatus = statusViewModel.latestStatus
    LaunchedEffect(latestStatus) { aiVm.currentStatus = latestStatus }

    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, null) },
                    label = { Text(stringResource(R.string.tab_status)) }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Lock, null) },
                    label = { Text(stringResource(R.string.tab_access)) }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.ChatBubble, null) },
                    label = { Text(stringResource(R.string.tab_ai)) }
                )
            }
        }
    ) { padding ->
        when (selectedTab) {
            0 -> ChildStatusScreen(viewModel = statusViewModel)
            1 -> AccessInfoScreen(status = latestStatus)
            2 -> AiChatScreen(viewModel = aiVm)
        }
    }
}
