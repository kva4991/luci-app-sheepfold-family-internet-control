package app.sheepfold.android.ui.main

import androidx.compose.runtime.Composable

/** Серверно управляемая вкладка; отсутствие capability возвращает null. §prodvar */
data class ProductTab(
    val title: String,
    val content: @Composable () -> Unit
)
