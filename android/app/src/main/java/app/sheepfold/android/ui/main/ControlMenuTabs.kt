package app.sheepfold.android.ui.main

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sheepfold.android.R
import java.text.DateFormat
import java.util.Date

data class MainMenuItem(
    val key: String,
    val title: String,
    @DrawableRes val iconRes: Int
)

@Composable
fun ControlTab(
    routerName: String,
    globalBlocked: Boolean?,
    isLoading: Boolean,
    message: String?,
    onRefresh: () -> Unit,
    onBlock: (Boolean) -> Unit,
    lastUpdated: Long? = null
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
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
                    when (globalBlocked) {
                        true -> R.string.router_now_disabled
                        false -> R.string.router_now_enabled
                        null -> R.string.router_state_unknown
                    }
                ),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium
            )
            IconButton(
                onClick = onRefresh,
                enabled = !isLoading,
                modifier = Modifier
                    .size(48.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
            ) {
                Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                    Icon(
                        painter = painterResource(R.drawable.ic_refresh),
                        contentDescription = stringResource(R.string.action_refresh),
                        modifier = Modifier.size(30.dp),
                        tint = if (isLoading) {
                            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                        } else {
                            MaterialTheme.colorScheme.primary
                        }
                    )
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.matchParentSize(), strokeWidth = 3.dp)
                    }
                }
            }
        }
        lastUpdated?.let {
            val time = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it))
            Text(
                stringResource(if (globalBlocked == null) R.string.router_last_reply else R.string.router_updated_at, time),
                style = MaterialTheme.typography.bodySmall
            )
        }
        Button(
            onClick = { onBlock(false) },
            enabled = !isLoading && globalBlocked == true,
            modifier = Modifier
                .fillMaxWidth()
                .height(108.dp),
            // Цвет обозначает доступную команду, а не текущее состояние интернета §uicontrast
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF178447),
                contentColor = Color.White,
                disabledContainerColor = Color(0xFFD1D1D1),
                disabledContentColor = Color(0xFF575757)
            )
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(R.string.router_turn_internet_on), fontSize = 18.sp)
                if (globalBlocked == null) Text(stringResource(if (isLoading) R.string.router_getting_state else R.string.router_state_unknown), style = MaterialTheme.typography.bodySmall)
            }
        }
        Button(
            onClick = { onBlock(true) },
            enabled = !isLoading && globalBlocked == false,
            modifier = Modifier
                .fillMaxWidth()
                .height(108.dp),
            // Неактивные команды имеют одинаковую серую палитру в обеих темах §uicontrast
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFC62828),
                contentColor = Color.White,
                disabledContainerColor = Color(0xFFD1D1D1),
                disabledContentColor = Color(0xFF575757)
            )
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(R.string.router_turn_internet_off), fontSize = 18.sp)
                if (globalBlocked == null) Text(stringResource(if (isLoading) R.string.router_getting_state else R.string.router_state_unknown), style = MaterialTheme.typography.bodySmall)
            }
        }
        message?.let { Text(it) }
    }
}

@Composable
fun MenuTab(items: List<MainMenuItem>, onOpen: (String) -> Unit) {
    val cardPadding = 14.dp
    val titleStyle = MaterialTheme.typography.titleMedium.copy(
        hyphens = Hyphens.None,
        lineBreak = LineBreak.Heading
    )
    val measurer = rememberTextMeasurer()
    val wordWidth = remember(items, measurer, titleStyle) {
        items.flatMap { it.title.split(Regex("\\s+")) }.maxOfOrNull { word ->
            measurer.measure(word, style = titleStyle, softWrap = false).size.width
        } ?: 0
    }
    // Размер шрифта не уменьшаем: перевод и системный масштаб определяют число колонок.
    val minCellWidth = maxOf(148.dp, with(LocalDensity.current) { wordWidth.toDp() } + cardPadding * 2 + 2.dp)
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = minCellWidth),
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
                    .heightIn(min = 112.dp)
                    .clickable { onOpen(item.key) },
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(cardPadding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        painter = painterResource(item.iconRes),
                        contentDescription = null,
                        modifier = Modifier.size(34.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(item.title, style = titleStyle, textAlign = TextAlign.Center)
                    Spacer(
                        Modifier
                            .fillMaxWidth()
                            .height(2.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.45f))
                    )
                }
            }
        }
    }
}
