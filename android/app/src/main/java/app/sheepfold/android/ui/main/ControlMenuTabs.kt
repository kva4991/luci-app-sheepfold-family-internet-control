package app.sheepfold.android.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sheepfold.android.R

data class MainMenuItem(
    val key: String,
    val title: String
)

@Composable
fun ControlTab(
    routerName: String,
    globalBlocked: Boolean,
    isLoading: Boolean,
    message: String?,
    onRefresh: () -> Unit,
    onBlock: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 8.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            stringResource(R.string.router_label_format, routerName),
            style = MaterialTheme.typography.headlineSmall
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                stringResource(
                    if (globalBlocked) R.string.router_now_disabled else R.string.router_now_enabled
                ),
                style = MaterialTheme.typography.titleMedium
            )
            IconButton(onClick = onRefresh, enabled = !isLoading) {
                Icon(
                    painter = painterResource(R.drawable.ic_refresh),
                    contentDescription = stringResource(R.string.action_refresh)
                )
            }
        }
        Button(
            onClick = { onBlock(false) },
            enabled = !isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (!globalBlocked) Color(0xFF178447) else Color(0xFFB9DCCB),
                contentColor = if (!globalBlocked) Color.White else Color(0xFF315B45)
            )
        ) {
            Text(stringResource(R.string.router_internet_is_enabled), fontSize = 18.sp)
        }
        Button(
            onClick = { onBlock(true) },
            enabled = !isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (globalBlocked) Color(0xFFC62828) else Color(0xFFE8B9B9),
                contentColor = if (globalBlocked) Color.White else Color(0xFF6D3030)
            )
        ) {
            Text(stringResource(R.string.router_internet_is_disabled), fontSize = 18.sp)
        }
        if (isLoading) CircularProgressIndicator()
        message?.let { Text(it) }
    }
}

@Composable
fun MenuTab(items: List<MainMenuItem>, onOpen: (String) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 148.dp),
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(items, key = { it.key }) { item ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(86.dp)
                    .clickable { onOpen(item.key) },
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(item.title, style = MaterialTheme.typography.titleMedium)
                    Spacer(
                        Modifier
                            .padding(top = 8.dp)
                            .fillMaxWidth()
                            .height(2.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.45f))
                    )
                }
            }
        }
    }
}
