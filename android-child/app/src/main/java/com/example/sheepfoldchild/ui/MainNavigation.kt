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
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel

/** Общая навигация; AI-вкладка приходит только по capability текущего роутера. §prodvar */
@Composable
fun MainNavigation(statusViewModel: ChildStatusViewModel, appContext: android.content.Context) {
    val latestStatus = statusViewModel.latestStatus
    val productTab = productChildTab(appContext.applicationContext, latestStatus)

    var selectedTab by remember { mutableIntStateOf(0) }
    LaunchedEffect(productTab) {
        if (productTab == null && selectedTab > 1) selectedTab = 0
    }

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
                productTab?.let { tab ->
                    NavigationBarItem(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        icon = { Text(tab.icon) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> ChildStatusScreen(viewModel = statusViewModel)
                1 -> AccessInfoScreen(status = latestStatus)
                2 -> productTab?.content?.invoke()
            }
        }
    }
}
