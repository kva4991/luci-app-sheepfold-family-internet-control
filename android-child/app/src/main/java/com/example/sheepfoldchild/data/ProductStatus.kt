package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import org.json.JSONObject

/** Серверные поля допуска к AI-чату; отсутствие любого флага безопасно даёт false. §prodvar */
data class ProductStatus(
    val aiAvailable: Boolean,
    val personalGroupName: String?,
    val childAiAllowed: Boolean,
    val personalGroupRequired: Boolean
)

internal val Context.aiDataStore by preferencesDataStore(name = "child_ai_prefs")
private val routerUrlKey = stringPreferencesKey("router_base_url")

fun parseProductStatus(value: JSONObject): ProductStatus = ProductStatus(
    aiAvailable = value.optBoolean("childAiAvailable", false),
    personalGroupName = value.optString("personalGroupName").takeIf { it.isNotBlank() },
    childAiAllowed = value.optBoolean("childAiAllowed", false),
    personalGroupRequired = value.optBoolean("personalGroupRequired", false)
)

suspend fun saveProductRouterUrl(context: Context, baseUrl: String) {
    context.aiDataStore.edit { preferences -> preferences[routerUrlKey] = baseUrl }
}
