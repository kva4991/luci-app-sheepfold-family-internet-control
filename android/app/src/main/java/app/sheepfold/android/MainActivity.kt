package app.sheepfold.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import app.sheepfold.android.ui.theme.OvcharnyaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            OvcharnyaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    SheepfoldApp()
                }
            }
        }
    }
}