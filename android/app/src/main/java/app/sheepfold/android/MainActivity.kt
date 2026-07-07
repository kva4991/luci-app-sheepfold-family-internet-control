package app.sheepfold.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.ui.main.SheepfoldMainScreen
import app.sheepfold.android.ui.setup.RouterSetupScreen
import app.sheepfold.android.ui.theme.OvcharnyaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SheepfoldNotifications.ensureChannels(this)
        setContent {
            OvcharnyaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    SheepfoldApp()
                }
            }
        }
    }
}

@Composable
private fun SheepfoldApp() {
    val context = LocalContext.current
    var setupComplete by remember { mutableStateOf(SheepfoldConnectionStore.hasConnection(context)) }
    var connection by remember { mutableStateOf(SheepfoldConnectionStore.read(context)) }

    if (setupComplete) {
        SheepfoldMainScreen(connection = connection)
    } else {
        RouterSetupScreen(onSetupComplete = { request ->
            if (request != null) {
                SheepfoldConnectionStore.save(context, request)
                connection = request
            }
            setupComplete = true
        })
    }
}
