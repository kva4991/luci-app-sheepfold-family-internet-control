package com.example.sheepfoldchild.ui

import androidx.compose.runtime.Composable

data class ProductChildTab(
    val icon: String,
    val label: String,
    val content: @Composable () -> Unit
)
