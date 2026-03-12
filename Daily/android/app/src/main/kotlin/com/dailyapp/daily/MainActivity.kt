package com.dailyapp.daily

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.TimeZone

class MainActivity : FlutterActivity() {
    private val storageChannelName = "daily/storage"
    private val notificationChannelName = "daily/notifications"
    private val notificationPermissionRequest = 54021
    private var notificationPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val storage = DailyStorageDb(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, storageChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "loadState" -> {
                        try {
                            result.success(storage.loadState())
                        } catch (e: Exception) {
                            result.error("LOAD_FAILED", e.message, null)
                        }
                    }
                    "saveState" -> {
                        val payload = call.argument<String>("json")
                        if (payload.isNullOrEmpty()) {
                            result.error("BAD_ARGUMENTS", "Missing payload", null)
                            return@setMethodCallHandler
                        }

                        try {
                            storage.saveState(payload)
                            result.success(null)
                        } catch (e: Exception) {
                            result.error("SAVE_FAILED", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, notificationChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "ensurePermission" -> {
                        requestNotificationPermission(result)
                    }
                    "syncSchedule" -> {
                        val enabled = call.argument<Boolean>("enabled") ?: false
                        val morningTime = call.argument<String>("morningTime")
                            ?: DailyNotificationScheduler.DEFAULT_MORNING_TIME
                        val eveningTime = call.argument<String>("eveningTime")
                            ?: DailyNotificationScheduler.DEFAULT_EVENING_TIME
                        val timezoneId = call.argument<String>("timezoneId")
                            ?: TimeZone.getDefault().id
                        val stateJson = call.argument<String>("stateJson")
                        DailyNotificationScheduler.saveSettings(
                            this,
                            enabled = enabled,
                            morningTime = morningTime,
                            eveningTime = eveningTime,
                            timezoneId = timezoneId,
                            stateJson = stateJson,
                        )
                        DailyNotificationScheduler.syncFromSettings(this)
                        result.success(null)
                    }
                    "getDefaultTimezone" -> {
                        result.success(TimeZone.getDefault().id)
                    }
                    "sendTestNotification" -> {
                        val type = call.argument<String>("type") ?: DailyNotificationScheduler.TYPE_MORNING
                        if (!DailyNotificationScheduler.hasNotificationPermission(this)) {
                            result.success(false)
                            return@setMethodCallHandler
                        }
                        val intent = Intent(this, DailyNotificationReceiver::class.java).apply {
                            putExtra(DailyNotificationScheduler.EXTRA_NOTIFICATION_TYPE, type)
                            putExtra(DailyNotificationScheduler.EXTRA_FORCE, true)
                        }
                        DailyNotificationReceiver().onReceive(this, intent)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun requestNotificationPermission(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.success(true)
            return
        }
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            result.success(true)
            return
        }

        if (notificationPermissionResult != null) {
            result.error("IN_PROGRESS", "Permission request already in progress", null)
            return
        }

        notificationPermissionResult = result
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            notificationPermissionRequest,
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        if (requestCode == notificationPermissionRequest) {
            val granted = grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            notificationPermissionResult?.success(granted)
            notificationPermissionResult = null

            if (granted) {
                DailyNotificationScheduler.syncFromSettings(this)
            }
            return
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
}

class DailyStorageDb(context: Context) : SQLiteOpenHelper(
    context,
    DB_NAME,
    null,
    DB_VERSION,
) {
    private val appContext = context.applicationContext

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Single-table snapshot storage. No migration needed for v1.
    }

    fun loadState(): String? {
        val db = readableDatabase
        db.rawQuery(
            "SELECT payload FROM app_state WHERE id = 1 LIMIT 1",
            null,
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                return cursor.getString(0)
            }
        }
        return appContext.getSharedPreferences(BACKUP_PREFS, Context.MODE_PRIVATE)
            .getString(BACKUP_PAYLOAD_KEY, null)
    }

    fun saveState(payload: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("id", 1)
            put("payload", payload)
            put("updated_at", System.currentTimeMillis())
        }
        db.insertWithOnConflict(
            "app_state",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
        appContext.getSharedPreferences(BACKUP_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(BACKUP_PAYLOAD_KEY, payload)
            .apply()
    }

    companion object {
        private const val DB_NAME = "daily_state.db"
        private const val DB_VERSION = 1
        private const val BACKUP_PREFS = "daily_storage_backup"
        private const val BACKUP_PAYLOAD_KEY = "state_json_backup"
    }
}
