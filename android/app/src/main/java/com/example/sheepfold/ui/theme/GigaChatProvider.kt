package com.example.sheepfold.ui.theme

// ============================================================
// Провайдер GigaChat (Сбербанк) — бесплатный tier через OAuth2
// Документация: https://developers.sber.ru/docs/ru/gigachat/api/overview
//
// ВАЖНО: GigaChat требует авторизацию через ClientCredentials OAuth2.
// Токен живёт 30 минут — реализован автоматический рефреш.
// Scope: GIGACHAT_API_PERS — для физических лиц, бесплатно.
// ============================================================

import kotlinx.serialization.Serializable

// Модели GigaChat которые доступны на бесплатном тарифе
enum class GigaChatModel(val apiName: String, val displayName: String) {
    // GigaChat — базовая модель, бесплатно без ограничений для физлиц
    LITE("GigaChat", "GigaChat (бесплатно)"),
    // GigaChat Pro — платная, но оставим для будущего расширения
    PRO("GigaChat-Pro", "GigaChat Pro")
}

@Serializable
data class GigaChatMessage(
    val role: String,   // "user" или "assistant"
    val content: String
)

@Serializable
data class GigaChatRequest(
    val model: String,
    val messages: List<GigaChatMessage>,
    // Температура 0.7 — баланс между творчеством и точностью для семейных советов
    val temperature: Float = 0.7f,
    val max_tokens: Int = 1024
)

@Serializable
data class GigaChatResponse(
    val choices: List<GigaChatChoice>
)

@Serializable
data class GigaChatChoice(
    val message: GigaChatMessage
)

// Константы для подключения к GigaChat API
object GigaChatConfig {
    // OAuth2 токен-эндпоинт Сбера
    // Здесь используется продакшн-URL, а не sandbox — они разные!
    const val AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    const val API_URL = "https://gigachat.devices.sberbank.ru/api/v1"
    // Scope для физических лиц — бесплатный доступ
    const val SCOPE = "GIGACHAT_API_PERS"
    // Токен живёт 1800 секунд (30 минут)
    const val TOKEN_TTL_SECONDS = 1800
}
