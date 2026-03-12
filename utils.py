import datetime as dt
from dataclasses import dataclass

WEEKDAYS_RU = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
]

WEEKDAYS_RU_SHORT = [
    "Пн",
    "Вт",
    "Ср",
    "Чт",
    "Пт",
    "Сб",
    "Вс",
]


@dataclass(frozen=True)
class PeriodContext:
    date: dt.date
    day_key: str
    week_key: str
    month_key: str
    year_key: str


def today_date() -> dt.date:
    return dt.date.today()


def iso_now() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def day_key(d: dt.date) -> str:
    return d.strftime("%Y-%m-%d")


def month_key(d: dt.date) -> str:
    return d.strftime("%Y-%m")


def year_key(d: dt.date) -> str:
    return d.strftime("%Y")


def week_key(d: dt.date) -> str:
    iso_year, iso_week, _ = d.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def period_context_for_date(d: dt.date) -> PeriodContext:
    return PeriodContext(
        date=d,
        day_key=day_key(d),
        week_key=week_key(d),
        month_key=month_key(d),
        year_key=year_key(d),
    )


def parse_day_key(key: str) -> dt.date:
    return dt.datetime.strptime(key, "%Y-%m-%d").date()


def parse_month_key(key: str) -> dt.date:
    return dt.datetime.strptime(key + "-01", "%Y-%m-%d").date()


def parse_year_key(key: str) -> dt.date:
    return dt.datetime.strptime(key + "-01-01", "%Y-%m-%d").date()


def parse_week_key(key: str) -> dt.date:
    # key format: YYYY-Www
    year_str, week_str = key.split("-W")
    year = int(year_str)
    week = int(week_str)
    # ISO week to date (Monday)
    return dt.date.fromisocalendar(year, week, 1)


def context_date_from_period(scope: str, period_key: str) -> dt.date:
    if scope == "day":
        return parse_day_key(period_key)
    if scope == "week":
        return parse_week_key(period_key)
    if scope == "month":
        return parse_month_key(period_key)
    if scope == "year":
        return parse_year_key(period_key)
    return today_date()


def add_period(scope: str, period_key: str, delta: int) -> str:
    if scope == "day":
        d = parse_day_key(period_key) + dt.timedelta(days=delta)
        return day_key(d)
    if scope == "week":
        d = parse_week_key(period_key) + dt.timedelta(weeks=delta)
        return week_key(d)
    if scope == "month":
        d = parse_month_key(period_key)
        month = d.month - 1 + delta
        year = d.year + month // 12
        month = month % 12 + 1
        new_date = dt.date(year, month, 1)
        return month_key(new_date)
    if scope == "year":
        d = parse_year_key(period_key)
        new_date = dt.date(d.year + delta, 1, 1)
        return year_key(new_date)
    return period_key


def format_period_title(scope: str, period_key: str) -> str:
    if scope == "day":
        d = parse_day_key(period_key)
        weekday = WEEKDAYS_RU[d.weekday()]
        return f"{period_key} ({weekday})"
    if scope == "week":
        start = parse_week_key(period_key)
        end = start + dt.timedelta(days=6)
        return f"{period_key} ({start.strftime('%Y-%m-%d')} - {end.strftime('%Y-%m-%d')})"
    if scope == "month":
        d = parse_month_key(period_key)
        return d.strftime("%Y-%m")
    if scope == "year":
        return period_key
    return period_key


def progress_bar(done: int, total: int, width: int = 10) -> str:
    if total <= 0:
        return "[----------] 0% (0/0)"
    ratio = min(max(done / total, 0), 1)
    filled = int(round(ratio * width))
    bar = "#" * filled + "-" * (width - filled)
    percent = int(round(ratio * 100))
    return f"[{bar}] {percent}% ({done}/{total})"


def truncate(text: str, limit: int) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def parse_title_description(text: str) -> tuple[str, str | None]:
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return "", None
    title = lines[0]
    description = "\n".join(lines[1:]).strip() if len(lines) > 1 else None
    if description == "":
        description = None
    return title, description


def normalize_time_text(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    if value.count(":") != 1:
        return None
    hour_str, minute_str = value.split(":")
    if not (hour_str.isdigit() and minute_str.isdigit()):
        return None
    hour = int(hour_str)
    minute = int(minute_str)
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def weekday_index_from_name(name: str) -> int | None:
    name_lower = name.lower().strip()
    for idx, label in enumerate(WEEKDAYS_RU):
        if label.lower() == name_lower:
            return idx
    return None


def current_period_key(scope: str, d: dt.date) -> str:
    if scope == "day":
        return day_key(d)
    if scope == "week":
        return week_key(d)
    if scope == "month":
        return month_key(d)
    if scope == "year":
        return year_key(d)
    return day_key(d)


def period_end_date(scope: str, period_key: str) -> dt.date:
    if scope == "day":
        return parse_day_key(period_key)
    if scope == "week":
        start = parse_week_key(period_key)
        return start + dt.timedelta(days=6)
    if scope == "month":
        start = parse_month_key(period_key)
        month = start.month % 12 + 1
        year = start.year + (1 if month == 1 else 0)
        next_month_start = dt.date(year, month, 1)
        return next_month_start - dt.timedelta(days=1)
    if scope == "year":
        start = parse_year_key(period_key)
        return dt.date(start.year, 12, 31)
    return today_date()


def is_period_over(scope: str, period_key: str, today: dt.date) -> bool:
    return today > period_end_date(scope, period_key)


def is_current_period(scope: str, period_key: str, today: dt.date) -> bool:
    return current_period_key(scope, today) == period_key


def edit_policy(scope: str, period_key: str, today: dt.date) -> str:
    if not is_current_period(scope, period_key, today):
        return "deny"
    if scope == "day":
        return "allow"
    if scope == "week":
        return "allow" if today.weekday() == 0 else "deny"
    if scope == "month":
        return "allow" if today.day in (1, 2) else "deny"
    if scope == "year":
        if today.month != 1:
            return "deny"
        if today.day in (1, 2):
            return "allow"
        return "confirm"
    return "deny"
