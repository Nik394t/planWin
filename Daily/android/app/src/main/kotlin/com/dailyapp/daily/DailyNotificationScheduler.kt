package com.dailyapp.daily

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

object DailyNotificationScheduler {
    private const val PREFS_NAME = "daily_notification_prefs"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_MORNING_TIME = "morning_time"
    private const val KEY_EVENING_TIME = "evening_time"
    private const val KEY_TIMEZONE_ID = "timezone_id"
    private const val KEY_STATE_JSON = "state_json"
    private const val KEY_TASK_REQUEST_CODES = "task_request_codes"

    const val CHANNEL_ID = "daily_reminders"
    const val CHANNEL_NAME = "Daily reminders"
    const val CHANNEL_DESC = "Ежедневные напоминания Daily"

    const val TYPE_MORNING = "morning"
    const val TYPE_EVENING = "evening"
    const val TYPE_TASK = "task"

    const val EXTRA_NOTIFICATION_TYPE = "notification_type"
    const val EXTRA_FORCE = "force_notification"
    const val EXTRA_TASK_ID = "task_id"
    const val EXTRA_TASK_TITLE = "task_title"
    const val EXTRA_TASK_PERIOD_KEY = "task_period_key"
    const val EXTRA_TASK_TIME = "task_time"
    const val EXTRA_TASK_REMINDER_DATE = "task_reminder_date"

    private const val REQUEST_CODE_MORNING = 31001
    private const val REQUEST_CODE_EVENING = 31002
    private const val REQUEST_CODE_TASK_BASE = 32000

    const val DEFAULT_MORNING_TIME = "06:00"
    const val DEFAULT_EVENING_TIME = "18:00"

    data class NotificationSettings(
        val enabled: Boolean,
        val morningTime: String,
        val eveningTime: String,
        val timezoneId: String,
        val stateJson: String?,
    )

    fun saveSettings(
        context: Context,
        enabled: Boolean,
        morningTime: String,
        eveningTime: String,
        timezoneId: String,
        stateJson: String?,
    ) {
        val tz = timezoneId.trim().ifEmpty { TimeZone.getDefault().id }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putString(KEY_MORNING_TIME, normalizeTime(morningTime, DEFAULT_MORNING_TIME))
            .putString(KEY_EVENING_TIME, normalizeTime(eveningTime, DEFAULT_EVENING_TIME))
            .putString(KEY_TIMEZONE_ID, tz)
            .putString(KEY_STATE_JSON, stateJson)
            .apply()
    }

    fun readSettings(context: Context): NotificationSettings {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val enabled = prefs.getBoolean(KEY_ENABLED, false)
        val morningRaw = prefs.getString(KEY_MORNING_TIME, DEFAULT_MORNING_TIME) ?: DEFAULT_MORNING_TIME
        val eveningRaw = prefs.getString(KEY_EVENING_TIME, DEFAULT_EVENING_TIME) ?: DEFAULT_EVENING_TIME
        val timezone = prefs.getString(KEY_TIMEZONE_ID, TimeZone.getDefault().id)
            ?.trim()
            ?.ifEmpty { TimeZone.getDefault().id }
            ?: TimeZone.getDefault().id

        return NotificationSettings(
            enabled = enabled,
            morningTime = normalizeTime(morningRaw, DEFAULT_MORNING_TIME),
            eveningTime = normalizeTime(eveningRaw, DEFAULT_EVENING_TIME),
            timezoneId = timezone,
            stateJson = prefs.getString(KEY_STATE_JSON, null),
        )
    }

    fun syncFromSettings(context: Context) {
        val settings = readSettings(context)
        if (settings.enabled && hasNotificationPermission(context)) {
            scheduleAll(context, settings)
        } else {
            cancelAll(context)
        }
    }

    fun scheduleNext(context: Context, type: String) {
        val settings = readSettings(context)
        if (!settings.enabled || !hasNotificationPermission(context)) {
            cancelAll(context)
            return
        }
        when (type) {
            TYPE_MORNING -> scheduleSingle(context, TYPE_MORNING, settings.morningTime, settings.timezoneId)
            TYPE_EVENING -> scheduleSingle(context, TYPE_EVENING, settings.eveningTime, settings.timezoneId)
            TYPE_TASK -> Unit
        }
    }

    private fun scheduleAll(context: Context, settings: NotificationSettings) {
        createNotificationChannel(context)
        scheduleSingle(context, TYPE_MORNING, settings.morningTime, settings.timezoneId)
        scheduleSingle(context, TYPE_EVENING, settings.eveningTime, settings.timezoneId)
        scheduleTaskReminders(context, settings)
    }

    private fun scheduleSingle(
        context: Context,
        type: String,
        time: String,
        timezoneId: String,
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = pendingIntent(context, type)
        alarmManager.cancel(pending)

        val triggerAt = nextTriggerTime(time, timezoneId)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pending,
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pending,
            )
        } else {
            alarmManager.set(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pending,
            )
        }
    }

    fun cancelAll(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(context, TYPE_MORNING))
        alarmManager.cancel(pendingIntent(context, TYPE_EVENING))
        cancelTaskReminders(context)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = CHANNEL_DESC
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    fun readStateJson(context: Context): String? {
        return readSettings(context).stateJson
    }

    private data class ReminderPayload(
        val dateKey: String,
        val time: String,
    )

    private fun scheduleTaskReminders(context: Context, settings: NotificationSettings) {
        cancelTaskReminders(context)
        val stateJson = settings.stateJson ?: return

        val scheduledRequestCodes = mutableSetOf<String>()
        try {
            val root = JSONObject(stateJson)
            val tasks = root.optJSONArray("tasks") ?: return
            val zone = TimeZone.getTimeZone(settings.timezoneId)
            val nowMillis = Calendar.getInstance(zone).timeInMillis
            val todayKey = todayKeyForTimezone(settings.timezoneId)
            val finalizedMarkers = parseFinalizedMarkers(root)

            for (taskIndex in 0 until tasks.length()) {
                val task = tasks.optJSONObject(taskIndex) ?: continue
                val taskId = task.optInt("id", 0)
                if (taskId <= 0) {
                    continue
                }

                val taskTitle = task.optString("title", "Задача")
                val scope = task.optString("scope", "")
                val periodKey = task.optString("periodKey", "")
                val taskLocked = jsonBool(task.opt("isLocked"))
                val taskDone = jsonBool(task.opt("isDone"))
                if (taskDone) {
                    continue
                }
                if (isPeriodClosedForReminders(scope, periodKey, finalizedMarkers, settings.timezoneId)) {
                    continue
                }

                val reminders = parseReminderPayloads(
                    task = task,
                    fallbackDateKey = if (isValidDayKey(periodKey)) periodKey else todayKey,
                )
                val remindersEnabled = if (task.has("remindersEnabled")) {
                    task.optBoolean("remindersEnabled", false)
                } else {
                    reminders.isNotEmpty()
                }

                if (!remindersEnabled || reminders.isEmpty()) {
                    continue
                }

                val processedLockedTimes = mutableSetOf<String>()
                for ((index, reminder) in reminders.withIndex()) {
                    if (taskLocked && !processedLockedTimes.add(reminder.time)) {
                        continue
                    }
                    val triggerAt = if (taskLocked) {
                        nextTriggerTimeFromDate(
                            reminderTime = reminder.time,
                            timezoneId = settings.timezoneId,
                            startDateKey = reminder.dateKey,
                        )
                    } else {
                        triggerAtForDayTime(
                            periodKey = reminder.dateKey,
                            reminderTime = reminder.time,
                            timezoneId = settings.timezoneId,
                        )
                    } ?: continue

                    if (!taskLocked && triggerAt <= nowMillis) {
                        continue
                    }

                    val requestCode = taskReminderRequestCode(
                        taskId = taskId,
                        reminderDate = reminder.dateKey,
                        reminderTime = reminder.time,
                        isLocked = taskLocked,
                        reminderIndex = index,
                    )
                    val pendingIntent = taskReminderPendingIntent(
                        context = context,
                        requestCode = requestCode,
                        taskId = taskId,
                        taskTitle = taskTitle,
                        periodKey = periodKey,
                        reminderDate = reminder.dateKey,
                        reminderTime = reminder.time,
                    )
                    scheduleExact(context, triggerAt, pendingIntent)
                    scheduledRequestCodes.add(requestCode.toString())
                }
            }
        } catch (_: Exception) {
            return
        } finally {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_TASK_REQUEST_CODES, scheduledRequestCodes)
                .apply()
        }
    }

    private fun cancelTaskReminders(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedCodes = prefs.getStringSet(KEY_TASK_REQUEST_CODES, emptySet())
            ?.toSet()
            ?: emptySet()
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (value in savedCodes) {
            val requestCode = value.toIntOrNull() ?: continue
            alarmManager.cancel(taskReminderPendingIntent(context, requestCode))
        }
        prefs.edit().remove(KEY_TASK_REQUEST_CODES).apply()
    }

    private fun scheduleExact(
        context: Context,
        triggerAt: Long,
        pendingIntent: PendingIntent,
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pendingIntent,
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pendingIntent,
            )
        } else {
            alarmManager.set(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pendingIntent,
            )
        }
    }

    private fun taskReminderPendingIntent(
        context: Context,
        requestCode: Int,
        taskId: Int? = null,
        taskTitle: String? = null,
        periodKey: String? = null,
        reminderDate: String? = null,
        reminderTime: String? = null,
    ): PendingIntent {
        val intent = Intent(context, DailyNotificationReceiver::class.java).apply {
            putExtra(EXTRA_NOTIFICATION_TYPE, TYPE_TASK)
            if (taskId != null) {
                putExtra(EXTRA_TASK_ID, taskId)
            }
            if (taskTitle != null) {
                putExtra(EXTRA_TASK_TITLE, taskTitle)
            }
            if (periodKey != null) {
                putExtra(EXTRA_TASK_PERIOD_KEY, periodKey)
            }
            if (reminderDate != null) {
                putExtra(EXTRA_TASK_REMINDER_DATE, reminderDate)
            }
            if (reminderTime != null) {
                putExtra(EXTRA_TASK_TIME, reminderTime)
            }
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun taskReminderRequestCode(
        taskId: Int,
        reminderDate: String,
        reminderTime: String,
        isLocked: Boolean,
        reminderIndex: Int,
    ): Int {
        val raw = "$taskId|$reminderDate|$reminderTime|$isLocked|$reminderIndex".hashCode()
        val offset = raw and 0x7FFFFFF
        return REQUEST_CODE_TASK_BASE + (offset % 20000000)
    }

    private fun parseReminderPayloads(
        task: JSONObject,
        fallbackDateKey: String,
    ): List<ReminderPayload> {
        val values = mutableListOf<ReminderPayload>()

        val reminders = task.optJSONArray("reminders")
        if (reminders != null) {
            for (index in 0 until reminders.length()) {
                val item = reminders.optJSONObject(index) ?: continue
                val dateKeyRaw = item.optString("dateKey", fallbackDateKey).trim()
                val timeRaw = item.optString("time", "")
                val time = normalizeTime(timeRaw, "")
                if (!isValidDayKey(dateKeyRaw) || time.isEmpty()) {
                    continue
                }
                values.add(ReminderPayload(dateKey = dateKeyRaw, time = time))
            }
        }

        if (values.isEmpty()) {
            val legacyTimes = task.optJSONArray("reminderTimes")
            if (legacyTimes != null) {
                for (index in 0 until legacyTimes.length()) {
                    val raw = legacyTimes.optString(index, "")
                    val time = normalizeTime(raw, "")
                    if (time.isEmpty()) {
                        continue
                    }
                    values.add(ReminderPayload(dateKey = fallbackDateKey, time = time))
                }
            }
        }

        val unique = linkedMapOf<String, ReminderPayload>()
        for (item in values) {
            unique.putIfAbsent("${item.dateKey}|${item.time}", item)
        }
        return unique.values.toList()
    }

    private fun nextTriggerTimeFromDate(
        reminderTime: String,
        timezoneId: String,
        startDateKey: String,
    ): Long? {
        val fromDate = triggerAtForDayTime(
            periodKey = startDateKey,
            reminderTime = reminderTime,
            timezoneId = timezoneId,
        ) ?: return null
        val nextDaily = nextTriggerTime(reminderTime, timezoneId)
        return maxOf(fromDate, nextDaily)
    }

    private fun triggerAtForDayTime(
        periodKey: String,
        reminderTime: String,
        timezoneId: String,
    ): Long? {
        val dayParts = periodKey.split("-")
        if (dayParts.size != 3) {
            return null
        }
        val year = dayParts[0].toIntOrNull() ?: return null
        val month = dayParts[1].toIntOrNull() ?: return null
        val day = dayParts[2].toIntOrNull() ?: return null
        if (month !in 1..12 || day !in 1..31) {
            return null
        }

        val timeParts = reminderTime.split(":")
        if (timeParts.size != 2) {
            return null
        }
        val hour = timeParts[0].toIntOrNull() ?: return null
        val minute = timeParts[1].toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) {
            return null
        }

        val zone = TimeZone.getTimeZone(timezoneId)
        val trigger = Calendar.getInstance(zone).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return trigger.timeInMillis
    }

    private fun isValidDayKey(value: String): Boolean {
        return Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)
    }

    fun parseFinalizedMarkers(root: JSONObject): Set<String> {
        val markers = mutableSetOf<String>()
        val raw = root.optJSONArray("finalizedPeriods") ?: return markers
        for (index in 0 until raw.length()) {
            val value = raw.optString(index, "").trim()
            if (value.isNotEmpty()) {
                markers.add(value)
            }
        }
        return markers
    }

    fun isPeriodClosedForReminders(
        scope: String,
        periodKey: String,
        finalizedMarkers: Set<String>,
        timezoneId: String,
    ): Boolean {
        val cleanScope = scope.trim().lowercase()
        val cleanPeriodKey = periodKey.trim()
        if (cleanScope.isEmpty() || cleanPeriodKey.isEmpty()) {
            return true
        }
        val marker = periodMarker(cleanScope, cleanPeriodKey)
        if (finalizedMarkers.contains(marker)) {
            return true
        }
        return isPeriodOver(cleanScope, cleanPeriodKey, timezoneId)
    }

    private fun periodMarker(scope: String, periodKey: String): String {
        return "$scope|$periodKey"
    }

    private fun isPeriodOver(scope: String, periodKey: String, timezoneId: String): Boolean {
        val today = todayCalendar(timezoneId)
        return when (scope) {
            "day" -> {
                val start = dayCalendar(periodKey, timezoneId) ?: return true
                start.before(today)
            }
            "week" -> {
                val start = weekStartCalendar(periodKey, timezoneId) ?: return true
                val end = (start.clone() as Calendar).apply {
                    add(Calendar.DAY_OF_MONTH, 6)
                }
                end.before(today)
            }
            "month" -> {
                val start = monthStartCalendar(periodKey, timezoneId) ?: return true
                val end = (start.clone() as Calendar).apply {
                    set(Calendar.DAY_OF_MONTH, getActualMaximum(Calendar.DAY_OF_MONTH))
                }
                end.before(today)
            }
            "year" -> {
                val year = periodKey.toIntOrNull() ?: return true
                year < today.get(Calendar.YEAR)
            }
            else -> true
        }
    }

    private fun dayCalendar(key: String, timezoneId: String): Calendar? {
        val parts = key.split("-")
        if (parts.size != 3) {
            return null
        }
        val year = parts[0].toIntOrNull() ?: return null
        val month = parts[1].toIntOrNull() ?: return null
        val day = parts[2].toIntOrNull() ?: return null
        if (month !in 1..12 || day !in 1..31) {
            return null
        }
        return Calendar.getInstance(TimeZone.getTimeZone(timezoneId)).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }

    private fun monthStartCalendar(key: String, timezoneId: String): Calendar? {
        val parts = key.split("-")
        if (parts.size != 2) {
            return null
        }
        val year = parts[0].toIntOrNull() ?: return null
        val month = parts[1].toIntOrNull() ?: return null
        if (month !in 1..12) {
            return null
        }
        return Calendar.getInstance(TimeZone.getTimeZone(timezoneId)).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }

    private fun weekStartCalendar(key: String, timezoneId: String): Calendar? {
        val parts = key.split("-W")
        if (parts.size != 2) {
            return null
        }
        val year = parts[0].toIntOrNull() ?: return null
        val week = parts[1].toIntOrNull() ?: return null
        if (week !in 1..53) {
            return null
        }
        val weekOneMonday = startOfIsoWeek(
            Calendar.getInstance(TimeZone.getTimeZone(timezoneId)).apply {
                set(Calendar.YEAR, year)
                set(Calendar.MONTH, Calendar.JANUARY)
                set(Calendar.DAY_OF_MONTH, 4)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            },
        )
        return (weekOneMonday.clone() as Calendar).apply {
            add(Calendar.DAY_OF_MONTH, (week - 1) * 7)
        }
    }

    private fun startOfIsoWeek(source: Calendar): Calendar {
        val result = source.clone() as Calendar
        val weekday = result.get(Calendar.DAY_OF_WEEK)
        val shift = when (weekday) {
            Calendar.SUNDAY -> -6
            else -> Calendar.MONDAY - weekday
        }
        result.add(Calendar.DAY_OF_MONTH, shift)
        result.set(Calendar.HOUR_OF_DAY, 0)
        result.set(Calendar.MINUTE, 0)
        result.set(Calendar.SECOND, 0)
        result.set(Calendar.MILLISECOND, 0)
        return result
    }

    private fun todayCalendar(timezoneId: String): Calendar {
        return Calendar.getInstance(TimeZone.getTimeZone(timezoneId)).apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }

    private fun todayKeyForTimezone(timezoneId: String): String {
        val zone = TimeZone.getTimeZone(timezoneId)
        val calendar = Calendar.getInstance(zone)
        val year = calendar.get(Calendar.YEAR)
        val month = calendar.get(Calendar.MONTH) + 1
        val day = calendar.get(Calendar.DAY_OF_MONTH)
        return "%04d-%02d-%02d".format(year, month, day)
    }

    private fun jsonBool(value: Any?): Boolean {
        return when (value) {
            is Boolean -> value
            is Number -> value.toInt() != 0
            is String -> {
                val normalized = value.trim().lowercase()
                normalized == "true" || normalized == "1"
            }
            else -> false
        }
    }

    private fun pendingIntent(context: Context, type: String): PendingIntent {
        val requestCode = if (type == TYPE_MORNING) REQUEST_CODE_MORNING else REQUEST_CODE_EVENING
        val intent = Intent(context, DailyNotificationReceiver::class.java).apply {
            putExtra(EXTRA_NOTIFICATION_TYPE, type)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun nextTriggerTime(time: String, timezoneId: String): Long {
        val normalized = normalizeTime(time, DEFAULT_MORNING_TIME)
        val parts = normalized.split(":")
        val hour = parts[0].toIntOrNull() ?: 6
        val minute = parts[1].toIntOrNull() ?: 0

        val zone = TimeZone.getTimeZone(timezoneId)
        val now = Calendar.getInstance(zone)
        val next = Calendar.getInstance(zone).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (next.timeInMillis <= now.timeInMillis) {
            next.add(Calendar.DAY_OF_YEAR, 1)
        }
        return next.timeInMillis
    }

    private fun normalizeTime(value: String, fallback: String): String {
        val parts = value.split(":")
        if (parts.size != 2) {
            return fallback
        }
        val hour = parts[0].toIntOrNull() ?: return fallback
        val minute = parts[1].toIntOrNull() ?: return fallback
        if (hour !in 0..23 || minute !in 0..59) {
            return fallback
        }
        return "%02d:%02d".format(hour, minute)
    }
}
