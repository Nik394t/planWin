from typing import Any

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder

from utils import WEEKDAYS_RU, WEEKDAYS_RU_SHORT, format_period_title, progress_bar, truncate, PeriodContext


SCOPE_LABELS = {
    "day": "День",
    "week": "Неделя",
    "month": "Месяц",
    "year": "Год",
}


def _scope_label(scope: str, active: bool) -> str:
    label = SCOPE_LABELS.get(scope, scope)
    return f"[{label}]" if active else label


def _is_bible_task(task: dict[str, Any]) -> bool:
    title = (task.get("title") or "").lower()
    return "библи" in title or "bible" in title


def build_main_menu(is_admin: bool) -> tuple[str, InlineKeyboardMarkup]:
    text = "🏠 Главное меню"
    kb = InlineKeyboardBuilder()
    kb.button(text="📅 Планы", callback_data="p")
    kb.button(text="🙏 Молитвенный план", callback_data="pr")
    kb.button(text="⚙️ Настройки", callback_data="st")
    kb.button(text="ℹ️ Инструкция", callback_data="help")
    if is_admin:
        kb.button(text="👥 Участники", callback_data="adm")
    if is_admin:
        kb.adjust(2, 2, 1)
    else:
        kb.adjust(2, 2)
    return text, kb.as_markup()


def build_plan_view(
    scope: str,
    period_key: str,
    context: PeriodContext,
    tab_context: PeriodContext,
    tasks: list[dict[str, Any]],
    progress: dict[str, tuple[int, int]],
    max_task_buttons: int = 20,
    header_text: str | None = None,
) -> tuple[str, InlineKeyboardMarkup]:
    title = SCOPE_LABELS.get(scope, scope)
    period_title = format_period_title(scope, period_key)

    lines: list[str] = []
    if header_text:
        lines.extend(header_text.splitlines())
        lines.append("")

    lines.extend(
        [
        f"Планы: {title}",
        f"Период: {period_title}",
        "",
        "Прогресс:",
        f"День: {progress_bar(*progress['day'])}",
        f"Неделя: {progress_bar(*progress['week'])}",
        f"Месяц: {progress_bar(*progress['month'])}",
        f"Год: {progress_bar(*progress['year'])}",
        "",
        "Задачи:",
        ]
    )

    if not tasks:
        lines.append("(задач нет)")
    else:
        for idx, task in enumerate(tasks[:30], 1):
            status = "✅" if task.get("is_done") else "⬜️"
            lock_mark = " 🔒" if task.get("is_locked") else ""
            lines.append(f"{idx}. {status}{lock_mark} {task.get('title', '')}")
            description = task.get("description")
            if description:
                clean_desc = description.replace("\n", " ")
                lines.append(f"    {truncate(clean_desc, 80)}")
        if len(tasks) > 30:
            lines.append(f"... и еще {len(tasks) - 30}")

    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()

    for task in tasks[:max_task_buttons]:
        status = "✅" if task.get("is_done") else "⬜️"
        lock_mark = " 🔒" if task.get("is_locked") else ""
        title_text = truncate(task.get("title", ""), 24)
        kb.row(
            InlineKeyboardButton(
                text=f"{status}{lock_mark} {title_text}", callback_data=f"td:{task['id']}"
            )
        )

    kb.row(
        InlineKeyboardButton(text=_scope_label("day", scope == "day"), callback_data=f"v:day:{tab_context.day_key}"),
        InlineKeyboardButton(text=_scope_label("week", scope == "week"), callback_data=f"v:week:{tab_context.week_key}"),
        InlineKeyboardButton(text=_scope_label("month", scope == "month"), callback_data=f"v:month:{tab_context.month_key}"),
        InlineKeyboardButton(text=_scope_label("year", scope == "year"), callback_data=f"v:year:{tab_context.year_key}"),
    )

    kb.row(
        InlineKeyboardButton(text="⬅️", callback_data=f"nav:{scope}:{period_key}:-1"),
        InlineKeyboardButton(text="➡️", callback_data=f"nav:{scope}:{period_key}:1"),
    )

    kb.row(
        InlineKeyboardButton(text="➕ Добавить", callback_data=f"a:{scope}:{period_key}"),
        InlineKeyboardButton(text="✏️ Редактировать", callback_data=f"el:{scope}:{period_key}"),
        InlineKeyboardButton(text="🗑️ Удалить", callback_data=f"dl:{scope}:{period_key}"),
    )

    kb.row(
        InlineKeyboardButton(text="🔒 Замочки", callback_data=f"lk:{scope}:{period_key}"),
        InlineKeyboardButton(text="📜 История", callback_data="h"),
    )
    kb.row(InlineKeyboardButton(text="📤 Экспорт", callback_data="ex"))
    kb.row(InlineKeyboardButton(text="⬅️ Назад", callback_data="m"))

    return text, kb.as_markup()


def build_task_select_view(
    title: str,
    tasks: list[dict[str, Any]],
    action_prefix: str,
    back_data: str,
) -> tuple[str, InlineKeyboardMarkup]:
    lines = [title, "", "Выберите задачу:"]
    if not tasks:
        lines.append("(задач нет)")
    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()
    for task in tasks:
        title_text = truncate(task.get("title", ""), 30)
        kb.button(text=title_text, callback_data=f"{action_prefix}:{task['id']}")
    kb.button(text="⬅️ Назад", callback_data=back_data)
    kb.adjust(1)
    return text, kb.as_markup()


def build_task_detail_view(task: dict[str, Any]) -> tuple[str, InlineKeyboardMarkup]:
    title = task.get("title", "")
    description = task.get("description") or "(нет описания)"
    status = "✅ Выполнено" if task.get("is_done") else "⬜️ Не выполнено"
    lock_status = "🔒 Закреплено" if task.get("is_locked") else "🔓 Не закреплено"
    scope = task.get("scope")
    period_key = task.get("period_key")
    scope_label = SCOPE_LABELS.get(scope, scope)
    period_title = format_period_title(scope, period_key)

    lines = [
        "📌 Задача",
        f"Название: {title}",
        "Описание:",
        description,
        "",
        f"Статус: {status}",
        f"Замочек: {lock_status}",
        f"Период: {scope_label} / {period_title}",
    ]
    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()
    toggle_text = "✅ Отметить" if not task.get("is_done") else "↩️ Снять отметку"
    lock_text = "🔒 Закрепить" if not task.get("is_locked") else "🔓 Открепить"
    kb.row(
        InlineKeyboardButton(text=toggle_text, callback_data=f"tdg:{task['id']}"),
        InlineKeyboardButton(text=lock_text, callback_data=f"tdlk:{task['id']}"),
    )
    if _is_bible_task(task):
        kb.row(
            InlineKeyboardButton(text="📖 Читать Библию", url="https://t.me/biblereading394_bot")
        )
    kb.row(
        InlineKeyboardButton(text="✏️ Редактировать", callback_data=f"e:{task['id']}"),
        InlineKeyboardButton(text="🗑️ Удалить", callback_data=f"d:{task['id']}"),
    )
    kb.row(InlineKeyboardButton(text="⬅️ Назад", callback_data=f"v:{scope}:{period_key}"))
    if _is_bible_task(task):
        kb.adjust(2, 1, 2, 1)
    else:
        kb.adjust(2, 2, 1)
    return text, kb.as_markup()


def build_lock_select_view(
    tasks: list[dict[str, Any]],
    back_data: str,
) -> tuple[str, InlineKeyboardMarkup]:
    lines = ["🔒 Замочки", "", "Выберите задачу:"]
    if not tasks:
        lines.append("(задач нет)")
    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()
    for task in tasks:
        lock_mark = "🔒" if task.get("is_locked") else "🔓"
        title_text = truncate(task.get("title", ""), 28)
        kb.button(text=f"{lock_mark} {title_text}", callback_data=f"lkc:{task['id']}")
    kb.button(text="⬅️ Назад", callback_data=back_data)
    kb.adjust(1)
    return text, kb.as_markup()


def build_prayer_view(entries: list[dict[str, Any]]) -> tuple[str, InlineKeyboardMarkup]:
    lines = ["🙏 Молитвенный план (по дням недели)", ""]
    for idx, entry in enumerate(entries):
        title = entry.get("title") or "-"
        description = entry.get("description")
        line = f"{WEEKDAYS_RU[idx]}: {title}"
        lines.append(line)
        if description:
            clean_desc = description.replace("\n", " ")
            lines.append(f"    {truncate(clean_desc, 80)}")

    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()
    for idx, short in enumerate(WEEKDAYS_RU_SHORT):
        kb.button(text=short, callback_data=f"pw:{idx}")
    kb.button(text="⬅️ Назад", callback_data="m")
    kb.adjust(4, 3, 1)

    return text, kb.as_markup()


def build_settings_view(user: dict[str, Any]) -> tuple[str, InlineKeyboardMarkup]:
    notify_enabled = bool(user.get("notify_enabled"))
    notify_time = user.get("notify_time") or "06:00"

    status = "вкл" if notify_enabled else "выкл"

    lines = [
        "⚙️ Настройки",
        "",
        f"Уведомления: {status}",
        f"Время: {notify_time}",
    ]

    text = "\n".join(lines)

    kb = InlineKeyboardBuilder()
    kb.button(text="🔔 Вкл/выкл уведомления", callback_data="ntg")
    kb.button(text="⏰ Изменить время", callback_data="nt")
    kb.button(text="📤 Экспорт", callback_data="ex")
    kb.button(text="⬅️ Назад", callback_data="m")
    kb.adjust(2, 2)

    return text, kb.as_markup()


def build_admin_view(users: list[dict[str, Any]]) -> tuple[str, InlineKeyboardMarkup]:
    lines = ["👥 Участники и прогресс", ""]
    if not users:
        lines.append("(пока нет участников)")
    else:
        for user in users:
            display = user.get("display") or str(user.get("user_id"))
            lines.append(display)
            lines.append(
                " | ".join(
                    [
                        f"День {user['progress_day']}",
                        f"Неделя {user['progress_week']}",
                        f"Месяц {user['progress_month']}",
                        f"Год {user['progress_year']}",
                    ]
                )
            )
            lines.append("")
    text = "\n".join(lines).strip()

    kb = InlineKeyboardBuilder()
    kb.button(text="🔄 Обновить", callback_data="adm")
    kb.button(text="⬅️ Назад", callback_data="m")
    kb.adjust(2)

    return text, kb.as_markup()


def build_history_view(lines: list[str]) -> tuple[str, InlineKeyboardMarkup]:
    text_lines = ["📜 История (последние записи)", ""] + (lines or ["(нет записей)"])
    text = "\n".join(text_lines)

    kb = InlineKeyboardBuilder()
    kb.button(text="⬅️ Назад", callback_data="p")
    kb.adjust(1)
    return text, kb.as_markup()


def build_help_view() -> tuple[str, InlineKeyboardMarkup]:
    lines = [
        "ℹ️ Инструкция",
        "",
        "Как пользоваться:",
        "1) Нажмите «📅 Планы» и выберите период (день/неделя/месяц/год).",
        "2) Нажмите на задачу, чтобы открыть карточку с полным описанием.",
        "3) В карточке можно поставить галочку, закрепить, редактировать или удалить.",
        "",
        "Правила планирования:",
        "• День — редактирование только сегодня.",
        "• Неделя — редактирование только в понедельник.",
        "• Месяц — редактирование только 1–2 числа.",
        "• Год — редактирование только в январе (после 2-го — с подтверждением).",
        "",
        "План можно создавать заранее в будущих периодах",
        "(хоть на годы вперед), но в прошлые периоды добавлять нельзя.",
        "Редактирование/удаление — только в разрешенные дни.",
        "",
        "Замочки:",
        "• 🔒 закрепляет задачу и переносит её в следующий период.",
        "• 🔓 снимает закрепление.",
        "",
        "Уведомления:",
        "• По умолчанию приходят в 06:00 (можно изменить в настройках).",
        "",
        "Молитвенный план:",
        "• Заполните нужды по дням недели.",
        "• В дневной план подтягивается нужда на сегодня.",
        "• Если нужда не задана — добавится «Помолиться» (закреплено).",
        "",
        "Библия:",
        "• В задаче «Почитать Библию» есть кнопка перехода к чтению.",
        "",
        "Экспорт:",
        "• Нажмите «📤 Экспорт», чтобы получить Excel-файл.",
    ]
    text = "\n".join(lines)
    kb = InlineKeyboardBuilder()
    kb.button(text="⬅️ Назад", callback_data="m")
    kb.adjust(1)
    return text, kb.as_markup()


def build_simple_prompt(text: str, back_data: str) -> tuple[str, InlineKeyboardMarkup]:
    kb = InlineKeyboardBuilder()
    kb.button(text="✖️ Отмена", callback_data=back_data)
    kb.adjust(1)
    return text, kb.as_markup()


def build_confirm_prompt(text: str, confirm_data: str, cancel_data: str) -> tuple[str, InlineKeyboardMarkup]:
    kb = InlineKeyboardBuilder()
    kb.button(text="✅ Подтвердить", callback_data=confirm_data)
    kb.button(text="✖️ Отмена", callback_data=cancel_data)
    kb.adjust(2)
    return text, kb.as_markup()
