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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.security.AppProtectionMode
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

@Composable
fun AppUnlockScreen(
    mode: AppProtectionMode,
    onVerify: (String) -> Boolean,
    onUnlocked: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val biometricMode = mode == AppProtectionMode.FACE || mode == AppProtectionMode.FINGERPRINT
    var secret by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    var biometricError by remember { mutableStateOf<String?>(null) }

    fun requestBiometricUnlock() {
        val host = activity ?: run {
            biometricError = context.getString(R.string.unlock_biometric_unavailable)
            return
        }
        val prompt = BiometricPrompt(
            host,
            ContextCompat.getMainExecutor(host),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    biometricError = null
                    onUnlocked()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                        errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON
                    ) {
                        biometricError = errString.toString()
                    }
                }

                override fun onAuthenticationFailed() {
                    biometricError = context.getString(R.string.unlock_biometric_failed)
                }
            }
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(context.getString(R.string.unlock_title))
                .setSubtitle(context.getString(R.string.unlock_biometric_prompt))
                .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .setNegativeButtonText(context.getString(R.string.action_cancel))
                .build()
        )
    }

    LaunchedEffect(mode) {
        if (biometricMode) requestBiometricUnlock()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.unlock_title), style = MaterialTheme.typography.headlineSmall)
        if (biometricMode) {
            Text(
                stringResource(R.string.unlock_biometric_prompt),
                modifier = Modifier.padding(top = 10.dp, bottom = 16.dp)
            )
            biometricError?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Button(
                onClick = ::requestBiometricUnlock,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.unlock_biometric_retry))
            }
            return@Column
        }
        Text(
            stringResource(if (mode == AppProtectionMode.PIN) R.string.unlock_enter_pin else R.string.unlock_enter_password),
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
            Text(stringResource(R.string.unlock_invalid), color = MaterialTheme.colorScheme.error)
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
            Text(stringResource(R.string.unlock_open))
        }
    }
}
