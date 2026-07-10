package com.example.sheepfoldchild.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.data.AiRepository
import com.example.sheepfoldchild.viewmodel.AiChatViewModel
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel

/** Bottom navigation: Статус / Мой доступ / ИИ-помощник. */
@Composable
fun MainNavigation(statusViewModel: ChildStatusViewModel, appContext: android.content.Context) {
    val applicationContext = appContext.applicationContext
    val aiViewModel = remember(applicationContext) {
        AiChatViewModel(AiRepository(applicationContext), applicationContext)
    }

    val latestStatus = statusViewModel.latestStatus
    LaunchedEffect(latestStatus) { aiViewModel.currentStatus = latestStatus }

    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Text("●") },
                    label = { Text(stringResource(R.string.tab_status)) }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Text("◷") },
                    label = { Text(stringResource(R.string.tab_access)) }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Text("AI") },
                    label = { Text(stringResource(R.string.tab_ai)) }
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> ChildStatusScreen(viewModel = statusViewModel)
                1 -> AccessInfoScreen(status = latestStatus)
                2 -> AiChatScreen(viewModel = aiViewModel, status = latestStatus)
            }
        }
    }
}
