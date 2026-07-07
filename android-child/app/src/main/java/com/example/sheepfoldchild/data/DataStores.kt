package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore

internal val Context.clientDataStore by preferencesDataStore(name = "child_prefs")
internal val Context.aiDataStore by preferencesDataStore(name = "child_ai_prefs")
