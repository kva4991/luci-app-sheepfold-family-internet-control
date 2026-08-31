package app.sheepfold.android.ui.main

/*
 * После согласования макета рисует production DeviceCard/фильтр в пустой Activity.
 * Снимок не содержит данных семьи и не делает API-вызовов; не проверяет firewall. §andlab1
 */
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemeMode
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceCardsPreviewTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun renderProposal() {
        compose.setContent {
            SheepfoldTheme(ThemeMode.LIGHT) {
                CompositionLocalProvider(LocalDensity provides Density(1.5f, 1f)) {
                    Column(Modifier.width(360.dp).background(MaterialTheme.colorScheme.background)
                        .testTag("deviceProposal").padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("Устройства", Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
                            IconButton(onClick = {}) { Icon(painterResource(R.drawable.ic_refresh), "Обновить") }
                        }
                        DeviceFilterField(DeviceFilter.PERSONAL) {}
                        DeviceCard(RouterDevice("7", "Телефон ребёнка", "192.0.2.7", "02:00:00:00:00:07", "Первый ребёнок", "phone", false, "scheduled", false),
                            onEdit = {}, onAction = {}, writeEnabled = true, temporaryAccessEnabled = true)
                        DeviceCard(RouterDevice("8", "Планшет", "192.0.2.8", "02:00:00:00:00:08", "Второй ребёнок", "tablet", false, "blocked", false),
                            onEdit = {}, onAction = {}, writeEnabled = true)
                    }
                }
            }
        }
        compose.waitForIdle()
        val bitmap = compose.onNodeWithTag("deviceProposal").captureToImage().asAndroidBitmap()
        File(compose.activity.cacheDir, "device-cards-proposal.png").outputStream().use {
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
        }
    }
}
