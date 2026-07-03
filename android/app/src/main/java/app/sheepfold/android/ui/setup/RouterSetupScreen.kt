package app.sheepfold.android.ui.setup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RouterSetupScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Овчарня",
            style = MaterialTheme.typography.headlineLarge
        )
        Text(
            text = "Подключение к Sheepfold на OpenWRT-роутере",
            style = MaterialTheme.typography.bodyLarge
        )

        SetupCard(
            title = "1. Согласие",
            body = "Перед настройкой нужно принять пользовательское соглашение и обработку необходимых технических данных."
        )
        SetupCard(
            title = "2. Сопряжение",
            body = "Сканируйте QR-код из LuCI или введите адрес роутера, логин администратора и одноразовый код вручную."
        )
        SetupCard(
            title = "3. Настоящий MAC",
            body = "Настройка не идёт дальше, пока домашняя Wi-Fi сеть не использует настоящий MAC этого телефона."
        )
        SetupCard(
            title = "4. Защита приложения",
            body = "Рекомендуется пароль или PIN. Биометрию можно оставить дополнительной, но не основной защитой."
        )
    }
}

@Composable
private fun SetupCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
