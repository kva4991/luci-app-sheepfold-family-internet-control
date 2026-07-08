package com.example.sheepfoldchild.viewmodel

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.sheepfoldchild.data.ClientStatusData
import com.example.sheepfoldchild.data.ClientStatusRepository
import com.example.sheepfoldchild.notification.AccessEndingScheduler
import kotlinx.coroutines.launch

sealed class ChildUiState {
    object Loading : ChildUiState()
    data class Success(val status: ClientStatusData) : ChildUiState()
    data class Error(val message: String) : ChildUiState()
    object NoRouter : ChildUiState()
}

class ChildStatusViewModel(
    private val repository: ClientStatusRepository,
    private val context: Context
) : ViewModel() {

    var uiState: ChildUiState by mutableStateOf(ChildUiState.Loading)
        private set

    var routerBaseUrl: String? by mutableStateOf(null)
        private set

    var lastUpdated: String? by mutableStateOf(null)
        private set

    /** Последний полученный статус (нужен для AI-экрана). */
    var latestStatus: ClientStatusData? by mutableStateOf(null)
        private set

    init {
        viewModelScope.launch {
            routerBaseUrl = repository.getRouterBaseUrl()
            if (!routerBaseUrl.isNullOrBlank()) refresh()
        }
    }

    fun saveRouterUrl(url: String) {
        viewModelScope.launch {
            runCatching { repository.saveRouterBaseUrl(url) }
                .onSuccess { normalizedUrl ->
                    routerBaseUrl = normalizedUrl
                    refresh()
                }
                .onFailure { error ->
                    uiState = ChildUiState.Error(
                        error.message ?: context.getString(com.example.sheepfoldchild.R.string.error_generic)
                    )
                }
        }
    }

    fun refresh() {
        val url = routerBaseUrl ?: return
        uiState = ChildUiState.Loading
        viewModelScope.launch {
            repository.fetchClientStatus(url).onSuccess { response ->
                if (response.ok && response.data != null) {
                    latestStatus = response.data
                    uiState = ChildUiState.Success(response.data)
                    lastUpdated = response.serverTime?.let { formatTime(it) }
                    AccessEndingScheduler.schedule(
                        context,
                        response.data.accessEndsAt,
                        response.serverTime,
                        response.data.minutesRemaining
                    )
                } else {
                    val msg = response.error?.message
                        ?: context.getString(com.example.sheepfoldchild.R.string.error_generic)
                    uiState = ChildUiState.Error(msg)
                    AccessEndingScheduler.cancel(context)
                }
            }.onFailure { e ->
                val msg = when {
                    e.message?.contains("Unable to resolve", ignoreCase = true) == true ||
                    e.message?.contains("failed to connect", ignoreCase = true) == true ||
                    e.message?.contains("Cleartext HTTP traffic", ignoreCase = true) == true ->
                        context.getString(com.example.sheepfoldchild.R.string.error_network)
                    else -> e.message
                        ?: context.getString(com.example.sheepfoldchild.R.string.error_generic)
                }
                uiState = ChildUiState.Error(msg)
                AccessEndingScheduler.cancel(context)
            }
        }
    }

    private fun formatTime(iso: String): String =
        try { iso.substring(11, 16) } catch (_: Exception) { iso }
}

class ChildStatusViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return ChildStatusViewModel(
            ClientStatusRepository(context.applicationContext),
            context.applicationContext
        ) as T
    }
}
