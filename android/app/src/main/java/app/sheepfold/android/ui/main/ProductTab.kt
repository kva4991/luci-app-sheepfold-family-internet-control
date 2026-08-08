package app.sheepfold.android.ui.main

import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable

/** Серверно управляемая вкладка; отсутствие capability возвращает null. §prodvar */
data class ProductTab(
    val title: String,
    @DrawableRes val iconRes: Int,
    val content: @Composable () -> Unit
)
