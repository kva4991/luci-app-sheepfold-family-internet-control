package app.sheepfold.android.ui.security

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.sheepfold.android.R
import app.sheepfold.android.security.AppProtectionMode
import app.sheepfold.android.security.AppProtectionStore
import app.sheepfold.android.security.AppUnlockAttempt
import kotlinx.coroutines.delay

@Composable
fun AppUnlockScreen(
    mode: AppProtectionMode,
    onVerify: (String) -> AppUnlockAttempt,
    onUnlocked: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val biometricMode = mode == AppProtectionMode.BIOMETRIC
    var secret by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    var verifying by remember { mutableStateOf(false) }
    var biometricError by remember { mutableStateOf<String?>(null) }
    var retryAfterSeconds by remember { mutableLongStateOf(AppProtectionStore.remainingBackoffSeconds(context)) }

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

    LaunchedEffect(retryAfterSeconds) {
        if (retryAfterSeconds <= 0L) return@LaunchedEffect
        while (retryAfterSeconds > 0L) {
            delay(1_000L)
            retryAfterSeconds = AppProtectionStore.remainingBackoffSeconds(context)
        }
        error = false
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
            isError = error,
            enabled = retryAfterSeconds <= 0L && !verifying
        )
        when {
            retryAfterSeconds > 0L -> Text(
                stringResource(R.string.unlock_retry_after_seconds, retryAfterSeconds),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
            error -> Text(
                stringResource(R.string.unlock_invalid),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        Button(
            enabled = secret.isNotBlank() && retryAfterSeconds <= 0L && !verifying,
            onClick = {
                verifying = true
                val attempt = onVerify(secret)
                verifying = false
                if (attempt.success) {
                    secret = ""
                    error = false
                    onUnlocked()
                } else {
                    secret = ""
                    error = true
                    retryAfterSeconds = attempt.retryAfterSeconds
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
        ) {
            if (verifying) CircularProgressIndicator() else Text(stringResource(R.string.unlock_open))
        }
    }
}
