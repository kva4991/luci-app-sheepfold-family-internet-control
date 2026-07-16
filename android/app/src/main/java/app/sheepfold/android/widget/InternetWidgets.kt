package app.sheepfold.android.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.SheepfoldConnectionStore
import kotlinx.coroutines.runBlocking

private const val actionSetInternetEnabled = "app.sheepfold.android.widget.SET_INTERNET_ENABLED"
private const val actionSetInternetDisabled = "app.sheepfold.android.widget.SET_INTERNET_DISABLED"
private const val statePrefs = "sheepfold-widget-state"
private const val stateGlobalBlocked = "globalBlocked"

class InternetEnabledWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        SheepfoldWidgetRenderer.updateEnabledWidgets(context, manager, ids)
        SheepfoldWidgetRenderer.refreshFromRouter(context)
    }
}

class InternetDisabledWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        SheepfoldWidgetRenderer.updateDisabledWidgets(context, manager, ids)
        SheepfoldWidgetRenderer.refreshFromRouter(context)
    }
}

class InternetSwitchWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        SheepfoldWidgetRenderer.updateSwitchWidgets(context, manager, ids)
        SheepfoldWidgetRenderer.refreshFromRouter(context)
    }
}

class SheepfoldWidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val blocked = when (intent.action) {
            actionSetInternetEnabled -> false
            actionSetInternetDisabled -> true
            else -> return
        }
        val pending = goAsync()
        Thread {
            try {
                val connection = SheepfoldConnectionStore.read(context) ?: return@Thread
                runBlocking { RouterAdminClient(connection, context).setGlobalBlock(blocked) }
                SheepfoldWidgetRenderer.storeState(context, blocked)
            } finally {
                SheepfoldWidgetRenderer.updateAllWidgets(context)
                pending.finish()
            }
        }.start()
    }
}

object SheepfoldWidgetRenderer {
    fun refreshFromRouter(context: Context) {
        Thread {
            val connection = SheepfoldConnectionStore.read(context) ?: return@Thread
            val snapshot = runCatching {
                runBlocking { RouterAdminClient(connection, context).loadRouterInfo() }
            }.getOrNull()
                ?: return@Thread
            storeState(context, snapshot.globalBlocked)
            updateAllWidgets(context)
        }.start()
    }

    fun storeState(context: Context, blocked: Boolean) {
        context.getSharedPreferences(statePrefs, Context.MODE_PRIVATE).edit()
            .putBoolean(stateGlobalBlocked, blocked)
            .apply()
    }

    private fun isBlocked(context: Context): Boolean =
        context.getSharedPreferences(statePrefs, Context.MODE_PRIVATE).getBoolean(stateGlobalBlocked, false)

    fun updateAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        updateEnabledWidgets(context, manager, manager.getAppWidgetIds(ComponentName(context, InternetEnabledWidgetProvider::class.java)))
        updateDisabledWidgets(context, manager, manager.getAppWidgetIds(ComponentName(context, InternetDisabledWidgetProvider::class.java)))
        updateSwitchWidgets(context, manager, manager.getAppWidgetIds(ComponentName(context, InternetSwitchWidgetProvider::class.java)))
    }

    fun updateEnabledWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, singleButtonView(context, false, it)) }
    }

    fun updateDisabledWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, singleButtonView(context, true, it)) }
    }

    fun updateSwitchWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val blocked = isBlocked(context)
        ids.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.widget_internet_switch)
            views.setInt(R.id.widgetEnableButton, "setBackgroundResource", if (!blocked) R.drawable.widget_button_green_active else R.drawable.widget_button_green_inactive)
            views.setInt(R.id.widgetDisableButton, "setBackgroundResource", if (blocked) R.drawable.widget_button_red_active else R.drawable.widget_button_red_inactive)
            views.setOnClickPendingIntent(R.id.widgetEnableButton, actionIntent(context, false, id + 1000))
            views.setOnClickPendingIntent(R.id.widgetDisableButton, actionIntent(context, true, id + 2000))
            manager.updateAppWidget(id, views)
        }
    }

    private fun singleButtonView(context: Context, blockedButton: Boolean, id: Int): RemoteViews {
        val blocked = isBlocked(context)
        return RemoteViews(context.packageName, R.layout.widget_internet_single).apply {
            setTextViewText(R.id.widgetButton, if (blockedButton) "OFF" else "ON")
            setInt(
                R.id.widgetButton,
                "setBackgroundResource",
                when {
                    blockedButton && blocked -> R.drawable.widget_button_red_active
                    blockedButton -> R.drawable.widget_button_red_inactive
                    !blocked -> R.drawable.widget_button_green_active
                    else -> R.drawable.widget_button_green_inactive
                }
            )
            setOnClickPendingIntent(R.id.widgetButton, actionIntent(context, blockedButton, id))
        }
    }

    private fun actionIntent(context: Context, blocked: Boolean, requestCode: Int): PendingIntent {
        val action = if (blocked) actionSetInternetDisabled else actionSetInternetEnabled
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, SheepfoldWidgetActionReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
