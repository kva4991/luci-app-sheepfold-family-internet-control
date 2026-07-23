package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import org.json.JSONObject

/** Server capability flags only; the child API does not expose a family-group name. §prodvar */
data class ProductStatus(
    val aiAvailable: Boolean,
    val childAiAllowed: Boolean,
    val personalGroupRequired: Boolean
)

internal val Context.aiDataStore by preferencesDataStore(name = "child_ai_prefs")
private val routerUrlKey = stringPreferencesKey("router_base_url")

fun parseProductStatus(value: JSONObject): ProductStatus = ProductStatus(
    aiAvailable = value.optBoolean("childAiAvailable", false),
    childAiAllowed = value.optBoolean("childAiAllowed", false),
    personalGroupRequired = value.optBoolean("personalGroupRequired", false)
)

suspend fun saveProductRouterUrl(context: Context, baseUrl: String) {
    context.aiDataStore.edit { preferences -> preferences[routerUrlKey] = baseUrl }
}
