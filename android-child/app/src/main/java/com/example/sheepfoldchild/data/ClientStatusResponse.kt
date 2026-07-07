package com.example.sheepfoldchild.data

/**
 * Ответ endpoint /cgi-bin/sheepfold-api/client-status.
 * MAC определяется на роутере по REMOTE_ADDR — клиент ничего не передаёт.
 */
data class ClientStatusResponse(
    val ok: Boolean,
    val apiVersion: String?,
    val serverTime: String?,
    val data: ClientStatusData?,
    val error: ApiError?
)

data class ClientStatusData(
    val deviceName: String?,
    val internetState: String,   // "enabled" | "disabled" | "unknown"
    val accessMode: String?,     // "allowlist" | "blocked" | "scheduled" | "temporary" | "restricted" | "unknown"
    val accessEndsAt: String?,   // ISO-8601 или null
    val minutesRemaining: Int?,  // null если accessEndsAt == null
    val message: String?
)

data class ApiError(
    val code: String,
    val message: String
)
