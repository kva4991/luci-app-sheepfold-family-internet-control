package com.example.sheepfoldchild.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.data.AiRepository
import com.example.sheepfoldchild.data.ClientStatusData
import com.example.sheepfoldchild.viewmodel.AiChatViewModel

/** Единый детский APK показывает AI-чат только по разрешению роутера. §prodvar */
@Composable
fun productChildTab(context: Context, status: ClientStatusData?): ProductChildTab? {
    if (status?.productStatus?.aiAvailable != true) return null
    val viewModel = remember(context) {
        AiChatViewModel(AiRepository(context.applicationContext), context.applicationContext)
    }
    LaunchedEffect(status) { viewModel.currentStatus = status }
    return ProductChildTab(
        icon = "AI",
        label = stringResource(R.string.tab_ai),
        content = { AiChatScreen(viewModel = viewModel, status = status) }
    )
}
