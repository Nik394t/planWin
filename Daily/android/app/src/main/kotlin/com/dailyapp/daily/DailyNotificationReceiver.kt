package com.dailyapp.daily

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

class DailyNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val type = intent?.getStringExtra(DailyNotificationScheduler.EXTRA_NOTIFICATION_TYPE)
            ?: DailyNotificationScheduler.TYPE_MORNING
        val force = intent?.getBooleanExtra(DailyNotificationScheduler.EXTRA_FORCE, false) == true

        when (type) {
            DailyNotificationScheduler.TYPE_MORNING,
            DailyNotificationScheduler.TYPE_EVENING,
            -> DailyNotificationScheduler.scheduleNext(context, type)
        }

        if (!DailyNotificationScheduler.hasNotificationPermission(context)) {
            return
        }

        DailyNotificationScheduler.createNotificationChannel(context)

        when (type) {
            DailyNotificationScheduler.TYPE_EVENING -> sendEveningReminderIfNeeded(context, force)
            DailyNotificationScheduler.TYPE_TASK -> sendTaskReminderIfNeeded(context, intent)
            else -> sendMorningReminder(context)
        }
    }

    private fun sendMorningReminder(context: Context) {
        val contentText = "Доброе утро! Зайди в Daily и сформируй план на сегодня."
        val longText =
            "Доброе утро! Зайди в Daily, сформируй план на день и отметь важные задачи."
        sendNotification(
            context = context,
            notificationId = 41002,
            title = "Daily",
            text = contentText,
            longText = longText,
        )
    }

    private fun sendEveningReminderIfNeeded(context: Context, force: Boolean) {
        val settings = DailyNotificationScheduler.readSettings(context)
        var pendingCount = countPendingTasksForToday(context, settings.timezoneId)
        if (pendingCount <= 0 && !force) {
            return
        }
        if (pendingCount <= 0) {
            pendingCount = 1
        }

        val noun = pluralizeTasks(pendingCount)
        val contentText =
            "Уже вечер, но план на сегодня ещё не завершён. Осталось $pendingCount $noun."
        val longText =
            "Уже вечер, но ты так и не выполнил план на сегодня. У тебя ещё " +
                "$pendingCount $noun. Зайди в Daily и давай завершим его сегодня."

        sendNotification(
            context = context,
            notificationId = 41003,
            title = "Daily",
            text = contentText,
            longText = longText,
        )
    }

    private fun sendTaskReminderIfNeeded(context: Context, intent: Intent?) {
        val taskId = intent?.getIntExtra(DailyNotificationScheduler.EXTRA_TASK_ID, 0) ?: 0
        val taskTitle = intent?.getStringExtra(DailyNotificationScheduler.EXTRA_TASK_TITLE)
            ?.trim()
            ?.ifEmpty { "Задача" }
            ?: "Задача"
        val periodKey = intent?.getStringExtra(DailyNotificationScheduler.EXTRA_TASK_PERIOD_KEY)
            ?.trim()
            ?: ""
        val reminderDate = intent?.getStringExtra(DailyNotificationScheduler.EXTRA_TASK_REMINDER_DATE)
            ?.trim()
            ?: ""
        val reminderTime = intent?.getStringExtra(DailyNotificationScheduler.EXTRA_TASK_TIME)
            ?.trim()
            ?: ""

        try {
            if (taskId > 0 && !isTaskReminderStillRelevant(context, taskId, periodKey, reminderDate, reminderTime)) {
                return
            }

            val contentText = "Напоминаю о задаче: $taskTitle"
            val longText = "Напоминаю о задаче: \"$taskTitle\". Зайди в Daily и выполни её сегодня."
            val rawId = "$taskId|$periodKey|$reminderDate|$reminderTime".hashCode()
            val notificationId = 42000 + (rawId and 0x7FFFFFF) % 1000000
            sendNotification(
                context = context,
                notificationId = notificationId,
                title = "Daily",
                text = contentText,
                longText = longText,
            )
        } finally {
            DailyNotificationScheduler.syncFromSettings(context)
        }
    }

    private fun sendNotification(
        context: Context,
        notificationId: Int,
        title: String,
        text: String,
        longText: String,
    ) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(context, MainActivity::class.java)
        launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP

        val openAppIntent = PendingIntent.getActivity(
            context,
            41001,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(
            context,
            DailyNotificationScheduler.CHANNEL_ID,
        )
            .setSmallIcon(R.drawable.ic_notification_daily)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(longText))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openAppIntent)
            .build()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            DailyNotificationScheduler.hasNotificationPermission(context)
        ) {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        }
    }

    private fun countPendingTasksForToday(context: Context, timezoneId: String): Int {
        return try {
            val payload = loadStatePayload(context) ?: return 0
            val root = JSONObject(payload)
            val tasks = root.optJSONArray("tasks") ?: return 0
            val todayKey = todayKeyForTimezone(timezoneId)

            var pending = 0
            for (index in 0 until tasks.length()) {
                val item = tasks.optJSONObject(index) ?: continue
                val scope = item.optString("scope", "")
                val periodKey = item.optString("periodKey", "")
                val done = jsonBool(item.opt("isDone"))
                if (scope == "day" && periodKey == todayKey && !done) {
                    pending += 1
                }
            }
            pending
        } catch (_: Exception) {
            0
        }
    }

    private fun isTaskReminderStillRelevant(
        context: Context,
        taskId: Int,
        periodKey: String,
        reminderDate: String,
        reminderTime: String,
    ): Boolean {
        return try {
            val payload = loadStatePayload(context) ?: return false
            val root = JSONObject(payload)
            val tasks = root.optJSONArray("tasks") ?: return false
            val settings = DailyNotificationScheduler.readSettings(context)
            val finalizedMarkers = DailyNotificationScheduler.parseFinalizedMarkers(root)

            for (index in 0 until tasks.length()) {
                val item = tasks.optJSONObject(index) ?: continue
                val id = item.optInt("id", 0)
                val key = item.optString("periodKey", "")
                if (id != taskId || key != periodKey) {
                    continue
                }
                val scope = item.optString("scope", "")
                val remindersEnabled = if (item.has("remindersEnabled")) {
                    item.optBoolean("remindersEnabled", false)
                } else {
                    (item.optJSONArray("reminders")?.length() ?: 0) > 0 ||
                        (item.optJSONArray("reminderTimes")?.length() ?: 0) > 0
                }
                if (!remindersEnabled) {
                    return false
                }
                if (jsonBool(item.opt("isDone"))) {
                    return false
                }
                if (DailyNotificationScheduler.isPeriodClosedForReminders(
                        scope = scope,
                        periodKey = key,
                        finalizedMarkers = finalizedMarkers,
                        timezoneId = settings.timezoneId,
                    )
                ) {
                    return false
                }

                val isLocked = jsonBool(item.opt("isLocked"))
                val reminders = item.optJSONArray("reminders")
                if (reminders != null && reminders.length() > 0) {
                    for (reminderIndex in 0 until reminders.length()) {
                        val reminder = reminders.optJSONObject(reminderIndex) ?: continue
                        val dateKey = reminder.optString("dateKey", "").trim()
                        val time = reminder.optString("time", "").trim()
                        if (time.isEmpty()) {
                            continue
                        }
                        if (isLocked) {
                            if (time == reminderTime) {
                                return true
                            }
                        } else {
                            if (time == reminderTime && (reminderDate.isEmpty() || reminderDate == dateKey)) {
                                return true
                            }
                        }
                    }
                    return false
                }

                val reminderTimes = item.optJSONArray("reminderTimes")
                if (reminderTimes != null) {
                    for (reminderIndex in 0 until reminderTimes.length()) {
                        if (reminderTime == reminderTimes.optString(reminderIndex, "").trim()) {
                            return true
                        }
                    }
                }
                return false
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun loadStatePayload(context: Context): String? {
        val dbPayload = DailyStorageDb(context).loadState()
        if (!dbPayload.isNullOrBlank()) {
            return dbPayload
        }
        val prefsPayload = DailyNotificationScheduler.readStateJson(context)
        if (!prefsPayload.isNullOrBlank()) {
            return prefsPayload
        }
        return null
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

    private fun pluralizeTasks(count: Int): String {
        val mod100 = count % 100
        val mod10 = count % 10
        return if (mod100 in 11..14) {
            "пунктов"
        } else {
            when (mod10) {
                1 -> "пункт"
                2, 3, 4 -> "пункта"
                else -> "пунктов"
            }
        }
    }
}
