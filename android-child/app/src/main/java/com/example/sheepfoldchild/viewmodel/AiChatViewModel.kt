package com.example.sheepfoldchild.viewmodel

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.sheepfoldchild.data.AiRepository
import com.example.sheepfoldchild.data.ChatMessage
import com.example.sheepfoldchild.data.ClientStatusData
import kotlinx.coroutines.launch

class AiChatViewModel(
    private val repository: AiRepository,
    private val context: Context
) : ViewModel() {

    val messages = mutableStateListOf<ChatMessage>()
    var isLoading: Boolean by mutableStateOf(false)
        private set
    var errorMessage: String? by mutableStateOf(null)
        private set

    /** Вызывается из ChildStatusViewModel — передаёт актуальный статус. */
    var currentStatus: ClientStatusData? = null

    fun sendMessage(text: String) {
        if (text.isBlank() || isLoading) return
        val userMsg = ChatMessage("user", text.trim())
        messages.add(userMsg)
        errorMessage = null
        isLoading = true

        viewModelScope.launch {
            val baseUrl = repository.getRouterBaseUrl()
            if (baseUrl.isNullOrBlank()) {
                errorMessage = "Адрес роутера не настроен."
                isLoading = false
                return@launch
            }
            // Передаём историю без системных сообщений — backend сам добавит контекст
            val history = messages.dropLast(1) // всё кроме только что добавленного
            repository.ask(
                baseUrl = baseUrl,
                question = text.trim(),
                status = currentStatus,
                history = history
            ).onSuccess { answer ->
                messages.add(ChatMessage("assistant", answer))
            }.onFailure { e ->
                errorMessage = e.message ?: "Не удалось получить ответ."
                // Убираем сообщение пользователя из истории при ошибке сети
                if (messages.lastOrNull() == userMsg) messages.removeLastOrNull()
            }
            isLoading = false
        }
    }

    fun clearError() { errorMessage = null }
}

class AiChatViewModelFactory(private val context: Context) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return AiChatViewModel(AiRepository(context.applicationContext), context.applicationContext) as T
    }
}
