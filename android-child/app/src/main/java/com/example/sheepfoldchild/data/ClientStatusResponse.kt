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
    val deviceId: String?,
    val deviceName: String?,
    val isAdministrator: Boolean,
    val clientRole: String,
    val internetState: String,
    val accessMode: String?,
    val accessEndsAt: String?,
    val minutesRemaining: Int?,
    val message: String?
)

data class ApiError(
    val code: String,
    val message: String
)
