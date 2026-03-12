import 'package:daily/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStateStore extends DailyStateStore {
  Map<String, dynamic>? _snapshot;

  @override
  Future<Map<String, dynamic>?> loadState() async {
    return _snapshot;
  }

  @override
  Future<void> saveState(Map<String, dynamic> state) async {
    _snapshot = state;
  }
}

class _FakeNotificationsBridge extends DailyNotificationsBridge {
  @override
  Future<bool> ensurePermission() async => true;

  @override
  Future<bool> syncSchedule({
    required bool enabled,
    required String morningTime,
    required String eveningTime,
    required String timezoneId,
    String? stateJson,
  }) async {
    return true;
  }

  @override
  Future<String> getDefaultTimezone() async => 'Europe/Moscow';

  @override
  Future<bool> sendTestNotification({String type = 'morning'}) async => true;
}

void main() {
  Future<PlanController> createController() {
    return PlanController.create(
      clock: () => DateTime(2026, 1, 10, 9, 0),
      stateStore: _FakeStateStore(),
      notificationsBridge: _FakeNotificationsBridge(),
    );
  }

  Future<void> pumpPlanner(
    WidgetTester tester,
    PlanController controller,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PlannerScreen(controller: controller, onOpenPrayer: () {}),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> pumpDailyReady(WidgetTester tester) async {
    await tester.pumpWidget(const DailyApp());
    expect(find.text('Загрузка Daily...'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1000));
  }

  Future<void> settleShort(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
  }

  Future<void> openAddTaskDialog(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.edit_note).first);
    await settleShort(tester);
    expect(find.byType(AlertDialog), findsOneWidget);
  }

  testWidgets('Daily app bootstraps without crash', (tester) async {
    await pumpDailyReady(tester);
    expect(find.byType(Scaffold), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('add task flow adds one task', (tester) async {
    final controller = await createController();
    addTearDown(controller.dispose);
    await pumpPlanner(tester, controller);
    await openAddTaskDialog(tester);

    await tester.enterText(find.byType(TextField).first, 'Тестовая задача');
    await tester.tap(find.byKey(const ValueKey<String>('task_dialog_save')));
    await settleShort(tester);

    final added = controller.currentTasks.where(
      (task) => task.title == 'Тестовая задача',
    );
    expect(added.length, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('double tap save does not duplicate task or crash', (
    tester,
  ) async {
    final controller = await createController();
    addTearDown(controller.dispose);
    await pumpPlanner(tester, controller);
    await openAddTaskDialog(tester);

    await tester.enterText(find.byType(TextField).first, 'Double tap task');
    final saveButton = find.byKey(const ValueKey<String>('task_dialog_save'));
    await tester.tap(saveButton);
    await tester.tap(saveButton, warnIfMissed: false);
    await settleShort(tester);

    final added = controller.currentTasks.where(
      (task) => task.title == 'Double tap task',
    );
    expect(added.length, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('closing add task dialog is safe', (tester) async {
    final controller = await createController();
    addTearDown(controller.dispose);
    await pumpPlanner(tester, controller);
    await openAddTaskDialog(tester);

    await tester.enterText(
      find.byType(TextField).first,
      'Задача не должна сохраниться',
    );
    await tester.tap(find.text('Отмена'));
    await settleShort(tester);

    expect(find.byType(AlertDialog), findsNothing);
    final added = controller.currentTasks.where(
      (task) => task.title == 'Задача не должна сохраниться',
    );
    expect(added.length, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('planner jumps to next day after rollover', (tester) async {
    var now = DateTime(2026, 1, 10, 23, 58);
    final controller = await PlanController.create(
      clock: () => now,
      stateStore: _FakeStateStore(),
      notificationsBridge: _FakeNotificationsBridge(),
    );
    addTearDown(controller.dispose);

    expect(controller.activeScope, PlanScope.day);
    expect(controller.activePeriodKey, '2026-01-10');

    now = DateTime(2026, 1, 11, 0, 2);
    controller.refreshForNow();
    await tester.pump(const Duration(milliseconds: 400));

    expect(controller.activePeriodKey, '2026-01-11');
    expect(tester.takeException(), isNull);
  });
}
