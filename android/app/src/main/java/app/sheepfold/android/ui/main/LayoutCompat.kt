package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.width as composeWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

/** Совместимый вызов для старого прототипного экрана, который пока остаётся в исходниках. */
fun Modifier.width(value: Dp): Modifier = this.composeWidth(value)
