package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore

internal val Context.clientDataStore by preferencesDataStore(name = "child_prefs")
