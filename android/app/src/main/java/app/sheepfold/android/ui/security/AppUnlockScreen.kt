package app.sheepfold.android.ui.security

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.sheepfold.android.security.AppProtectionMode

@Composable
fun AppUnlockScreen(
    mode: AppProtectionMode,
    onVerify: (String) -> Boolean,
    onUnlocked: () -> Unit
) {
    var secret by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Разблокировка Sheepfold", style = MaterialTheme.typography.headlineSmall)
        Text(
            if (mode == AppProtectionMode.PIN) "Введите PIN-код" else "Введите пароль",
            modifier = Modifier.padding(top = 10.dp, bottom = 16.dp)
        )
        OutlinedTextField(
            value = secret,
            onValueChange = {
                secret = if (mode == AppProtectionMode.PIN) it.filter(Char::isDigit).take(4) else it
                error = false
            },
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            isError = error
        )
        if (error) {
            Text("Неверное значение", color = MaterialTheme.colorScheme.error)
        }
        Button(
            enabled = secret.isNotBlank(),
            onClick = {
                if (onVerify(secret)) onUnlocked() else error = true
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
        ) {
            Text("Открыть")
        }
    }
}
