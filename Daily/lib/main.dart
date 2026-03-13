import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';
import 'dart:ui';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    debugPrint('[Daily][FlutterError] ${details.exceptionAsString()}');
    final stack = details.stack;
    if (stack != null) {
      debugPrint(stack.toString());
    }
  };
  PlatformDispatcher.instance.onError = (Object error, StackTrace stackTrace) {
    debugPrint('[Daily][PlatformError] $error');
    debugPrint(stackTrace.toString());
    return false;
  };
  runApp(const DailyApp());
}

class DailyApp extends StatelessWidget {
  const DailyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Daily',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: DailyPalette.background,
        fontFamily: 'sans-serif',
        colorScheme: const ColorScheme.dark(
          primary: DailyPalette.accent,
          secondary: DailyPalette.accentSoft,
          surface: DailyPalette.surface,
          error: DailyPalette.danger,
        ),
      ),
      home: const DailyShell(),
    );
  }
}

class DailyShell extends StatefulWidget {
  const DailyShell({super.key});

  @override
  State<DailyShell> createState() => _DailyShellState();
}

class _DailyShellState extends State<DailyShell> {
  late final Future<PlanController> _controllerFuture;
  PlanController? _controller;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _controllerFuture = PlanController.create().then((controller) {
      _controller = controller;
      return controller;
    });
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PlanController>(
      future: _controllerFuture,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Scaffold(
            body: AtmosphereBackground(
              child: SafeArea(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      CircularProgressIndicator(color: DailyPalette.accent),
                      SizedBox(height: 14),
                      Text(
                        'Загрузка Daily...',
                        style: TextStyle(color: DailyPalette.textMuted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }

        final controller = snapshot.data!;
        final screens = <Widget>[
          PlannerScreen(
            controller: controller,
            onOpenPrayer: () => setState(() => _tabIndex = 1),
          ),
          PrayerScreen(controller: controller),
          HistoryScreen(controller: controller),
          SettingsScreen(controller: controller),
        ];

        return Scaffold(
          body: AtmosphereBackground(
            child: SafeArea(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: KeyedSubtree(
                  key: ValueKey(_tabIndex),
                  child: screens[_tabIndex],
                ),
              ),
            ),
          ),
          bottomNavigationBar: _BottomNav(
            selectedIndex: _tabIndex,
            onChanged: (index) => setState(() => _tabIndex = index),
          ),
        );
      },
    );
  }
}

class PlannerScreen extends StatefulWidget {
  const PlannerScreen({
    super.key,
    required this.controller,
    required this.onOpenPrayer,
  });

  final PlanController controller;
  final VoidCallback onOpenPrayer;

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> {
  PlanController get controller => widget.controller;
  bool _taskFlowInProgress = false;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final scope = controller.activeScope;
        final periodKey = controller.activePeriodKey;
        final tasks = controller.currentTasks;
        final progressByScope = controller.progressForActiveContext();
        final currentProgress =
            progressByScope[scope] ?? const PeriodProgress(done: 0, total: 0);
        final policy = controller.currentEditPolicy;

        return Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 108),
              children: [
                _HeroHeader(
                  title: 'Daily',
                  subtitle: 'Планер с чистой навигацией и фокусом на главное',
                  rightText: _formatDateRu(DateTime.now()),
                ),
                const SizedBox(height: 14),
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Периоды',
                        style: TextStyle(
                          color: DailyPalette.textMuted,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: PlanScope.values
                            .map((candidate) {
                              final selected = candidate == scope;
                              return _ScopePill(
                                label: candidate.label,
                                selected: selected,
                                onTap: () => controller.setScope(candidate),
                              );
                            })
                            .toList(growable: false),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          IconButton(
                            onPressed: () => controller.shiftPeriod(-1),
                            icon: const Icon(Icons.chevron_left),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Text(
                                  scope.label,
                                  style: const TextStyle(
                                    color: DailyPalette.textMuted,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  formatPeriodTitle(scope, periodKey),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: DailyPalette.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: () => controller.shiftPeriod(1),
                            icon: const Icon(Icons.chevron_right),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      _PolicyBadge(
                        policy: policy,
                        readOnlyHint: editDeniedMessage(scope),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                _ProgressTile(scope: scope, progress: currentProgress),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.add,
                        label: 'Новая задача',
                        onTap: _taskFlowInProgress ? null : _onCreateTask,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.self_improvement,
                        label: 'Молитвы',
                        onTap: widget.onOpenPrayer,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Text(
                      'Задачи',
                      style: TextStyle(
                        color: DailyPalette.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${tasks.where((task) => task.isDone).length}/${tasks.length}',
                      style: const TextStyle(
                        color: DailyPalette.textMuted,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (tasks.isEmpty)
                  const _EmptyTasksCard()
                else
                  ...tasks.map(_buildTaskTile),
              ],
            ),
            Positioned(
              right: 20,
              bottom: 24,
              child: FloatingActionButton.extended(
                backgroundColor: DailyPalette.accent,
                foregroundColor: DailyPalette.background,
                onPressed: _taskFlowInProgress ? null : _onCreateTask,
                icon: const Icon(Icons.edit_note),
                label: const Text('Добавить'),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTaskTile(PlanTask task) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _GlassCard(
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => _openTaskDetails(task),
          child: Row(
            children: [
              InkWell(
                onTap: () => _toggleDone(task),
                borderRadius: BorderRadius.circular(14),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  height: 34,
                  width: 34,
                  decoration: BoxDecoration(
                    color: task.isDone
                        ? DailyPalette.success
                        : DailyPalette.surfaceHigh,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: task.isDone
                          ? DailyPalette.success
                          : DailyPalette.border.withValues(alpha: 0.55),
                    ),
                  ),
                  child: Icon(
                    task.isDone ? Icons.check : Icons.circle_outlined,
                    size: 18,
                    color: task.isDone
                        ? DailyPalette.background
                        : DailyPalette.textMuted,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            task.title,
                            style: TextStyle(
                              color: DailyPalette.textPrimary,
                              fontWeight: FontWeight.w700,
                              decoration: task.isDone
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                        ),
                        if (task.isLocked)
                          const Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: Icon(
                              Icons.lock,
                              size: 16,
                              color: DailyPalette.accent,
                            ),
                          ),
                      ],
                    ),
                    if ((task.description ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        task.description!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: DailyPalette.textMuted,
                          fontSize: 13,
                        ),
                      ),
                    ],
                    if (task.remindersEnabled &&
                        task.reminderLabels.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Напоминания: ${task.reminderLabels.join(', ')}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: DailyPalette.accentSoft,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              IconButton(
                onPressed: () => _toggleLock(task),
                icon: Icon(
                  task.isLocked ? Icons.lock : Icons.lock_open,
                  color: task.isLocked
                      ? DailyPalette.accent
                      : DailyPalette.textMuted.withValues(alpha: 0.7),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _onCreateTask() {
    if (_taskFlowInProgress) {
      return;
    }
    final reason = controller.addDeniedReasonForCurrent();
    if (reason != null) {
      _showSnack(reason);
      return;
    }
    _openTaskEditor();
  }

  Future<void> _openTaskEditor({PlanTask? task}) async {
    if (_taskFlowInProgress) {
      return;
    }
    debugPrint(
      '[Daily][TaskFlow] Open editor. mode=${task == null ? 'create' : 'edit'}',
    );

    if (task != null) {
      final allowed = await _ensureEditAllowed(task.scope, task.periodKey);
      if (!allowed) {
        return;
      }
      if (!mounted) {
        return;
      }
    }

    if (!mounted) {
      return;
    }
    final targetScope = task?.scope ?? controller.activeScope;
    final targetPeriodKey = task?.periodKey ?? controller.activePeriodKey;
    final periodStartDate = dateOnly(
      contextDateFromPeriod(targetScope, targetPeriodKey),
    );
    final periodFinishDate = dateOnly(
      periodEndDate(targetScope, targetPeriodKey),
    );

    final submission = await showDialog<_TaskEditorSubmission>(
      context: context,
      barrierDismissible: !_taskFlowInProgress,
      builder: (dialogContext) => _TaskEditorDialog(
        title: task == null ? 'Новая задача' : 'Редактирование задачи',
        initialTitle: task?.title ?? '',
        initialDescription: task?.description ?? '',
        scope: targetScope,
        periodKey: targetPeriodKey,
        periodStartDate: periodStartDate,
        periodEndDate: periodFinishDate,
        initialRemindersEnabled: task?.remindersEnabled ?? false,
        initialReminders: task?.reminders ?? const <TaskReminder>[],
      ),
    );

    if (!mounted || submission == null) {
      return;
    }

    setState(() => _taskFlowInProgress = true);
    try {
      final String? error;
      if (task == null) {
        error = await controller.addTaskToCurrent(
          submission.title,
          submission.description,
          remindersEnabled: submission.remindersEnabled,
          reminders: submission.reminders,
        );
      } else {
        error = await controller.updateTask(
          task,
          submission.title,
          submission.description,
          remindersEnabled: submission.remindersEnabled,
          reminders: submission.reminders,
        );
      }

      if (!mounted) {
        return;
      }
      if (error != null) {
        _showSnack(error);
        return;
      }
      _showSnack(task == null ? 'Задача добавлена.' : 'Задача обновлена.');
    } catch (error, stackTrace) {
      debugPrint('[Daily][TaskFlow] Failed to save task: $error');
      debugPrint(stackTrace.toString());
      if (mounted) {
        _showSnack('Не удалось сохранить задачу.');
      }
    } finally {
      if (mounted) {
        setState(() => _taskFlowInProgress = false);
      } else {
        _taskFlowInProgress = false;
      }
    }
  }

  Future<void> _openTaskDetails(PlanTask task) async {
    if (!mounted) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: _GlassCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  style: const TextStyle(
                    color: DailyPalette.textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: 19,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  task.description?.trim().isNotEmpty == true
                      ? task.description!
                      : 'Описание не указано',
                  style: const TextStyle(
                    color: DailyPalette.textMuted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MiniTag(
                      icon: task.isDone ? Icons.check : Icons.timelapse,
                      text: task.isDone ? 'Выполнено' : 'Не выполнено',
                    ),
                    _MiniTag(
                      icon: task.isLocked ? Icons.lock : Icons.lock_open,
                      text: task.isLocked ? 'Закреплено' : 'Обычная',
                    ),
                    _MiniTag(
                      icon: Icons.calendar_today,
                      text: '${task.scope.label}: ${task.periodKey}',
                    ),
                    if (task.remindersEnabled && task.reminderLabels.isNotEmpty)
                      _MiniTag(
                        icon: Icons.notifications_active_outlined,
                        text: task.reminderLabels.join(', '),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _ActionButton(
                        icon: task.isDone ? Icons.undo : Icons.check,
                        label: task.isDone ? 'Снять' : 'Готово',
                        onTap: () => _toggleDone(task),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ActionButton(
                        icon: task.isLocked ? Icons.lock_open : Icons.lock,
                        label: task.isLocked ? 'Открепить' : 'Закрепить',
                        onTap: () => _toggleLock(task),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.of(context).pop();
                          unawaited(
                            Future<void>.microtask(
                              () => _openTaskEditor(task: task),
                            ),
                          );
                        },
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: DailyPalette.border),
                        ),
                        icon: const Icon(Icons.edit),
                        label: const Text('Редактировать'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final allowed = await _ensureEditAllowed(
                            task.scope,
                            task.periodKey,
                          );
                          if (!allowed) {
                            return;
                          }
                          if (!mounted) {
                            return;
                          }
                          final shouldDelete =
                              await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  backgroundColor: DailyPalette.surface,
                                  title: const Text('Удалить задачу?'),
                                  content: const Text(
                                    'Закрепленная задача также будет удалена из повторяющихся.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(false),
                                      child: const Text('Отмена'),
                                    ),
                                    FilledButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(true),
                                      style: FilledButton.styleFrom(
                                        backgroundColor: DailyPalette.danger,
                                      ),
                                      child: const Text('Удалить'),
                                    ),
                                  ],
                                ),
                              ) ??
                              false;
                          if (!shouldDelete) {
                            return;
                          }

                          final error = controller.deleteTask(task);
                          if (error != null) {
                            _showSnack(error);
                            return;
                          }

                          if (!mounted) {
                            return;
                          }
                          Navigator.of(context).pop();
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DailyPalette.danger,
                          side: const BorderSide(color: DailyPalette.danger),
                        ),
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Удалить'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _toggleDone(PlanTask task) async {
    final error = controller.toggleTaskDone(task);
    if (error != null) {
      _showSnack(error);
    }
  }

  Future<void> _toggleLock(PlanTask task) async {
    final allowed = await _ensureEditAllowed(task.scope, task.periodKey);
    if (!allowed) {
      return;
    }
    final error = controller.toggleTaskLock(task);
    if (error != null) {
      _showSnack(error);
    }
  }

  Future<bool> _ensureEditAllowed(PlanScope scope, String periodKey) async {
    final policy = controller.editPolicy(scope, periodKey);
    if (policy == EditPolicy.allow) {
      return true;
    }

    if (policy == EditPolicy.confirm) {
      final confirm =
          await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              backgroundColor: DailyPalette.surface,
              title: const Text('Подтверждение'),
              content: const Text(
                'Подтвердите корректировку годового плана в январе.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: FilledButton.styleFrom(
                    backgroundColor: DailyPalette.accent,
                    foregroundColor: DailyPalette.background,
                  ),
                  child: const Text('Подтвердить'),
                ),
              ],
            ),
          ) ??
          false;
      return confirm;
    }

    _showSnack(editDeniedMessage(scope));
    return false;
  }

  void _showSnack(String text) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }
}

class PrayerScreen extends StatelessWidget {
  const PrayerScreen({super.key, required this.controller});

  final PlanController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final entries = controller.prayerEntries;

        return ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 96),
          children: [
            _HeroHeader(
              title: 'Молитвенный план',
              subtitle:
                  'Нужды по дням недели автоматически подтягиваются в день',
              rightText: '7 дней',
            ),
            const SizedBox(height: 12),
            ...entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _GlassCard(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => _openPrayerEditor(context, entry),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: DailyPalette.surfaceHigh,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Center(
                            child: Text(
                              entry.weekdayShort,
                              style: const TextStyle(
                                color: DailyPalette.accent,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.weekdayLabel,
                                style: const TextStyle(
                                  color: DailyPalette.textMuted,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                entry.title ?? 'Не задано',
                                style: const TextStyle(
                                  color: DailyPalette.textPrimary,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if ((entry.description ?? '').trim().isNotEmpty)
                                Text(
                                  entry.description!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: DailyPalette.textMuted,
                                    fontSize: 13,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.chevron_right,
                          color: DailyPalette.textMuted,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _openPrayerEditor(
    BuildContext context,
    PrayerPlanEntry entry,
  ) async {
    final submission = await showDialog<_PrayerEditorSubmission>(
      context: context,
      builder: (dialogContext) => _PrayerEditorDialog(entry: entry),
    );

    if (!context.mounted || submission == null) {
      return;
    }

    if (submission.clear) {
      controller.updatePrayerEntry(entry.weekday, null, null);
      return;
    }

    controller.updatePrayerEntry(
      entry.weekday,
      submission.title,
      submission.description,
    );
  }
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.controller});

  final PlanController controller;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String? _selectedDayKey;

  PlanController get controller => widget.controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final history = controller.historyEntries;
        final byDay = <String, List<ActivityLogEntry>>{};
        final orderedDays = <String>[];

        for (final entry in history) {
          final key = dayKey(dateOnly(entry.timestamp));
          byDay.putIfAbsent(key, () {
            orderedDays.add(key);
            return <ActivityLogEntry>[];
          });
          byDay[key]!.add(entry);
        }

        final selectedDayKey = _resolvedDayKey(orderedDays);
        final visibleEntries = selectedDayKey == null
            ? const <ActivityLogEntry>[]
            : (byDay[selectedDayKey] ?? const <ActivityLogEntry>[]);

        return ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 96),
          children: [
            _HeroHeader(
              title: 'История',
              subtitle: 'Действия, настройки и итоги периодов',
              rightText: '${history.length} записей',
            ),
            const SizedBox(height: 12),
            if (history.isEmpty)
              const _GlassCard(
                child: Text(
                  'Пока нет записей. Добавьте первую задачу в разделе Планы.',
                  style: TextStyle(color: DailyPalette.textMuted),
                ),
              )
            else ...[
              const Text(
                'Выберите день',
                style: TextStyle(
                  color: DailyPalette.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: orderedDays
                      .map(
                        (day) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(_historyDayLabel(day)),
                            selected: day == selectedDayKey,
                            onSelected: (_) {
                              setState(() => _selectedDayKey = day);
                            },
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              ),
              const SizedBox(height: 10),
              if (selectedDayKey != null)
                _GlassCard(
                  child: Text(
                    'Показаны действия за ${_historyDayTitle(selectedDayKey)}: '
                    '${visibleEntries.length}',
                    style: const TextStyle(color: DailyPalette.textMuted),
                  ),
                ),
              const SizedBox(height: 10),
              ...visibleEntries.map(_buildHistoryEntry),
            ],
          ],
        );
      },
    );
  }

  String? _resolvedDayKey(List<String> orderedDays) {
    if (orderedDays.isEmpty) {
      return null;
    }
    if (_selectedDayKey != null && orderedDays.contains(_selectedDayKey)) {
      return _selectedDayKey;
    }
    return orderedDays.first;
  }

  String _historyDayLabel(String key) {
    try {
      final date = parseDayKey(key);
      return '${shortDate(date)} • ${weekdayShortRu(date.weekday - 1)}';
    } catch (_) {
      return key;
    }
  }

  String _historyDayTitle(String key) {
    try {
      final date = parseDayKey(key);
      return '${dayKey(date)} (${weekdayLabelRu(date.weekday - 1)})';
    } catch (_) {
      return key;
    }
  }

  Widget _buildHistoryEntry(ActivityLogEntry entry) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _GlassCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 2),
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: DailyPalette.surfaceHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                iconForHistory(entry.action),
                color: DailyPalette.accent,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.message,
                    style: const TextStyle(
                      color: DailyPalette.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    formatDateTime(entry.timestamp),
                    style: const TextStyle(
                      color: DailyPalette.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.controller});

  final PlanController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final morningTime = controller.morningNotificationTime;
        final eveningTime = controller.eveningNotificationTime;
        final timezoneId = controller.timezoneId;
        final timezoneLabel = timezoneLabelFor(timezoneId);

        return ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 96),
          children: [
            const _HeroHeader(
              title: 'Настройки',
              subtitle: 'Персональные параметры приложения Daily',
              rightText: 'v1.0',
            ),
            const SizedBox(height: 12),
            _GlassCard(
              child: Column(
                children: [
                  SwitchListTile.adaptive(
                    value: controller.notificationsEnabled,
                    onChanged: (_) async {
                      final warning = await controller.toggleNotifications();
                      if (warning == null || !context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(SnackBar(content: Text(warning)));
                    },
                    title: const Text('Ежедневные напоминания'),
                    subtitle: const Text(
                      'Подготовить план и отметить прогресс',
                    ),
                    activeThumbColor: DailyPalette.accent,
                    activeTrackColor: DailyPalette.accent.withValues(
                      alpha: 0.35,
                    ),
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.wb_sunny_outlined,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Утреннее уведомление'),
                    subtitle: Text(morningTime),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () => _pickMorningTime(context),
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.nights_stay_outlined,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Вечернее уведомление'),
                    subtitle: Text(eveningTime),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () => _pickEveningTime(context),
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.public,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Часовой пояс'),
                    subtitle: Text('$timezoneLabel ($timezoneId)'),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () => _pickTimezone(context),
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.notification_add_outlined,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Проверить уведомление'),
                    subtitle: const Text('Отправить тест прямо сейчас'),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () async {
                      final warning = await controller.sendTestNotification();
                      if (!context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(
                          SnackBar(
                            content: Text(
                              warning ?? 'Тестовое уведомление отправлено.',
                            ),
                          ),
                        );
                    },
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.ios_share,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Экспорт данных'),
                    subtitle: const Text(
                      'Сохранить совместимую резервную копию для Daily Web и мобильной версии',
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () async {
                      final warning = await controller.exportPortableBackup();
                      if (!context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(
                          SnackBar(
                            content: Text(
                              warning ?? 'Резервная копия сохранена.',
                            ),
                          ),
                      );
                    },
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.download_rounded,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('Импорт данных'),
                    subtitle: const Text(
                      'Загрузить резервную копию из Daily Web или мобильной версии',
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () async {
                      final warning = await controller.importPortableBackup();
                      if (!context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(
                          SnackBar(
                            content: Text(
                              warning ?? 'Резервная копия импортирована.',
                            ),
                          ),
                        );
                    },
                  ),
                  const Divider(color: DailyPalette.border),
                  ListTile(
                    leading: const Icon(
                      Icons.info_outline,
                      color: DailyPalette.accent,
                    ),
                    title: const Text('О приложении'),
                    subtitle: const Text('Для чего нужен Daily и как он помогает'),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: DailyPalette.textMuted,
                    ),
                    onTap: () => _openAboutApp(context),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _openAboutApp(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: _GlassCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'О Daily',
                  style: TextStyle(
                    color: DailyPalette.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 10),
                Text(
                  'Daily — это личный планировщик с фокусом на дисциплину и '
                  'повседневный ритм. Приложение помогает вести планы по дням, '
                  'неделям, месяцам и году, добавлять задачи, включать напоминания, '
                  'отмечать выполнение и видеть реальный прогресс по каждому периоду.',
                  style: TextStyle(
                    color: DailyPalette.textMuted,
                    height: 1.45,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Daily автоматически сохраняет ваши данные, чтобы планы и история '
                  'оставались с вами после обновлений приложения.',
                  style: TextStyle(
                    color: DailyPalette.textMuted,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickMorningTime(BuildContext context) async {
    await _pickTime(
      context: context,
      initialTime: controller.morningNotificationTime,
      title: 'Утреннее время',
      onSelected: controller.updateMorningNotificationTime,
    );
  }

  Future<void> _pickEveningTime(BuildContext context) async {
    await _pickTime(
      context: context,
      initialTime: controller.eveningNotificationTime,
      title: 'Вечернее время',
      onSelected: controller.updateEveningNotificationTime,
    );
  }

  Future<void> _pickTime({
    required BuildContext context,
    required String initialTime,
    required String title,
    required Future<String?> Function(String value) onSelected,
  }) async {
    final initial =
        parseTime(initialTime) ?? const TimeOfDay(hour: 6, minute: 0);

    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      helpText: title,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.dark(
              primary: DailyPalette.accent,
              surface: DailyPalette.surface,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked == null) {
      return;
    }

    final warning = await onSelected(
      '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}',
    );
    if (warning != null && context.mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(warning)));
    }
  }

  Future<void> _pickTimezone(BuildContext context) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: _GlassCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Часовой пояс',
                  style: TextStyle(
                    color: DailyPalette.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 320,
                  child: ListView.separated(
                    itemCount: timezoneOptions.length,
                    separatorBuilder: (_, __) =>
                        const Divider(color: DailyPalette.border),
                    itemBuilder: (context, index) {
                      final option = timezoneOptions[index];
                      return ListTile(
                        dense: true,
                        title: Text(option.label),
                        subtitle: Text(option.id),
                        trailing: option.id == controller.timezoneId
                            ? const Icon(
                                Icons.check,
                                color: DailyPalette.accent,
                              )
                            : null,
                        onTap: () => Navigator.of(context).pop(option.id),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (selected == null) {
      return;
    }

    final warning = await controller.updateTimezoneId(selected);
    if (warning != null && context.mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(warning)));
    }
  }
}

class DailyStateStore {
  const DailyStateStore();

  static const MethodChannel _channel = MethodChannel('daily/storage');

  Future<Map<String, dynamic>?> loadState() async {
    try {
      final raw = await _channel.invokeMethod<String>('loadState');
      if (raw == null || raw.trim().isEmpty) {
        return null;
      }
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return decoded.cast<String, dynamic>();
      }
      return null;
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    } on FormatException {
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveState(Map<String, dynamic> state) async {
    try {
      await _channel.invokeMethod<void>('saveState', {
        'json': jsonEncode(state),
      });
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    } catch (_) {
      return;
    }
  }
}

class DailyNotificationsBridge {
  const DailyNotificationsBridge();

  static const MethodChannel _channel = MethodChannel('daily/notifications');

  Future<bool> ensurePermission() async {
    try {
      final granted = await _channel.invokeMethod<bool>('ensurePermission');
      return granted ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<bool> syncSchedule({
    required bool enabled,
    required String morningTime,
    required String eveningTime,
    required String timezoneId,
    String? stateJson,
  }) async {
    try {
      await _channel.invokeMethod<void>('syncSchedule', {
        'enabled': enabled,
        'morningTime': morningTime,
        'eveningTime': eveningTime,
        'timezoneId': timezoneId,
        if (stateJson != null) 'stateJson': stateJson,
      });
      return true;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<String> getDefaultTimezone() async {
    try {
      final value = await _channel.invokeMethod<String>('getDefaultTimezone');
      if (value == null || value.trim().isEmpty) {
        return 'UTC';
      }
      return value.trim();
    } on MissingPluginException {
      return 'UTC';
    } on PlatformException {
      return 'UTC';
    } catch (_) {
      return 'UTC';
    }
  }

  Future<bool> sendTestNotification({String type = 'morning'}) async {
    try {
      final result = await _channel.invokeMethod<bool>('sendTestNotification', {
        'type': type,
      });
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }
}

class PlanController extends ChangeNotifier {
  PlanController._({
    required DateTime Function() clock,
    required DailyStateStore stateStore,
    required DailyNotificationsBridge notificationsBridge,
  }) : _clock = clock,
       _stateStore = stateStore,
       _notificationsBridge = notificationsBridge {
    final today = dateOnly(_clock());
    _selectedPeriods = {
      PlanScope.day: dayKey(today),
      PlanScope.week: weekKey(today),
      PlanScope.month: monthKey(today),
      PlanScope.year: yearKey(today),
    };
    _lastObservedDayKey = dayKey(today);
    _startDayRolloverWatcher();

    _ensurePrayerRows();
    _seedDefaultRecurringTasks();
  }

  static Future<PlanController> create({
    DateTime Function()? clock,
    DailyStateStore? stateStore,
    DailyNotificationsBridge? notificationsBridge,
  }) async {
    final controller = PlanController._(
      clock: clock ?? DateTime.now,
      stateStore: stateStore ?? const DailyStateStore(),
      notificationsBridge:
          notificationsBridge ?? const DailyNotificationsBridge(),
    );
    final loaded = await controller._hydrateFromStorage();
    if (!loaded || controller._timezoneId.trim().isEmpty) {
      controller._timezoneId = await controller._notificationsBridge
          .getDefaultTimezone();
    }
    controller._jumpToCurrentPeriods();
    controller._prepareCurrentView();
    await controller._syncNotificationsWithNative();
    await controller._persistNow();
    return controller;
  }

  final DateTime Function() _clock;
  final DailyStateStore _stateStore;
  final DailyNotificationsBridge _notificationsBridge;

  late Map<PlanScope, String> _selectedPeriods;
  PlanScope _activeScope = PlanScope.day;

  final List<PlanTask> _tasks = <PlanTask>[];
  final List<RecurringTaskTemplate> _recurring = <RecurringTaskTemplate>[];
  final List<PrayerPlanEntry> _prayer = <PrayerPlanEntry>[];
  final List<ActivityLogEntry> _history = <ActivityLogEntry>[];

  final Set<String> _initializedPeriods = <String>{};
  final Set<String> _finalizedPeriods = <String>{};

  int _taskId = 1;
  int _recurringId = 1;
  int _historyId = 1;

  bool _notificationsEnabled = true;
  String _morningNotificationTime = '06:00';
  String _eveningNotificationTime = '18:00';
  String _timezoneId = 'UTC';
  late String _lastObservedDayKey;
  Timer? _saveDebounce;
  Timer? _dayRolloverTimer;

  static const List<String> _defaultDailyTasks = <String>[
    'Почитать Библию',
    'Принять причастие',
  ];

  PlanScope get activeScope => _activeScope;
  String get activePeriodKey => _selectedPeriods[_activeScope]!;
  EditPolicy get currentEditPolicy => editPolicy(_activeScope, activePeriodKey);

  bool get notificationsEnabled => _notificationsEnabled;
  String get morningNotificationTime => _morningNotificationTime;
  String get eveningNotificationTime => _eveningNotificationTime;
  String get timezoneId => _timezoneId;

  List<PlanTask> get currentTasks => tasksFor(_activeScope, activePeriodKey);

  List<PrayerPlanEntry> get prayerEntries =>
      List<PrayerPlanEntry>.unmodifiable(_prayer);

  List<ActivityLogEntry> get historyEntries {
    final copy = List<ActivityLogEntry>.from(_history);
    copy.sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return copy;
  }

  EditPolicy editPolicy(PlanScope scope, String periodKey) {
    final today = dateOnly(_clock());
    if (!isCurrentPeriod(scope, periodKey, today)) {
      return EditPolicy.deny;
    }

    if (scope == PlanScope.day) {
      return EditPolicy.allow;
    }
    if (scope == PlanScope.week) {
      return today.weekday == DateTime.monday
          ? EditPolicy.allow
          : EditPolicy.deny;
    }
    if (scope == PlanScope.month) {
      return (today.day == 1 || today.day == 2)
          ? EditPolicy.allow
          : EditPolicy.deny;
    }
    if (scope == PlanScope.year) {
      if (today.month != 1) {
        return EditPolicy.deny;
      }
      if (today.day == 1 || today.day == 2) {
        return EditPolicy.allow;
      }
      return EditPolicy.confirm;
    }

    return EditPolicy.deny;
  }

  void setScope(PlanScope scope) {
    if (_activeScope == scope) {
      return;
    }
    _activeScope = scope;
    _prepareCurrentView();
    _notifyAndPersist();
  }

  void shiftPeriod(int delta) {
    final current = activePeriodKey;
    _selectedPeriods[_activeScope] = addPeriod(_activeScope, current, delta);
    _prepareCurrentView();
    _notifyAndPersist();
  }

  String? addDeniedReasonForCurrent() {
    return _addDeniedReason(_activeScope, activePeriodKey);
  }

  Future<String?> addTaskToCurrent(
    String title,
    String? description, {
    bool remindersEnabled = false,
    List<TaskReminder> reminders = const <TaskReminder>[],
  }) async {
    final cleanTitle = title.trim();
    final cleanDescription = description?.trim();
    final cleanReminders = normalizeTaskReminders(reminders);

    if (cleanTitle.isEmpty) {
      return 'Название не может быть пустым.';
    }

    final denied = _addDeniedReason(_activeScope, activePeriodKey);
    if (denied != null) {
      return denied;
    }

    if (remindersEnabled && cleanReminders.isEmpty) {
      return 'Включите напоминание и добавьте хотя бы одно время.';
    }

    _tasks.add(
      PlanTask(
        id: _taskId++,
        scope: _activeScope,
        periodKey: activePeriodKey,
        title: cleanTitle,
        description: cleanDescription?.isEmpty == true
            ? null
            : cleanDescription,
        source: TaskSource.manual,
        isLocked: false,
        recurringId: null,
        isDone: false,
        remindersEnabled: remindersEnabled,
        reminders: remindersEnabled ? cleanReminders : const <TaskReminder>[],
        createdAt: _clock(),
        updatedAt: _clock(),
      ),
    );

    _addHistory(
      'task_add',
      'Добавлена задача: "$cleanTitle" (${_activeScope.label})',
    );
    _notifyAndPersist();
    await _persistNow();
    return null;
  }

  Future<String?> updateTask(
    PlanTask task,
    String title,
    String? description, {
    bool remindersEnabled = false,
    List<TaskReminder> reminders = const <TaskReminder>[],
  }) async {
    final cleanTitle = title.trim();
    final cleanDescription = description?.trim();
    final cleanReminders = normalizeTaskReminders(reminders);

    if (cleanTitle.isEmpty) {
      return 'Название не может быть пустым.';
    }

    final denied = _editDeniedReason(task.scope, task.periodKey);
    if (denied != null) {
      return denied;
    }

    if (remindersEnabled && cleanReminders.isEmpty) {
      return 'Включите напоминание и добавьте хотя бы одно время.';
    }

    final index = _tasks.indexWhere((value) => value.id == task.id);
    if (index < 0) {
      return 'Задача не найдена.';
    }

    final updatedTask = _tasks[index].copyWith(
      title: cleanTitle,
      description: cleanDescription?.isEmpty == true ? null : cleanDescription,
      remindersEnabled: remindersEnabled,
      reminders: remindersEnabled ? cleanReminders : const <TaskReminder>[],
      updatedAt: _clock(),
    );

    _tasks[index] = updatedTask;

    if (updatedTask.isLocked && updatedTask.recurringId != null) {
      _updateRecurringTemplate(
        updatedTask.recurringId!,
        updatedTask.title,
        updatedTask.description,
        remindersEnabled: updatedTask.remindersEnabled,
        reminders: updatedTask.reminders,
      );
    }

    _addHistory('task_edit', 'Изменена задача: "$cleanTitle"');
    _notifyAndPersist();
    await _persistNow();
    return null;
  }

  String? deleteTask(PlanTask task) {
    final denied = _editDeniedReason(task.scope, task.periodKey);
    if (denied != null) {
      return denied;
    }

    final exists = _tasks.any((value) => value.id == task.id);
    if (!exists) {
      return 'Задача не найдена.';
    }
    _tasks.removeWhere((value) => value.id == task.id);

    if (task.isLocked && task.recurringId != null) {
      _deleteRecurringTemplate(task.recurringId!);
    }

    _addHistory('task_delete', 'Удалена задача: "${task.title}"');
    _notifyAndPersist();
    return null;
  }

  String? toggleTaskDone(PlanTask task) {
    if (_isFinalized(task.scope, task.periodKey)) {
      return 'Период уже закрыт. Правки недоступны.';
    }

    final today = dateOnly(_clock());
    if (!isCurrentPeriod(task.scope, task.periodKey, today)) {
      return 'Отметка доступна только в текущем периоде.';
    }

    final index = _tasks.indexWhere((value) => value.id == task.id);
    if (index < 0) {
      return 'Задача не найдена.';
    }

    final old = _tasks[index];
    final isDone = !old.isDone;

    _tasks[index] = old.copyWith(
      isDone: isDone,
      doneAt: isDone ? _clock() : null,
      updatedAt: _clock(),
    );

    _addHistory(
      'task_toggle',
      isDone
          ? 'Отмечено выполненным: "${old.title}"'
          : 'Снята отметка выполнения: "${old.title}"',
    );

    _notifyAndPersist();
    return null;
  }

  String? toggleTaskLock(PlanTask task) {
    if (task.source == TaskSource.prayer ||
        task.source == TaskSource.prayerDefault) {
      return 'Молитвенный план уже цикличен.';
    }

    final denied = _editDeniedReason(task.scope, task.periodKey);
    if (denied != null) {
      return denied;
    }

    final index = _tasks.indexWhere((value) => value.id == task.id);
    if (index < 0) {
      return 'Задача не найдена.';
    }

    final current = _tasks[index];

    if (current.isLocked) {
      if (current.recurringId != null) {
        _deleteRecurringTemplate(current.recurringId!);
      }
      _tasks[index] = current.copyWith(
        isLocked: false,
        recurringId: null,
        updatedAt: _clock(),
      );
      _addHistory('task_lock', 'Откреплена задача: "${current.title}"');
    } else {
      final recurringId =
          current.recurringId ??
          _createRecurringTemplate(
            current.scope,
            current.title,
            current.description,
            remindersEnabled: current.remindersEnabled,
            reminders: current.reminders,
          );
      _updateRecurringTemplate(
        recurringId,
        current.title,
        current.description,
        remindersEnabled: current.remindersEnabled,
        reminders: current.reminders,
      );
      _tasks[index] = current.copyWith(
        isLocked: true,
        recurringId: recurringId,
        updatedAt: _clock(),
      );
      _addHistory('task_lock', 'Закреплена задача: "${current.title}"');
    }

    _notifyAndPersist();
    return null;
  }

  void updatePrayerEntry(int weekday, String? title, String? description) {
    final index = _prayer.indexWhere((entry) => entry.weekday == weekday);
    if (index < 0) {
      return;
    }

    final cleanTitle = title?.trim();
    final cleanDescription = description?.trim();

    _prayer[index] = _prayer[index].copyWith(
      title: cleanTitle?.isEmpty == true ? null : cleanTitle,
      description: cleanDescription?.isEmpty == true ? null : cleanDescription,
      updatedAt: _clock(),
    );

    _addHistory(
      'prayer_update',
      'Обновлен молитвенный план: ${weekdayLabel(weekday)}',
    );

    final today = dateOnly(_clock());
    final todayWeekday = today.weekday - 1;
    if (weekday == todayWeekday) {
      final todayKey = dayKey(today);
      _ensureDayPrayerTask(todayKey);
    }

    _notifyAndPersist();
  }

  Future<String?> toggleNotifications() async {
    final nextValue = !_notificationsEnabled;

    if (nextValue) {
      final granted = await _notificationsBridge.ensurePermission();
      if (!granted) {
        _notificationsEnabled = false;
        _addHistory(
          'settings_update',
          'Не удалось включить уведомления: нет разрешения',
        );
        _notifyAndPersist();
        await _syncNotificationsWithNative();
        return 'Разрешение на уведомления не выдано.';
      }
    }

    _notificationsEnabled = nextValue;
    _addHistory(
      'settings_update',
      _notificationsEnabled ? 'Уведомления включены' : 'Уведомления отключены',
    );
    _notifyAndPersist();
    final synced = await _syncNotificationsWithNative();
    if (!synced) {
      return 'Не удалось применить расписание уведомлений.';
    }
    return null;
  }

  Future<String?> updateMorningNotificationTime(String value) async {
    final normalized = normalizeTime(value);
    if (normalized == null) {
      return 'Некорректное время.';
    }
    _morningNotificationTime = normalized;
    _addHistory(
      'settings_update',
      'Изменено утреннее уведомление: $_morningNotificationTime',
    );
    _notifyAndPersist();
    final synced = await _syncNotificationsWithNative();
    if (!synced) {
      return 'Не удалось обновить расписание уведомлений.';
    }
    return null;
  }

  Future<String?> updateEveningNotificationTime(String value) async {
    final normalized = normalizeTime(value);
    if (normalized == null) {
      return 'Некорректное время.';
    }
    _eveningNotificationTime = normalized;
    _addHistory(
      'settings_update',
      'Изменено вечернее уведомление: $_eveningNotificationTime',
    );
    _notifyAndPersist();
    final synced = await _syncNotificationsWithNative();
    if (!synced) {
      return 'Не удалось обновить расписание уведомлений.';
    }
    return null;
  }

  Future<String?> updateTimezoneId(String timezoneId) async {
    final clean = timezoneId.trim();
    if (clean.isEmpty) {
      return 'Некорректный часовой пояс.';
    }
    _timezoneId = clean;
    _addHistory('settings_update', 'Изменен часовой пояс: $_timezoneId');
    _notifyAndPersist();
    final synced = await _syncNotificationsWithNative();
    if (!synced) {
      return 'Не удалось обновить расписание уведомлений.';
    }
    return null;
  }

  Future<String?> sendTestNotification() async {
    final sent = await _notificationsBridge.sendTestNotification(
      type: 'morning',
    );
    if (!sent) {
      return 'Не удалось отправить тестовое уведомление.';
    }
    return null;
  }

  Future<String?> exportPortableBackup() async {
    try {
      final payload = const JsonEncoder.withIndent(
        '  ',
      ).convert(_buildExchangeEnvelope());
      final bytes = Uint8List.fromList(utf8.encode(payload));
      final fileName =
          'daily-exchange-${dateOnly(_clock()).toIso8601String().split('T').first}.json';

      final savedPath = await FilePicker.platform.saveFile(
        dialogTitle: 'Экспорт Daily',
        fileName: fileName,
        type: FileType.custom,
        allowedExtensions: const <String>['json'],
        bytes: bytes,
      );

      if (savedPath == null || savedPath.trim().isEmpty) {
        return 'Экспорт отменён.';
      }

      _addHistory('export', 'Выполнен экспорт данных');
      _notifyAndPersist();
      return null;
    } catch (_) {
      return 'Не удалось сохранить файл экспорта.';
    }
  }

  Future<String?> importPortableBackup() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const <String>['json'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) {
        return 'Импорт отменён.';
      }

      final file = result.files.single;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty) {
        return 'Не удалось прочитать файл импорта.';
      }

      final raw = jsonDecode(utf8.decode(bytes));
      final snapshot = _extractImportSnapshot(raw);
      if (snapshot == null) {
        return 'Файл не похож на резервную копию Daily.';
      }

      _restoreSnapshot(snapshot);
      _prepareCurrentView();
      _addHistory('import', 'Импортированы данные из резервной копии');
      _notifyAndPersist();
      final synced = await _syncNotificationsWithNative();
      if (!synced) {
        return 'Данные импортированы, но расписание уведомлений обновить не удалось.';
      }
      return null;
    } on FormatException {
      return 'Файл не удалось распознать. Проверь формат JSON.';
    } catch (_) {
      return 'Не удалось выполнить импорт.';
    }
  }

  List<PlanTask> tasksFor(PlanScope scope, String periodKey) {
    final list = _tasks
        .where((task) => task.scope == scope && task.periodKey == periodKey)
        .toList();

    list.sort((a, b) {
      if (a.isLocked != b.isLocked) {
        return a.isLocked ? -1 : 1;
      }
      return a.id.compareTo(b.id);
    });

    return list;
  }

  Map<PlanScope, PeriodProgress> progressForActiveContext() {
    final contextDate = contextDateFromPeriod(_activeScope, activePeriodKey);
    return {
      PlanScope.day: _progressFor(PlanScope.day, dayKey(contextDate)),
      PlanScope.week: _progressFor(PlanScope.week, weekKey(contextDate)),
      PlanScope.month: _progressFor(PlanScope.month, monthKey(contextDate)),
      PlanScope.year: _progressFor(PlanScope.year, yearKey(contextDate)),
    };
  }

  PeriodProgress _progressFor(PlanScope scope, String periodKey) {
    final list = _tasks
        .where((task) => task.scope == scope && task.periodKey == periodKey)
        .toList();
    final done = list.where((task) => task.isDone).length;
    return PeriodProgress(done: done, total: list.length);
  }

  Future<bool> _hydrateFromStorage() async {
    final snapshot = await _stateStore.loadState();
    if (snapshot == null) {
      return false;
    }
    _restoreSnapshot(snapshot);
    return true;
  }

  void _restoreSnapshot(Map<String, dynamic> snapshot) {
    final today = dateOnly(_clock());
    final defaultPeriods = <PlanScope, String>{
      PlanScope.day: dayKey(today),
      PlanScope.week: weekKey(today),
      PlanScope.month: monthKey(today),
      PlanScope.year: yearKey(today),
    };

    final selectedRaw = snapshot['selectedPeriods'];
    final selected = Map<PlanScope, String>.from(defaultPeriods);
    if (selectedRaw is Map) {
      for (final scope in PlanScope.values) {
        final value = selectedRaw[scope.name];
        if (value is String && value.trim().isNotEmpty) {
          selected[scope] = value.trim();
        }
      }
    }
    _selectedPeriods = selected;

    _activeScope = planScopeFromName(snapshot['activeScope']) ?? PlanScope.day;

    _tasks
      ..clear()
      ..addAll(
        _asMapList(
          snapshot['tasks'],
        ).map((item) => PlanTask.fromJson(item, clock: _clock)),
      );
    _recurring
      ..clear()
      ..addAll(
        _asMapList(
          snapshot['recurring'],
        ).map((item) => RecurringTaskTemplate.fromJson(item, clock: _clock)),
      );
    _prayer
      ..clear()
      ..addAll(
        _asMapList(
          snapshot['prayer'],
        ).map((item) => PrayerPlanEntry.fromJson(item, clock: _clock)),
      );
    _history
      ..clear()
      ..addAll(
        _asMapList(
          snapshot['history'],
        ).map((item) => ActivityLogEntry.fromJson(item, clock: _clock)),
      );

    _initializedPeriods
      ..clear()
      ..addAll(_asStringList(snapshot['initializedPeriods']));
    _finalizedPeriods
      ..clear()
      ..addAll(
        _asStringList(snapshot['finalizedPeriods']).followedBy(
          _asStringList(snapshot['finalisedPeriods']),
        ),
      );

    _taskId = _readInt(snapshot['taskId']) ?? _nextTaskId();
    _recurringId = _readInt(snapshot['recurringId']) ?? _nextRecurringId();
    _historyId = _readInt(snapshot['historyId']) ?? _nextHistoryId();

    final settingsRaw = snapshot['settings'];
    final settings = settingsRaw is Map<String, dynamic>
        ? settingsRaw
        : settingsRaw is Map
        ? settingsRaw.cast<String, dynamic>()
        : const <String, dynamic>{};

    final notificationsRaw =
        settings['notificationsEnabled'] ?? snapshot['notificationsEnabled'];
    if (notificationsRaw is bool) {
      _notificationsEnabled = notificationsRaw;
    } else if (notificationsRaw is num) {
      _notificationsEnabled = notificationsRaw != 0;
    }

    final morningTimeRaw =
        settings['morningTime'] ?? snapshot['morningNotificationTime'];
    if (morningTimeRaw is String) {
      final normalized = normalizeTime(morningTimeRaw);
      if (normalized != null) {
        _morningNotificationTime = normalized;
      }
    }

    final eveningTimeRaw =
        settings['eveningTime'] ?? snapshot['eveningNotificationTime'];
    if (eveningTimeRaw is String) {
      final normalized = normalizeTime(eveningTimeRaw);
      if (normalized != null) {
        _eveningNotificationTime = normalized;
      }
    }

    // Backward compatibility with old snapshot format.
    final legacyTimeRaw = snapshot['notificationTime'];
    if (legacyTimeRaw is String) {
      final normalized = normalizeTime(legacyTimeRaw);
      if (normalized != null) {
        _morningNotificationTime = normalized;
      }
    }

    final timezoneRaw = settings['timezoneId'] ?? snapshot['timezoneId'];
    if (timezoneRaw is String && timezoneRaw.trim().isNotEmpty) {
      _timezoneId = timezoneRaw.trim();
    }

    final lastObservedDayRaw = snapshot['lastObservedDayKey'];
    if (lastObservedDayRaw is String && isDayKey(lastObservedDayRaw.trim())) {
      _lastObservedDayKey = lastObservedDayRaw.trim();
    } else {
      _lastObservedDayKey = dayKey(today);
    }

    _ensurePrayerRows();
    _seedDefaultRecurringTasks();
  }

  int _nextTaskId() {
    final maxId = _tasks.fold<int>(
      0,
      (max, task) => task.id > max ? task.id : max,
    );
    return maxId + 1;
  }

  int _nextRecurringId() {
    final maxId = _recurring.fold<int>(
      0,
      (max, task) => task.id > max ? task.id : max,
    );
    return maxId + 1;
  }

  int _nextHistoryId() {
    final maxId = _history.fold<int>(
      0,
      (max, entry) => entry.id > max ? entry.id : max,
    );
    return maxId + 1;
  }

  int? _readInt(Object? value) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value);
    }
    return null;
  }

  List<String> _asStringList(Object? value) {
    if (value is! List) {
      return const [];
    }
    return value.whereType<String>().toList(growable: false);
  }

  List<Map<String, dynamic>> _asMapList(Object? value) {
    if (value is! List) {
      return const [];
    }
    final maps = <Map<String, dynamic>>[];
    for (final item in value) {
      if (item is Map<String, dynamic>) {
        maps.add(item);
      } else if (item is Map) {
        maps.add(item.cast<String, dynamic>());
      }
    }
    return maps;
  }

  Map<String, dynamic> _buildSnapshot() {
    return {
      'version': 1,
      'activeScope': _activeScope.name,
      'selectedPeriods': _selectedPeriods.map(
        (scope, key) => MapEntry(scope.name, key),
      ),
      'tasks': _tasks.map((task) => task.toJson()).toList(growable: false),
      'recurring': _recurring
          .map((template) => template.toJson())
          .toList(growable: false),
      'prayer': _prayer.map((entry) => entry.toJson()).toList(growable: false),
      'history': _history
          .map((entry) => entry.toJson())
          .toList(growable: false),
      'initializedPeriods': _initializedPeriods.toList(growable: false),
      'finalizedPeriods': _finalizedPeriods.toList(growable: false),
      'taskId': _taskId,
      'recurringId': _recurringId,
      'historyId': _historyId,
      'notificationsEnabled': _notificationsEnabled,
      'morningNotificationTime': _morningNotificationTime,
      'eveningNotificationTime': _eveningNotificationTime,
      'timezoneId': _timezoneId,
    };
  }

  Map<String, dynamic> _buildPortableSnapshot() {
    final now = _clock();
    return {
      'schemaVersion': 1,
      'activeTab': 'plans',
      'activeScope': _activeScope.name,
      'selectedPeriods': {
        for (final scope in PlanScope.values)
          scope.name: _selectedPeriods[scope] ?? defaultPeriodKey(scope, now),
      },
      'tasks': _tasks
          .map(
            (task) => {
              'id': _portableTaskId(task.id),
              'scope': task.scope.name,
              'periodKey': task.periodKey,
              'title': task.title,
              'description': task.description,
              'source': task.source.name,
              'isLocked': task.isLocked,
              'recurringId': task.recurringId == null
                  ? null
                  : _portableRecurringId(task.recurringId!),
              'isDone': task.isDone,
              'doneAt': task.doneAt?.toIso8601String(),
              'remindersEnabled': task.remindersEnabled,
              'reminders': _portableReminderList(task.reminders),
              'createdAt': task.createdAt.toIso8601String(),
              'updatedAt': task.updatedAt.toIso8601String(),
            },
          )
          .toList(growable: false),
      'recurring': _recurring
          .map(
            (template) => {
              'id': _portableRecurringId(template.id),
              'scope': template.scope.name,
              'title': template.title,
              'description': template.description,
              'remindersEnabled': template.remindersEnabled,
              'reminders': _portableReminderList(template.reminders),
              'referencePeriodKey': _referencePeriodKeyForTemplate(template),
              'createdAt': template.createdAt.toIso8601String(),
              'updatedAt': template.updatedAt.toIso8601String(),
            },
          )
          .toList(growable: false),
      'prayer': List<Map<String, dynamic>>.generate(7, (weekday) {
        final entry = _prayer.firstWhere(
          (item) => item.weekday == weekday,
          orElse: () => PrayerPlanEntry(
            weekday: weekday,
            title: null,
            description: null,
            updatedAt: now,
          ),
        );
        return {
          'weekday': entry.weekday,
          'title': entry.title,
          'description': entry.description,
          'updatedAt': entry.updatedAt.toIso8601String(),
        };
      }, growable: false),
      'history': _history
          .map(
            (entry) => {
              'id': _portableHistoryId(entry.id),
              'action': entry.action,
              'message': entry.message,
              'timestamp': entry.timestamp.toIso8601String(),
              'dayKey': dayKey(entry.timestamp),
            },
          )
          .toList(growable: false),
      'settings': {
        'notificationsEnabled': _notificationsEnabled,
        'morningEnabled': _notificationsEnabled,
        'morningTime': _morningNotificationTime,
        'eveningEnabled': _notificationsEnabled,
        'eveningTime': _eveningNotificationTime,
        'timezoneId': _timezoneId,
      },
      'initializedPeriods': _initializedPeriods.toList(growable: false),
      'finalisedPeriods': _finalizedPeriods.toList(growable: false),
      'lastObservedDayKey': _lastObservedDayKey,
    };
  }

  Map<String, dynamic> _buildExchangeEnvelope() {
    return {
      'format': 'daily-exchange-v1',
      'exportedAt': _clock().toIso8601String(),
      'source': 'daily-mobile',
      'meta': {
        'schemaVersion': 1,
        'updatedAt': _portableUpdatedAt().toIso8601String(),
        'appVersion': 'android-flutter',
      },
      'snapshot': _buildPortableSnapshot(),
    };
  }

  DateTime _portableUpdatedAt() {
    final timestamps = <DateTime>[
      ..._tasks.map((item) => item.updatedAt),
      ..._recurring.map((item) => item.updatedAt),
      ..._prayer.map((item) => item.updatedAt),
      ..._history.map((item) => item.timestamp),
    ];
    if (timestamps.isEmpty) {
      return _clock();
    }
    timestamps.sort();
    return timestamps.last;
  }

  List<Map<String, dynamic>> _portableReminderList(List<TaskReminder> reminders) {
    final clean = normalizeTaskReminders(reminders);
    return List<Map<String, dynamic>>.generate(clean.length, (index) {
      final reminder = clean[index];
      return {
        'id': '${reminder.dateKey}|${reminder.time}|$index',
        'dateKey': reminder.dateKey,
        'time': reminder.time,
      };
    }, growable: false);
  }

  String _portableTaskId(int id) => 'task-$id';

  String _portableRecurringId(int id) => 'recurring-$id';

  String _portableHistoryId(int id) => 'history-$id';

  String _referencePeriodKeyForTemplate(RecurringTaskTemplate template) {
    final reminder = template.reminders.isNotEmpty ? template.reminders.first : null;
    if (reminder != null && isDayKey(reminder.dateKey)) {
      final date = parseDayKey(reminder.dateKey);
      return switch (template.scope) {
        PlanScope.day => dayKey(date),
        PlanScope.week => weekKey(date),
        PlanScope.month => monthKey(date),
        PlanScope.year => yearKey(date),
      };
    }
    return _selectedPeriods[template.scope] ?? defaultPeriodKey(template.scope, _clock());
  }

  Map<String, dynamic>? _extractImportSnapshot(Object raw) {
    final record = _asRecord(raw);
    if (record == null) {
      return null;
    }

    if (record['format'] == 'daily-exchange-v1') {
      final snapshot = record['snapshot'];
      if (snapshot == null) {
        return null;
      }
      return _extractImportSnapshot(snapshot);
    }

    if (record.containsKey('schemaVersion') || record.containsKey('settings')) {
      return _convertPortableSnapshot(record);
    }

    if (record.containsKey('version')) {
      return record;
    }

    return null;
  }

  Map<String, dynamic> _convertPortableSnapshot(Map<String, dynamic> snapshot) {
    final now = _clock();
    final defaultPeriods = <PlanScope, String>{
      PlanScope.day: dayKey(dateOnly(now)),
      PlanScope.week: weekKey(dateOnly(now)),
      PlanScope.month: monthKey(dateOnly(now)),
      PlanScope.year: yearKey(dateOnly(now)),
    };

    final selectedRaw = _asRecord(snapshot['selectedPeriods']) ?? const <String, dynamic>{};
    final selectedPeriods = <String, String>{
      for (final scope in PlanScope.values)
        scope.name: jsonString(selectedRaw[scope.name]) ?? defaultPeriods[scope]!,
    };

    var nextRecurringId = 1;
    final recurringIdMap = <String, int>{};
    final recurring = _asMapList(snapshot['recurring']).map((item) {
      final rawId = jsonString(item['id']) ?? 'recurring-$nextRecurringId';
      final id = nextRecurringId++;
      recurringIdMap[rawId] = id;
      recurringIdMap[id.toString()] = id;

      final scope = planScopeFromName(item['scope']) ?? PlanScope.day;
      final referencePeriodKey =
          jsonString(item['referencePeriodKey']) ?? selectedPeriods[scope.name]!;
      return {
        'id': id,
        'scope': scope.name,
        'title': jsonString(item['title']) ?? 'Без названия',
        'description': jsonString(item['description']),
        'remindersEnabled': jsonBool(item['remindersEnabled']),
        'reminders': _portableRemindersToLegacy(
          item['reminders'],
          fallbackDateKey: _fallbackDateKey(referencePeriodKey, scope),
        ),
        'createdAt': _portableDate(item['createdAt'], now).toIso8601String(),
        'updatedAt': _portableDate(item['updatedAt'], now).toIso8601String(),
      };
    }).toList(growable: false);

    var nextTaskId = 1;
    final tasks = _asMapList(snapshot['tasks']).map((item) {
      final id = nextTaskId++;
      final scope = planScopeFromName(item['scope']) ?? PlanScope.day;
      final periodKey = jsonString(item['periodKey']) ?? selectedPeriods[scope.name]!;
      final recurringIdRaw = item['recurringId'];
      final recurringId = recurringIdRaw == null
          ? null
          : recurringIdMap[recurringIdRaw.toString()];
      return {
        'id': id,
        'scope': scope.name,
        'periodKey': periodKey,
        'title': jsonString(item['title']) ?? 'Без названия',
        'description': jsonString(item['description']),
        'source': taskSourceFromName(item['source'])?.name ?? TaskSource.manual.name,
        'isLocked': jsonBool(item['isLocked']),
        'recurringId': recurringId,
        'isDone': jsonBool(item['isDone']),
        'remindersEnabled': jsonBool(item['remindersEnabled']),
        'reminders': _portableRemindersToLegacy(
          item['reminders'],
          fallbackDateKey: _fallbackDateKey(periodKey, scope),
        ),
        'createdAt': _portableDate(item['createdAt'], now).toIso8601String(),
        'updatedAt': _portableDate(item['updatedAt'], now).toIso8601String(),
        'doneAt': _portableDateOrNull(item['doneAt'])?.toIso8601String(),
      };
    }).toList(growable: false);

    final prayerByWeekday = <int, Map<String, dynamic>>{};
    for (final item in _asMapList(snapshot['prayer'])) {
      final weekday = jsonInt(item['weekday'], fallback: -1);
      if (weekday < 0 || weekday > 6) {
        continue;
      }
      prayerByWeekday[weekday] = {
        'weekday': weekday,
        'title': jsonString(item['title']),
        'description': jsonString(item['description']),
        'updatedAt': _portableDate(item['updatedAt'], now).toIso8601String(),
      };
    }
    final prayer = List<Map<String, dynamic>>.generate(7, (weekday) {
      return prayerByWeekday[weekday] ??
          {
            'weekday': weekday,
            'title': null,
            'description': null,
            'updatedAt': now.toIso8601String(),
          };
    }, growable: false);

    var nextHistoryId = 1;
    final history = _asMapList(snapshot['history']).map((item) {
      final id = nextHistoryId++;
      return {
        'id': id,
        'action': jsonString(item['action']) ?? 'unknown',
        'message': jsonString(item['message']) ?? '',
        'timestamp': _portableDate(item['timestamp'], now).toIso8601String(),
      };
    }).toList(growable: false);

    final settings = _asRecord(snapshot['settings']) ?? const <String, dynamic>{};
    final notificationsEnabled =
        jsonBool(settings['notificationsEnabled']) ||
        jsonBool(snapshot['notificationsEnabled']);
    final morningTime =
        normalizeTime(settings['morningTime']) ??
        normalizeTime(snapshot['morningNotificationTime']) ??
        _morningNotificationTime;
    final eveningTime =
        normalizeTime(settings['eveningTime']) ??
        normalizeTime(snapshot['eveningNotificationTime']) ??
        _eveningNotificationTime;
    final timezoneId =
        (jsonString(settings['timezoneId']) ?? jsonString(snapshot['timezoneId']) ?? _timezoneId)
            .trim();

    return {
      'version': 1,
      'activeScope': planScopeFromName(snapshot['activeScope'])?.name ?? PlanScope.day.name,
      'selectedPeriods': selectedPeriods,
      'tasks': tasks,
      'recurring': recurring,
      'prayer': prayer,
      'history': history,
      'initializedPeriods': _asStringList(snapshot['initializedPeriods']),
      'finalizedPeriods': _asStringList(snapshot['finalisedPeriods']),
      'taskId': nextTaskId,
      'recurringId': nextRecurringId,
      'historyId': nextHistoryId,
      'notificationsEnabled': notificationsEnabled,
      'morningNotificationTime': morningTime,
      'eveningNotificationTime': eveningTime,
      'timezoneId': timezoneId.isEmpty ? _timezoneId : timezoneId,
      'lastObservedDayKey': _importLastObservedDay(snapshot, selectedPeriods['day']!),
    };
  }

  String _fallbackDateKey(String periodKey, PlanScope scope) {
    try {
      return switch (scope) {
        PlanScope.day => isDayKey(periodKey)
            ? periodKey
            : dayKey(dateOnly(_clock())),
        PlanScope.week => dayKey(parseWeekKey(periodKey)),
        PlanScope.month => '${periodKey}-01',
        PlanScope.year => '$periodKey-01-01',
      };
    } catch (_) {
      return dayKey(dateOnly(_clock()));
    }
  }

  List<Map<String, dynamic>> _portableRemindersToLegacy(
    Object? raw, {
    required String fallbackDateKey,
  }) {
    final reminders = normalizeTaskReminders(
      parseTaskRemindersFromJson(
        {'reminders': raw},
        fallbackDateKey: fallbackDateKey,
      ),
    );
    return reminders
        .map(
          (item) => {
            'dateKey': item.dateKey,
            'time': item.time,
          },
        )
        .toList(growable: false);
  }

  String _importLastObservedDay(Map<String, dynamic> snapshot, String fallback) {
    final raw = jsonString(snapshot['lastObservedDayKey']);
    if (raw != null && isDayKey(raw)) {
      return raw;
    }
    return fallback;
  }

  DateTime _portableDate(Object? raw, DateTime fallback) {
    if (raw is String) {
      return DateTime.tryParse(raw) ?? fallback;
    }
    return fallback;
  }

  DateTime? _portableDateOrNull(Object? raw) {
    if (raw is! String) {
      return null;
    }
    return DateTime.tryParse(raw);
  }

  Map<String, dynamic>? _asRecord(Object? value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.cast<String, dynamic>();
    }
    return null;
  }

  Future<void> _persistNow() async {
    try {
      await _stateStore.saveState(_buildSnapshot());
    } catch (_) {
      return;
    }
  }

  Future<bool> _syncNotificationsWithNative() async {
    return _notificationsBridge.syncSchedule(
      enabled: _notificationsEnabled,
      morningTime: _morningNotificationTime,
      eveningTime: _eveningNotificationTime,
      timezoneId: _timezoneId,
      stateJson: jsonEncode(_buildSnapshot()),
    );
  }

  void _schedulePersist() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(_persistNow());
    });
  }

  void _notifyAndPersist() {
    notifyListeners();
    _schedulePersist();
    unawaited(_syncNotificationsWithNative());
  }

  void _prepareCurrentView() {
    _finalizeOverduePeriods();

    final key = activePeriodKey;
    final today = dateOnly(_clock());

    if (isCurrentPeriod(_activeScope, key, today)) {
      _initializePeriodIfNeeded(_activeScope, key);
      if (_activeScope == PlanScope.day) {
        _ensureDayPrayerTask(key);
      }
    }
  }

  void refreshForNow() {
    final today = dateOnly(_clock());
    final todayKey = dayKey(today);
    if (_lastObservedDayKey == todayKey) {
      return;
    }
    _lastObservedDayKey = todayKey;
    _setSelectedPeriodsTo(today);
    _prepareCurrentView();
    _notifyAndPersist();
  }

  void _startDayRolloverWatcher() {
    if (Platform.environment['FLUTTER_TEST'] == 'true') {
      return;
    }
    _dayRolloverTimer?.cancel();
    _dayRolloverTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      refreshForNow();
    });
  }

  void _jumpToCurrentPeriods() {
    final today = dateOnly(_clock());
    _lastObservedDayKey = dayKey(today);
    _setSelectedPeriodsTo(today);
  }

  void _setSelectedPeriodsTo(DateTime today) {
    _selectedPeriods = {
      PlanScope.day: dayKey(today),
      PlanScope.week: weekKey(today),
      PlanScope.month: monthKey(today),
      PlanScope.year: yearKey(today),
    };
  }

  void _seedDefaultRecurringTasks() {
    if (_recurring.any((item) => item.scope == PlanScope.day)) {
      return;
    }
    for (final title in _defaultDailyTasks) {
      _createRecurringTemplate(PlanScope.day, title, null);
    }
  }

  void _ensurePrayerRows() {
    if (_prayer.length == 7) {
      return;
    }

    _prayer
      ..clear()
      ..addAll(
        List<PrayerPlanEntry>.generate(
          7,
          (weekday) => PrayerPlanEntry(
            weekday: weekday,
            title: null,
            description: null,
            updatedAt: _clock(),
          ),
        ),
      );
  }

  void _initializePeriodIfNeeded(PlanScope scope, String periodKey) {
    final marker = _periodMarker(scope, periodKey);
    if (_initializedPeriods.contains(marker)) {
      return;
    }

    final existing = tasksFor(scope, periodKey);
    final templates = _recurring.where((item) => item.scope == scope).toList();

    final existingRecurringIds = existing
        .map((task) => task.recurringId)
        .whereType<int>()
        .toSet();

    final byTitle = <String, PlanTask>{};
    for (final task in existing) {
      final key = normalizeTitle(task.title);
      byTitle.putIfAbsent(key, () => task);
    }

    for (final template in templates) {
      if (existingRecurringIds.contains(template.id)) {
        continue;
      }

      final candidate = byTitle[normalizeTitle(template.title)];
      if (candidate != null) {
        final idx = _tasks.indexWhere((task) => task.id == candidate.id);
        if (idx >= 0) {
          _tasks[idx] = _tasks[idx].copyWith(
            isLocked: true,
            recurringId: template.id,
            source: TaskSource.recurring,
            remindersEnabled: template.remindersEnabled,
            reminders: template.reminders,
            updatedAt: _clock(),
          );
        }
        continue;
      }

      _tasks.add(
        PlanTask(
          id: _taskId++,
          scope: scope,
          periodKey: periodKey,
          title: template.title,
          description: template.description,
          source: TaskSource.recurring,
          isLocked: true,
          recurringId: template.id,
          isDone: false,
          remindersEnabled: template.remindersEnabled,
          reminders: template.reminders,
          createdAt: _clock(),
          updatedAt: _clock(),
        ),
      );
    }

    _initializedPeriods.add(marker);
  }

  void _ensureDayPrayerTask(String dayPeriodKey) {
    final dayTasks = tasksFor(PlanScope.day, dayPeriodKey);

    final existingPrayer = dayTasks.where((task) {
      return task.source == TaskSource.prayer ||
          task.source == TaskSource.prayerDefault;
    }).toList();

    final date = parseDayKey(dayPeriodKey);
    final weekday = date.weekday - 1;
    final entry = _prayer.firstWhere((item) => item.weekday == weekday);

    final desiredTitle = entry.title ?? 'Помолиться';
    final desiredDescription = entry.title == null ? null : entry.description;
    final desiredSource = entry.title == null
        ? TaskSource.prayerDefault
        : TaskSource.prayer;

    if (existingPrayer.isNotEmpty) {
      final old = existingPrayer.first;
      final index = _tasks.indexWhere((task) => task.id == old.id);
      if (index < 0) {
        return;
      }
      _tasks[index] = _tasks[index].copyWith(
        title: desiredTitle,
        description: desiredDescription,
        source: desiredSource,
        isLocked: true,
        remindersEnabled: false,
        reminders: const <TaskReminder>[],
        updatedAt: _clock(),
      );
      return;
    }

    _tasks.add(
      PlanTask(
        id: _taskId++,
        scope: PlanScope.day,
        periodKey: dayPeriodKey,
        title: desiredTitle,
        description: desiredDescription,
        source: desiredSource,
        isLocked: true,
        recurringId: null,
        isDone: false,
        remindersEnabled: false,
        reminders: const <TaskReminder>[],
        createdAt: _clock(),
        updatedAt: _clock(),
      ),
    );
  }

  void _finalizeOverduePeriods() {
    final today = dateOnly(_clock());
    final byPeriod = <String, List<PlanTask>>{};

    for (final task in _tasks) {
      byPeriod.putIfAbsent(_periodMarker(task.scope, task.periodKey), () => []);
      byPeriod[_periodMarker(task.scope, task.periodKey)]!.add(task);
    }

    for (final entry in byPeriod.entries) {
      if (_finalizedPeriods.contains(entry.key)) {
        continue;
      }
      final first = entry.value.first;
      if (!isPeriodOver(first.scope, first.periodKey, today)) {
        continue;
      }

      _finalizedPeriods.add(entry.key);

      final done = entry.value.where((task) => task.isDone).length;
      final total = entry.value.length;

      _addHistory(
        'period_summary',
        'Итог ${first.scope.label} ${first.periodKey}: $done/$total',
      );
    }
  }

  int _createRecurringTemplate(
    PlanScope scope,
    String title,
    String? description, {
    bool remindersEnabled = false,
    List<TaskReminder> reminders = const <TaskReminder>[],
  }) {
    final id = _recurringId++;
    _recurring.add(
      RecurringTaskTemplate(
        id: id,
        scope: scope,
        title: title,
        description: description,
        remindersEnabled: remindersEnabled,
        reminders: normalizeTaskReminders(reminders),
        createdAt: _clock(),
        updatedAt: _clock(),
      ),
    );
    return id;
  }

  void _updateRecurringTemplate(
    int id,
    String title,
    String? description, {
    required bool remindersEnabled,
    required List<TaskReminder> reminders,
  }) {
    final index = _recurring.indexWhere((task) => task.id == id);
    if (index < 0) {
      return;
    }
    _recurring[index] = _recurring[index].copyWith(
      title: title,
      description: description,
      remindersEnabled: remindersEnabled,
      reminders: normalizeTaskReminders(reminders),
      updatedAt: _clock(),
    );
  }

  void _deleteRecurringTemplate(int id) {
    _recurring.removeWhere((task) => task.id == id);
  }

  String? _addDeniedReason(PlanScope scope, String periodKey) {
    if (_isFinalized(scope, periodKey)) {
      return 'Период уже закрыт. Правки недоступны.';
    }

    final today = dateOnly(_clock());
    if (isPeriodOver(scope, periodKey, today)) {
      return 'Нельзя добавлять задачи в прошедший период.';
    }

    return null;
  }

  String? _editDeniedReason(PlanScope scope, String periodKey) {
    if (_isFinalized(scope, periodKey)) {
      return 'Период уже закрыт. Правки недоступны.';
    }

    final policy = editPolicy(scope, periodKey);
    if (policy == EditPolicy.deny) {
      return editDeniedMessage(scope);
    }

    return null;
  }

  bool _isFinalized(PlanScope scope, String periodKey) {
    return _finalizedPeriods.contains(_periodMarker(scope, periodKey));
  }

  String _periodMarker(PlanScope scope, String periodKey) {
    return '${scope.name}|$periodKey';
  }

  void _addHistory(String action, String message) {
    _history.add(
      ActivityLogEntry(
        id: _historyId++,
        action: action,
        message: message,
        timestamp: _clock(),
      ),
    );
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    _dayRolloverTimer?.cancel();
    unawaited(_persistNow());
    super.dispose();
  }
}

class TaskReminder {
  const TaskReminder({required this.dateKey, required this.time});

  final String dateKey;
  final String time;

  String labelForScope(PlanScope scope) {
    return scope == PlanScope.day ? time : '$dateKey $time';
  }

  Map<String, dynamic> toJson() {
    return {'dateKey': dateKey, 'time': time};
  }
}

class PlanTask {
  static const Object _noChange = Object();

  const PlanTask({
    required this.id,
    required this.scope,
    required this.periodKey,
    required this.title,
    required this.description,
    required this.source,
    required this.isLocked,
    required this.recurringId,
    required this.isDone,
    required this.createdAt,
    required this.updatedAt,
    this.remindersEnabled = false,
    this.reminders = const <TaskReminder>[],
    this.doneAt,
  });

  final int id;
  final PlanScope scope;
  final String periodKey;
  final String title;
  final String? description;
  final TaskSource source;
  final bool isLocked;
  final int? recurringId;
  final bool isDone;
  final bool remindersEnabled;
  final List<TaskReminder> reminders;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? doneAt;

  List<String> get reminderLabels => reminders
      .map((item) => item.labelForScope(scope))
      .toList(growable: false);

  PlanTask copyWith({
    PlanScope? scope,
    String? periodKey,
    String? title,
    Object? description = _noChange,
    TaskSource? source,
    bool? isLocked,
    Object? recurringId = _noChange,
    bool? isDone,
    bool? remindersEnabled,
    Object? reminders = _noChange,
    DateTime? updatedAt,
    Object? doneAt = _noChange,
  }) {
    return PlanTask(
      id: id,
      scope: scope ?? this.scope,
      periodKey: periodKey ?? this.periodKey,
      title: title ?? this.title,
      description: identical(description, _noChange)
          ? this.description
          : description as String?,
      source: source ?? this.source,
      isLocked: isLocked ?? this.isLocked,
      recurringId: identical(recurringId, _noChange)
          ? this.recurringId
          : recurringId as int?,
      isDone: isDone ?? this.isDone,
      remindersEnabled: remindersEnabled ?? this.remindersEnabled,
      reminders: identical(reminders, _noChange)
          ? this.reminders
          : List<TaskReminder>.from(reminders as List<TaskReminder>),
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      doneAt: identical(doneAt, _noChange) ? this.doneAt : doneAt as DateTime?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'scope': scope.name,
      'periodKey': periodKey,
      'title': title,
      'description': description,
      'source': source.name,
      'isLocked': isLocked,
      'recurringId': recurringId,
      'isDone': isDone,
      'remindersEnabled': remindersEnabled,
      'reminders': reminders
          .map((item) => item.toJson())
          .toList(growable: false),
      // Legacy compatibility for old scheduler snapshots.
      'reminderTimes': reminders
          .map((item) => item.time)
          .toList(growable: false),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'doneAt': doneAt?.toIso8601String(),
    };
  }

  static PlanTask fromJson(
    Map<String, dynamic> json, {
    required DateTime Function() clock,
  }) {
    final now = clock();
    final scope = planScopeFromName(json['scope']) ?? PlanScope.day;
    final periodKey = jsonString(json['periodKey']) ?? dayKey(dateOnly(now));
    final reminders = normalizeTaskReminders(
      parseTaskRemindersFromJson(json, fallbackDateKey: periodKey),
    );
    final remindersEnabled = json['remindersEnabled'] is bool
        ? json['remindersEnabled'] as bool
        : reminders.isNotEmpty;
    return PlanTask(
      id: jsonInt(json['id'], fallback: 0),
      scope: scope,
      periodKey: periodKey,
      title: jsonString(json['title']) ?? 'Без названия',
      description: jsonString(json['description']),
      source: taskSourceFromName(json['source']) ?? TaskSource.manual,
      isLocked: jsonBool(json['isLocked']),
      recurringId: jsonIntOrNull(json['recurringId']),
      isDone: jsonBool(json['isDone']),
      remindersEnabled: remindersEnabled,
      reminders: reminders,
      createdAt: jsonDate(json['createdAt'], fallback: now),
      updatedAt: jsonDate(json['updatedAt'], fallback: now),
      doneAt: jsonDateOrNull(json['doneAt']),
    );
  }
}

class RecurringTaskTemplate {
  static const Object _noChange = Object();

  const RecurringTaskTemplate({
    required this.id,
    required this.scope,
    required this.title,
    required this.description,
    required this.remindersEnabled,
    required this.reminders,
    required this.createdAt,
    required this.updatedAt,
  });

  final int id;
  final PlanScope scope;
  final String title;
  final String? description;
  final bool remindersEnabled;
  final List<TaskReminder> reminders;
  final DateTime createdAt;
  final DateTime updatedAt;

  RecurringTaskTemplate copyWith({
    String? title,
    Object? description = _noChange,
    bool? remindersEnabled,
    Object? reminders = _noChange,
    DateTime? updatedAt,
  }) {
    return RecurringTaskTemplate(
      id: id,
      scope: scope,
      title: title ?? this.title,
      description: identical(description, _noChange)
          ? this.description
          : description as String?,
      remindersEnabled: remindersEnabled ?? this.remindersEnabled,
      reminders: identical(reminders, _noChange)
          ? this.reminders
          : List<TaskReminder>.from(reminders as List<TaskReminder>),
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'scope': scope.name,
      'title': title,
      'description': description,
      'remindersEnabled': remindersEnabled,
      'reminders': reminders
          .map((item) => item.toJson())
          .toList(growable: false),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  static RecurringTaskTemplate fromJson(
    Map<String, dynamic> json, {
    required DateTime Function() clock,
  }) {
    final now = clock();
    final scope = planScopeFromName(json['scope']) ?? PlanScope.day;
    final reminders = normalizeTaskReminders(
      parseTaskRemindersFromJson(json, fallbackDateKey: dayKey(dateOnly(now))),
    );
    final remindersEnabled = json['remindersEnabled'] is bool
        ? json['remindersEnabled'] as bool
        : reminders.isNotEmpty;
    return RecurringTaskTemplate(
      id: jsonInt(json['id'], fallback: 0),
      scope: scope,
      title: jsonString(json['title']) ?? 'Без названия',
      description: jsonString(json['description']),
      remindersEnabled: remindersEnabled,
      reminders: reminders,
      createdAt: jsonDate(json['createdAt'], fallback: now),
      updatedAt: jsonDate(json['updatedAt'], fallback: now),
    );
  }
}

class PrayerPlanEntry {
  static const Object _noChange = Object();

  const PrayerPlanEntry({
    required this.weekday,
    required this.title,
    required this.description,
    required this.updatedAt,
  });

  final int weekday;
  final String? title;
  final String? description;
  final DateTime updatedAt;

  String get weekdayLabel => weekdayLabelRu(weekday);
  String get weekdayShort => weekdayShortRu(weekday);

  PrayerPlanEntry copyWith({
    Object? title = _noChange,
    Object? description = _noChange,
    DateTime? updatedAt,
  }) {
    return PrayerPlanEntry(
      weekday: weekday,
      title: identical(title, _noChange) ? this.title : title as String?,
      description: identical(description, _noChange)
          ? this.description
          : description as String?,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'weekday': weekday,
      'title': title,
      'description': description,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  static PrayerPlanEntry fromJson(
    Map<String, dynamic> json, {
    required DateTime Function() clock,
  }) {
    final now = clock();
    final parsedWeekday = jsonInt(json['weekday'], fallback: 0).clamp(0, 6);
    return PrayerPlanEntry(
      weekday: parsedWeekday,
      title: jsonString(json['title']),
      description: jsonString(json['description']),
      updatedAt: jsonDate(json['updatedAt'], fallback: now),
    );
  }
}

class ActivityLogEntry {
  const ActivityLogEntry({
    required this.id,
    required this.action,
    required this.message,
    required this.timestamp,
  });

  final int id;
  final String action;
  final String message;
  final DateTime timestamp;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'action': action,
      'message': message,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  static ActivityLogEntry fromJson(
    Map<String, dynamic> json, {
    required DateTime Function() clock,
  }) {
    final now = clock();
    return ActivityLogEntry(
      id: jsonInt(json['id'], fallback: 0),
      action: jsonString(json['action']) ?? 'unknown',
      message: jsonString(json['message']) ?? '',
      timestamp: jsonDate(json['timestamp'], fallback: now),
    );
  }
}

class PeriodProgress {
  const PeriodProgress({required this.done, required this.total});

  final int done;
  final int total;

  double get ratio => total <= 0 ? 0 : (done / total).clamp(0.0, 1.0);
  int get percent => total <= 0 ? 0 : (ratio * 100).round();
}

enum PlanScope { day, week, month, year }

enum TaskSource { manual, recurring, prayer, prayerDefault }

enum EditPolicy { allow, confirm, deny }

PlanScope? planScopeFromName(Object? raw) {
  if (raw is! String) {
    return null;
  }
  for (final value in PlanScope.values) {
    if (value.name == raw) {
      return value;
    }
  }
  return null;
}

TaskSource? taskSourceFromName(Object? raw) {
  if (raw is! String) {
    return null;
  }
  for (final value in TaskSource.values) {
    if (value.name == raw) {
      return value;
    }
  }
  return null;
}

extension ScopeLabel on PlanScope {
  String get label {
    switch (this) {
      case PlanScope.day:
        return 'День';
      case PlanScope.week:
        return 'Неделя';
      case PlanScope.month:
        return 'Месяц';
      case PlanScope.year:
        return 'Год';
    }
  }
}

class DailyPalette {
  static const Color background = Color(0xFF0A121F);
  static const Color surface = Color(0xFF111E33);
  static const Color surfaceHigh = Color(0xFF1A2B47);
  static const Color border = Color(0xFF2A3B57);
  static const Color textPrimary = Color(0xFFF4EBD4);
  static const Color textMuted = Color(0xFF9AA7BF);
  static const Color accent = Color(0xFFD8A137);
  static const Color accentSoft = Color(0xFFE5B45A);
  static const Color success = Color(0xFF63D198);
  static const Color danger = Color(0xFFE86E63);
}

class AtmosphereBackground extends StatelessWidget {
  const AtmosphereBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0D1728), Color(0xFF0B1524), Color(0xFF08101B)],
            ),
          ),
        ),
        Positioned(
          left: -130,
          top: -120,
          child: _GlowCircle(
            size: 280,
            color: DailyPalette.accent.withValues(alpha: 0.24),
          ),
        ),
        Positioned(
          right: -110,
          top: 140,
          child: _GlowCircle(
            size: 240,
            color: const Color(0xFF3A5C88).withValues(alpha: 0.25),
          ),
        ),
        Positioned(
          right: -80,
          bottom: -80,
          child: _GlowCircle(
            size: 220,
            color: DailyPalette.accent.withValues(alpha: 0.14),
          ),
        ),
        child,
      ],
    );
  }
}

class _GlowCircle extends StatelessWidget {
  const _GlowCircle({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.selectedIndex, required this.onChanged});

  final int selectedIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.dashboard_rounded, 'Планы'),
      (Icons.self_improvement, 'Молитвы'),
      (Icons.history, 'История'),
      (Icons.settings, 'Настройки'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      child: Container(
        decoration: BoxDecoration(
          color: DailyPalette.surface.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: DailyPalette.border.withValues(alpha: 0.65),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.28),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Row(
          children: [
            for (var index = 0; index < items.length; index++)
              Expanded(
                child: _BottomNavItem(
                  icon: items[index].$1,
                  label: items[index].$2,
                  selected: selectedIndex == index,
                  onTap: () => onChanged(index),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: selected
              ? const LinearGradient(
                  colors: [Color(0xFFFFC661), Color(0xFFD8982D)],
                )
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 20,
              color: selected
                  ? DailyPalette.background
                  : DailyPalette.textMuted,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: selected
                    ? DailyPalette.background
                    : DailyPalette.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xAA1B2B45), Color(0xAA101B2E)],
        ),
        border: Border.all(color: DailyPalette.border.withValues(alpha: 0.8)),
      ),
      padding: const EdgeInsets.all(14),
      child: child,
    );
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.title,
    required this.subtitle,
    required this.rightText,
  });

  final String title;
  final String subtitle;
  final String rightText;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0xFF1A2A44), Color(0xFF101D31)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: DailyPalette.border.withValues(alpha: 0.8)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: DailyPalette.textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: 23,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: DailyPalette.textMuted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: DailyPalette.accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: DailyPalette.accent.withValues(alpha: 0.35),
              ),
            ),
            child: Text(
              rightText,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: DailyPalette.accentSoft,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScopePill extends StatelessWidget {
  const _ScopePill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: selected
              ? const LinearGradient(
                  colors: [Color(0xFFFFC45C), Color(0xFFD28F28)],
                )
              : null,
          color: selected ? null : DailyPalette.surfaceHigh,
          border: Border.all(
            color: selected
                ? Colors.transparent
                : DailyPalette.border.withValues(alpha: 0.7),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? DailyPalette.background : DailyPalette.textMuted,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _PolicyBadge extends StatelessWidget {
  const _PolicyBadge({required this.policy, required this.readOnlyHint});

  final EditPolicy policy;
  final String readOnlyHint;

  @override
  Widget build(BuildContext context) {
    final (icon, text, color) = switch (policy) {
      EditPolicy.allow => (
        Icons.check_circle_outline,
        'Редактирование активно',
        DailyPalette.success,
      ),
      EditPolicy.confirm => (
        Icons.verified_user_outlined,
        'Требуется подтверждение правки',
        DailyPalette.accent,
      ),
      EditPolicy.deny => (
        Icons.visibility_outlined,
        'Режим просмотра: $readOnlyHint',
        DailyPalette.textMuted,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _ProgressTile extends StatelessWidget {
  const _ProgressTile({required this.scope, required this.progress});

  final PlanScope scope;
  final PeriodProgress progress;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            scope.label,
            style: const TextStyle(color: DailyPalette.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            '${progress.done}/${progress.total}',
            style: const TextStyle(
              color: DailyPalette.textPrimary,
              fontSize: 21,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress.ratio,
              minHeight: 7,
              backgroundColor: DailyPalette.surfaceHigh,
              valueColor: const AlwaysStoppedAnimation<Color>(
                DailyPalette.accent,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${progress.percent}%',
            style: const TextStyle(color: DailyPalette.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: DailyPalette.surfaceHigh,
          border: Border.all(color: DailyPalette.border.withValues(alpha: 0.6)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 17, color: DailyPalette.accent),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: DailyPalette.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyTasksCard extends StatelessWidget {
  const _EmptyTasksCard();

  @override
  Widget build(BuildContext context) {
    return const _GlassCard(
      child: Column(
        children: [
          Icon(
            Icons.track_changes_rounded,
            color: DailyPalette.accent,
            size: 34,
          ),
          SizedBox(height: 8),
          Text(
            'Задач пока нет',
            style: TextStyle(
              color: DailyPalette.textPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 16,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Добавьте первую задачу для выбранного периода.',
            style: TextStyle(color: DailyPalette.textMuted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _TaskEditorSubmission {
  const _TaskEditorSubmission({
    required this.title,
    required this.description,
    required this.remindersEnabled,
    required this.reminders,
  });

  final String title;
  final String? description;
  final bool remindersEnabled;
  final List<TaskReminder> reminders;
}

class _PrayerEditorSubmission {
  const _PrayerEditorSubmission({
    required this.clear,
    required this.title,
    required this.description,
  });

  final bool clear;
  final String? title;
  final String? description;
}

class _TaskEditorDialog extends StatefulWidget {
  const _TaskEditorDialog({
    required this.title,
    required this.initialTitle,
    required this.initialDescription,
    required this.scope,
    required this.periodKey,
    required this.periodStartDate,
    required this.periodEndDate,
    required this.initialRemindersEnabled,
    required this.initialReminders,
  });

  final String title;
  final String initialTitle;
  final String initialDescription;
  final PlanScope scope;
  final String periodKey;
  final DateTime periodStartDate;
  final DateTime periodEndDate;
  final bool initialRemindersEnabled;
  final List<TaskReminder> initialReminders;

  @override
  State<_TaskEditorDialog> createState() => _TaskEditorDialogState();
}

class _TaskEditorDialogState extends State<_TaskEditorDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  final FocusNode _titleFocusNode = FocusNode();
  late bool _remindersEnabled;
  late List<TaskReminder> _reminders;
  String? _errorText;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialTitle);
    _descriptionController = TextEditingController(
      text: widget.initialDescription,
    );
    _remindersEnabled = widget.initialRemindersEnabled;
    _reminders = normalizeTaskReminders(widget.initialReminders);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _titleFocusNode.dispose();
    super.dispose();
  }

  Future<void> _pickReminder() async {
    if (_isSaving || !_remindersEnabled) {
      return;
    }
    final initialDate = _reminders.isNotEmpty
        ? parseDayKey(_reminders.last.dateKey)
        : _initialReminderDate();
    DateTime selectedDate = initialDate;

    if (widget.scope != PlanScope.day) {
      final pickedDate = await showDatePicker(
        context: context,
        initialDate: initialDate,
        firstDate: widget.periodStartDate,
        lastDate: widget.periodEndDate,
        helpText: 'Дата напоминания',
        builder: (context, child) {
          return Theme(
            data: Theme.of(context).copyWith(
              colorScheme: const ColorScheme.dark(
                primary: DailyPalette.accent,
                surface: DailyPalette.surface,
              ),
            ),
            child: child!,
          );
        },
      );
      if (!mounted || pickedDate == null) {
        return;
      }
      selectedDate = dateOnly(pickedDate);
    }

    final initialTime = _reminders.isNotEmpty
        ? parseTime(_reminders.last.time)
        : null;
    final picked = await showTimePicker(
      context: context,
      initialTime: initialTime ?? TimeOfDay.now(),
      helpText: 'Время напоминания',
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.dark(
              primary: DailyPalette.accent,
              surface: DailyPalette.surface,
            ),
          ),
          child: child!,
        );
      },
    );
    if (!mounted || picked == null) {
      return;
    }

    final reminder = TaskReminder(
      dateKey: dayKey(selectedDate),
      time: formatTime(picked),
    );
    final validationError = _validateReminder(reminder);
    if (validationError != null) {
      _showInlineSnack(validationError);
      return;
    }

    final duplicate = _reminders.any(
      (item) => item.dateKey == reminder.dateKey && item.time == reminder.time,
    );
    if (duplicate) {
      _showInlineSnack('Такое время уже добавлено.');
      return;
    }

    setState(() {
      _reminders = normalizeTaskReminders(<TaskReminder>[
        ..._reminders,
        reminder,
      ]);
    });
  }

  DateTime _initialReminderDate() {
    final now = dateOnly(DateTime.now());
    if (widget.scope == PlanScope.day) {
      return dateOnly(parseDayKey(widget.periodKey));
    }
    if (now.isBefore(widget.periodStartDate)) {
      return widget.periodStartDate;
    }
    if (now.isAfter(widget.periodEndDate)) {
      return widget.periodEndDate;
    }
    return now;
  }

  String? _validateReminder(TaskReminder value) {
    final selected = parseTime(value.time);
    if (selected == null || !isDayKey(value.dateKey)) {
      return 'Некорректная дата или время напоминания.';
    }

    final selectedDate = parseDayKey(value.dateKey);
    final now = DateTime.now();
    final taskDate = dateOnly(selectedDate);
    final today = dateOnly(now);

    if (taskDate.isBefore(widget.periodStartDate) ||
        taskDate.isAfter(widget.periodEndDate)) {
      return 'Дата напоминания вне выбранного периода.';
    }

    if (taskDate.isBefore(today)) {
      return 'Дата задачи уже прошла, напоминание добавить нельзя.';
    }

    if (taskDate.isAtSameMomentAs(today)) {
      final scheduled = DateTime(
        taskDate.year,
        taskDate.month,
        taskDate.day,
        selected.hour,
        selected.minute,
      );
      if (!scheduled.isAfter(now)) {
        return 'Нельзя выбрать уже прошедшее время.';
      }
    }

    return null;
  }

  void _removeReminder(TaskReminder value) {
    if (_isSaving) {
      return;
    }
    setState(() {
      _reminders.removeWhere(
        (item) => item.dateKey == value.dateKey && item.time == value.time,
      );
    });
  }

  void _save() {
    if (_isSaving) {
      return;
    }

    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _errorText = 'Название не может быть пустым.';
      });
      _titleFocusNode.requestFocus();
      return;
    }

    final cleanReminders = normalizeTaskReminders(_reminders);
    if (_remindersEnabled && cleanReminders.isEmpty) {
      _showInlineSnack(
        'Добавьте хотя бы одно напоминание или выключите тумблер.',
      );
      return;
    }

    _isSaving = true;
    final description = _descriptionController.text.trim();
    Navigator.of(context).pop(
      _TaskEditorSubmission(
        title: title,
        description: description.isEmpty ? null : description,
        remindersEnabled: _remindersEnabled,
        reminders: _remindersEnabled
            ? List<TaskReminder>.unmodifiable(cleanReminders)
            : const <TaskReminder>[],
      ),
    );
  }

  void _showInlineSnack(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: DailyPalette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _titleController,
              focusNode: _titleFocusNode,
              textCapitalization: TextCapitalization.sentences,
              decoration: _fieldDecoration(
                'Название',
              ).copyWith(errorText: _errorText),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _descriptionController,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: _fieldDecoration('Описание (опционально)'),
            ),
            const SizedBox(height: 12),
            SwitchListTile.adaptive(
              value: _remindersEnabled,
              activeThumbColor: DailyPalette.accent,
              activeTrackColor: DailyPalette.accent.withValues(alpha: 0.4),
              contentPadding: EdgeInsets.zero,
              onChanged: _isSaving
                  ? null
                  : (value) {
                      setState(() {
                        _remindersEnabled = value;
                      });
                    },
              title: const Text('Напоминать о задаче'),
              subtitle: const Text(
                'По умолчанию выключено. Включите и настройте дату/время.',
                style: TextStyle(color: DailyPalette.textMuted, fontSize: 12),
              ),
            ),
            if (_remindersEnabled) ...[
              Row(
                children: [
                  const Icon(
                    Icons.notifications_active_outlined,
                    size: 18,
                    color: DailyPalette.accent,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      widget.scope == PlanScope.day
                          ? 'Напомнить сегодня (время)'
                          : 'Напомнить (дата и время)',
                      style: const TextStyle(
                        color: DailyPalette.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _reminders.isEmpty
                      ? const <Widget>[
                          Text(
                            'Напоминаний нет',
                            style: TextStyle(
                              color: DailyPalette.textMuted,
                              fontSize: 12,
                            ),
                          ),
                        ]
                      : _reminders
                            .map(
                              (reminder) => Chip(
                                label: Text(
                                  reminder.labelForScope(widget.scope),
                                ),
                                onDeleted: _isSaving
                                    ? null
                                    : () => _removeReminder(reminder),
                                deleteIconColor: DailyPalette.textMuted,
                                side: BorderSide(
                                  color: DailyPalette.border.withValues(
                                    alpha: 0.75,
                                  ),
                                ),
                                backgroundColor: DailyPalette.surfaceHigh,
                              ),
                            )
                            .toList(growable: false),
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _isSaving ? null : _pickReminder,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: DailyPalette.border),
                  ),
                  icon: const Icon(Icons.add_alert_outlined),
                  label: Text(
                    widget.scope == PlanScope.day
                        ? 'Добавить время'
                        : 'Добавить дату и время',
                  ),
                ),
              ),
              const SizedBox(height: 6),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Текст уведомления: "Напоминаю о задаче: <название задачи>".',
                  style: TextStyle(color: DailyPalette.textMuted, fontSize: 12),
                ),
              ),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Для задачи с замком напоминания сохраняются на каждый день, пока не выключите.',
                  style: TextStyle(color: DailyPalette.textMuted, fontSize: 12),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: const Text('Отмена'),
        ),
        FilledButton(
          key: const ValueKey<String>('task_dialog_save'),
          onPressed: _isSaving ? null : _save,
          style: FilledButton.styleFrom(
            backgroundColor: DailyPalette.accent,
            foregroundColor: DailyPalette.background,
          ),
          child: const Text('Сохранить'),
        ),
      ],
    );
  }
}

class _PrayerEditorDialog extends StatefulWidget {
  const _PrayerEditorDialog({required this.entry});

  final PrayerPlanEntry entry;

  @override
  State<_PrayerEditorDialog> createState() => _PrayerEditorDialogState();
}

class _PrayerEditorDialogState extends State<_PrayerEditorDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.entry.title ?? '');
    _descriptionController = TextEditingController(
      text: widget.entry.description ?? '',
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  void _save() {
    if (_isSaving) {
      return;
    }
    _isSaving = true;
    final title = _titleController.text.trim();
    final description = _descriptionController.text.trim();
    Navigator.of(context).pop(
      _PrayerEditorSubmission(
        clear: false,
        title: title.isEmpty ? null : title,
        description: description.isEmpty ? null : description,
      ),
    );
  }

  void _clear() {
    if (_isSaving) {
      return;
    }
    _isSaving = true;
    Navigator.of(context).pop(
      const _PrayerEditorSubmission(
        clear: true,
        title: null,
        description: null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: DailyPalette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text('Молитва: ${widget.entry.weekdayLabel}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _titleController,
              decoration: _fieldDecoration('Название нужды'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _descriptionController,
              minLines: 2,
              maxLines: 4,
              decoration: _fieldDecoration('Описание (опционально)'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : _clear,
          child: const Text('Очистить'),
        ),
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: const Text('Отмена'),
        ),
        FilledButton(
          key: const ValueKey<String>('prayer_dialog_save'),
          onPressed: _isSaving ? null : _save,
          style: FilledButton.styleFrom(
            backgroundColor: DailyPalette.accent,
            foregroundColor: DailyPalette.background,
          ),
          child: const Text('Сохранить'),
        ),
      ],
    );
  }
}

class _MiniTag extends StatelessWidget {
  const _MiniTag({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: DailyPalette.surfaceHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DailyPalette.border.withValues(alpha: 0.8)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: DailyPalette.accent),
          const SizedBox(width: 6),
          Text(
            text,
            style: const TextStyle(color: DailyPalette.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

InputDecoration _fieldDecoration(String hint) {
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: DailyPalette.textMuted),
    filled: true,
    fillColor: DailyPalette.surfaceHigh,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: DailyPalette.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: DailyPalette.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: DailyPalette.accent),
    ),
  );
}

int jsonInt(Object? value, {required int fallback}) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value) ?? fallback;
  }
  return fallback;
}

int? jsonIntOrNull(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}

bool jsonBool(Object? value) {
  if (value is bool) {
    return value;
  }
  if (value is num) {
    return value != 0;
  }
  if (value is String) {
    final normalized = value.trim().toLowerCase();
    return normalized == 'true' || normalized == '1';
  }
  return false;
}

String? jsonString(Object? value) {
  if (value is String) {
    return value;
  }
  return null;
}

DateTime jsonDate(Object? value, {required DateTime fallback}) {
  if (value is! String) {
    return fallback;
  }
  return DateTime.tryParse(value) ?? fallback;
}

DateTime? jsonDateOrNull(Object? value) {
  if (value is! String) {
    return null;
  }
  return DateTime.tryParse(value);
}

String normalizeTitle(String value) {
  return value.trim().toLowerCase();
}

DateTime dateOnly(DateTime value) {
  return DateTime(value.year, value.month, value.day);
}

String dayKey(DateTime date) {
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String monthKey(DateTime date) {
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';
}

String yearKey(DateTime date) {
  return date.year.toString();
}

String defaultPeriodKey(PlanScope scope, DateTime date) {
  switch (scope) {
    case PlanScope.day:
      return dayKey(date);
    case PlanScope.week:
      return weekKey(date);
    case PlanScope.month:
      return monthKey(date);
    case PlanScope.year:
      return yearKey(date);
  }
}

String weekKey(DateTime date) {
  final d = dateOnly(date);
  final thursday = d.add(Duration(days: (DateTime.thursday - d.weekday)));
  final weekYear = thursday.year;
  final weekOne = _startOfIsoWeek(DateTime(weekYear, 1, 4));
  final currentWeek = _startOfIsoWeek(d);
  final weekNumber = (currentWeek.difference(weekOne).inDays ~/ 7) + 1;
  return '$weekYear-W${weekNumber.toString().padLeft(2, '0')}';
}

DateTime _startOfIsoWeek(DateTime date) {
  final d = dateOnly(date);
  return d.subtract(Duration(days: d.weekday - DateTime.monday));
}

DateTime parseDayKey(String key) {
  final parts = key.split('-');
  return DateTime(
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
  );
}

DateTime parseMonthKey(String key) {
  final parts = key.split('-');
  return DateTime(int.parse(parts[0]), int.parse(parts[1]), 1);
}

DateTime parseYearKey(String key) {
  return DateTime(int.parse(key), 1, 1);
}

DateTime parseWeekKey(String key) {
  final parts = key.split('-W');
  final year = int.parse(parts[0]);
  final week = int.parse(parts[1]);
  final weekOneMonday = _startOfIsoWeek(DateTime(year, 1, 4));
  return weekOneMonday.add(Duration(days: (week - 1) * 7));
}

DateTime contextDateFromPeriod(PlanScope scope, String periodKey) {
  switch (scope) {
    case PlanScope.day:
      return parseDayKey(periodKey);
    case PlanScope.week:
      return parseWeekKey(periodKey);
    case PlanScope.month:
      return parseMonthKey(periodKey);
    case PlanScope.year:
      return parseYearKey(periodKey);
  }
}

String addPeriod(PlanScope scope, String periodKey, int delta) {
  switch (scope) {
    case PlanScope.day:
      final next = parseDayKey(periodKey).add(Duration(days: delta));
      return dayKey(next);
    case PlanScope.week:
      final next = parseWeekKey(periodKey).add(Duration(days: delta * 7));
      return weekKey(next);
    case PlanScope.month:
      final start = parseMonthKey(periodKey);
      final month = start.month - 1 + delta;
      final year = start.year + (month ~/ 12);
      final normalizedMonth = month % 12;
      final m = normalizedMonth < 0 ? normalizedMonth + 12 : normalizedMonth;
      return monthKey(DateTime(year, m + 1, 1));
    case PlanScope.year:
      final year = int.parse(periodKey) + delta;
      return year.toString();
  }
}

bool isCurrentPeriod(PlanScope scope, String periodKey, DateTime today) {
  switch (scope) {
    case PlanScope.day:
      return dayKey(today) == periodKey;
    case PlanScope.week:
      return weekKey(today) == periodKey;
    case PlanScope.month:
      return monthKey(today) == periodKey;
    case PlanScope.year:
      return yearKey(today) == periodKey;
  }
}

DateTime periodEndDate(PlanScope scope, String periodKey) {
  switch (scope) {
    case PlanScope.day:
      return parseDayKey(periodKey);
    case PlanScope.week:
      return parseWeekKey(periodKey).add(const Duration(days: 6));
    case PlanScope.month:
      final start = parseMonthKey(periodKey);
      return DateTime(start.year, start.month + 1, 0);
    case PlanScope.year:
      final start = parseYearKey(periodKey);
      return DateTime(start.year, 12, 31);
  }
}

bool isPeriodOver(PlanScope scope, String periodKey, DateTime today) {
  return dateOnly(today).isAfter(periodEndDate(scope, periodKey));
}

String formatPeriodTitle(PlanScope scope, String periodKey) {
  switch (scope) {
    case PlanScope.day:
      final d = parseDayKey(periodKey);
      return '${dayKey(d)} • ${weekdayLabel(d.weekday - 1)}';
    case PlanScope.week:
      final start = parseWeekKey(periodKey);
      final end = start.add(const Duration(days: 6));
      return '$periodKey • ${shortDate(start)} - ${shortDate(end)}';
    case PlanScope.month:
      final d = parseMonthKey(periodKey);
      return '${monthName(d.month)} ${d.year}';
    case PlanScope.year:
      return periodKey;
  }
}

String shortDate(DateTime date) {
  return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}';
}

String formatDateTime(DateTime dt) {
  return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year} '
      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
}

String _formatDateRu(DateTime date) {
  return '${date.day.toString().padLeft(2, '0')} ${monthName(date.month)}';
}

String monthName(int month) {
  const months = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];
  return months[(month - 1).clamp(0, 11)];
}

String weekdayLabel(int weekday) {
  const names = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье',
  ];
  return names[weekday.clamp(0, 6)];
}

String weekdayLabelRu(int weekday) {
  return weekdayLabel(weekday);
}

String weekdayShortRu(int weekday) {
  const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  return names[weekday.clamp(0, 6)];
}

String editDeniedMessage(PlanScope scope) {
  switch (scope) {
    case PlanScope.day:
      return 'Редактировать дневной план можно только сегодня.';
    case PlanScope.week:
      return 'Редактировать недельный план можно только в понедельник текущей недели.';
    case PlanScope.month:
      return 'Редактировать месячный план можно только 1-2 числа текущего месяца.';
    case PlanScope.year:
      return 'Редактировать годовой план можно только в январе.';
  }
}

String? normalizeTime(String value) {
  final clean = value.trim();
  final match = RegExp(r'^([0-1]?\d|2[0-3]):([0-5]\d)$').firstMatch(clean);
  if (match == null) {
    return null;
  }
  final hour = int.parse(match.group(1)!);
  final minute = int.parse(match.group(2)!);
  return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

TimeOfDay? parseTime(String value) {
  final normalized = normalizeTime(value);
  if (normalized == null) {
    return null;
  }
  final parts = normalized.split(':');
  return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
}

String formatTime(TimeOfDay value) {
  return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}

bool isDayKey(String value) {
  return RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value.trim());
}

List<TaskReminder> normalizeTaskReminders(List<TaskReminder> raw) {
  final unique = <String, TaskReminder>{};
  for (final item in raw) {
    final date = item.dateKey.trim();
    final time = normalizeTime(item.time);
    if (!isDayKey(date) || time == null) {
      continue;
    }
    final normalized = TaskReminder(dateKey: date, time: time);
    unique.putIfAbsent(
      '${normalized.dateKey}|${normalized.time}',
      () => normalized,
    );
  }
  final reminders = unique.values.toList(growable: false);
  final sorted = List<TaskReminder>.from(reminders);
  sorted.sort(
    (a, b) => '${a.dateKey}|${a.time}'.compareTo('${b.dateKey}|${b.time}'),
  );
  return sorted;
}

List<TaskReminder> parseTaskRemindersFromJson(
  Map<String, dynamic> json, {
  required String fallbackDateKey,
}) {
  final reminders = <TaskReminder>[];
  final rawReminders = json['reminders'];
  if (rawReminders is List) {
    for (final value in rawReminders) {
      if (value is Map<String, dynamic>) {
        final date = jsonString(value['dateKey'])?.trim() ?? fallbackDateKey;
        final time = jsonString(value['time']);
        if (time == null) {
          continue;
        }
        reminders.add(TaskReminder(dateKey: date, time: time));
      } else if (value is Map) {
        final date = jsonString(value['dateKey'])?.trim() ?? fallbackDateKey;
        final time = jsonString(value['time']);
        if (time == null) {
          continue;
        }
        reminders.add(TaskReminder(dateKey: date, time: time));
      }
    }
  }

  if (reminders.isNotEmpty) {
    return reminders;
  }

  final legacyTimes = json['reminderTimes'];
  if (legacyTimes is List) {
    for (final value in legacyTimes) {
      if (value is String) {
        reminders.add(TaskReminder(dateKey: fallbackDateKey, time: value));
      }
    }
  }
  return reminders;
}

class TimezoneOption {
  const TimezoneOption({required this.id, required this.label});

  final String id;
  final String label;
}

const List<TimezoneOption> timezoneOptions = [
  TimezoneOption(id: 'UTC', label: 'UTC'),
  TimezoneOption(id: 'Europe/Moscow', label: 'Москва (UTC+3)'),
  TimezoneOption(id: 'Europe/Minsk', label: 'Минск (UTC+3)'),
  TimezoneOption(id: 'Europe/Kyiv', label: 'Киев (UTC+2/+3)'),
  TimezoneOption(id: 'Europe/Berlin', label: 'Берлин (UTC+1/+2)'),
  TimezoneOption(id: 'Europe/London', label: 'Лондон (UTC+0/+1)'),
  TimezoneOption(id: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)'),
  TimezoneOption(id: 'Asia/Yerevan', label: 'Ереван (UTC+4)'),
  TimezoneOption(id: 'Asia/Baku', label: 'Баку (UTC+4)'),
  TimezoneOption(id: 'Asia/Almaty', label: 'Алматы (UTC+5)'),
  TimezoneOption(id: 'Asia/Bishkek', label: 'Бишкек (UTC+6)'),
  TimezoneOption(id: 'Asia/Tashkent', label: 'Ташкент (UTC+5)'),
  TimezoneOption(id: 'Asia/Dubai', label: 'Дубай (UTC+4)'),
  TimezoneOption(id: 'Asia/Bangkok', label: 'Бангкок (UTC+7)'),
  TimezoneOption(id: 'Asia/Tokyo', label: 'Токио (UTC+9)'),
  TimezoneOption(id: 'America/New_York', label: 'Нью-Йорк (UTC-5/-4)'),
  TimezoneOption(id: 'America/Chicago', label: 'Чикаго (UTC-6/-5)'),
  TimezoneOption(id: 'America/Denver', label: 'Денвер (UTC-7/-6)'),
  TimezoneOption(id: 'America/Los_Angeles', label: 'Лос-Анджелес (UTC-8/-7)'),
];

String timezoneLabelFor(String timezoneId) {
  for (final option in timezoneOptions) {
    if (option.id == timezoneId) {
      return option.label;
    }
  }
  return timezoneId;
}

IconData iconForHistory(String action) {
  switch (action) {
    case 'task_add':
      return Icons.add_task;
    case 'task_edit':
      return Icons.edit;
    case 'task_delete':
      return Icons.delete_outline;
    case 'task_toggle':
      return Icons.task_alt;
    case 'task_lock':
      return Icons.lock;
    case 'prayer_update':
      return Icons.self_improvement;
    case 'settings_update':
      return Icons.tune;
    case 'period_summary':
      return Icons.summarize;
    case 'export':
      return Icons.ios_share;
    default:
      return Icons.bolt;
  }
}
