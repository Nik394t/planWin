import json
import aiosqlite
from typing import Any

from utils import iso_now

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    notify_time TEXT DEFAULT '06:00',
    notify_enabled INTEGER DEFAULT 1,
    tz_offset_min INTEGER DEFAULT 0,
    last_ui_message_id INTEGER,
    defaults_seeded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    period_key TEXT NOT NULL,
    is_done INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0,
    recurring_id INTEGER,
    source TEXT DEFAULT 'manual',
    created_at TEXT,
    updated_at TEXT,
    done_at TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_scope_period
    ON tasks(user_id, scope, period_key);

CREATE TABLE IF NOT EXISTS day_meta (
    user_id INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    initialized INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, date_key)
);

CREATE TABLE IF NOT EXISTS recurring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recurring_user_scope
    ON recurring_tasks(user_id, scope);

CREATE TABLE IF NOT EXISTS period_meta (
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    period_key TEXT NOT NULL,
    initialized INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, scope, period_key)
);

CREATE TABLE IF NOT EXISTS prayer_plan (
    user_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    updated_at TEXT,
    PRIMARY KEY(user_id, weekday)
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT
);

CREATE TABLE IF NOT EXISTS period_summaries (
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    period_key TEXT NOT NULL,
    finalized_at TEXT NOT NULL,
    done_count INTEGER NOT NULL,
    total_count INTEGER NOT NULL,
    done_titles TEXT,
    undone_titles TEXT,
    PRIMARY KEY(user_id, scope, period_key)
);
"""


def _row_to_dict(row: aiosqlite.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


async def _fetchone(db: aiosqlite.Connection, query: str, params: tuple[Any, ...]) -> aiosqlite.Row | None:
    cursor = await db.execute(query, params)
    row = await cursor.fetchone()
    await cursor.close()
    return row


async def _fetchall(db: aiosqlite.Connection, query: str, params: tuple[Any, ...]) -> list[aiosqlite.Row]:
    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    await cursor.close()
    return rows


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    rows = await cursor.fetchall()
    await cursor.close()
    return any(row[1] == column for row in rows)


async def _maybe_add_column(db: aiosqlite.Connection, table: str, column: str, ddl: str) -> None:
    if await _column_exists(db, table, column):
        return
    await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


async def init_db(db_path: str) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(SCHEMA)
        await _maybe_add_column(db, "users", "defaults_seeded", "INTEGER NOT NULL DEFAULT 0")
        await _maybe_add_column(db, "tasks", "is_locked", "INTEGER NOT NULL DEFAULT 0")
        await _maybe_add_column(db, "tasks", "recurring_id", "INTEGER")
        await db.execute(
            "UPDATE users SET notify_time = '06:00' WHERE notify_time IS NULL OR notify_time = '' OR notify_time = '09:00'"
        )
        await db.commit()


async def upsert_user(db_path: str, user: dict[str, Any]) -> dict[str, Any]:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """
            INSERT INTO users (user_id, username, first_name, last_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                username=excluded.username,
                first_name=excluded.first_name,
                last_name=excluded.last_name,
                updated_at=excluded.updated_at
            """,
            (
                user["user_id"],
                user.get("username"),
                user.get("first_name"),
                user.get("last_name"),
                now,
                now,
            ),
        )
        await db.commit()
        row = await _fetchone(db, "SELECT * FROM users WHERE user_id = ?", (user["user_id"],))
        return _row_to_dict(row) or {}


async def get_user(db_path: str, user_id: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        row = await _fetchone(db, "SELECT * FROM users WHERE user_id = ?", (user_id,))
        return _row_to_dict(row)


async def list_users(db_path: str) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(db, "SELECT * FROM users ORDER BY created_at ASC", ())
        return [dict(row) for row in rows]


async def set_last_ui_message_id(db_path: str, user_id: int, message_id: int | None) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE users SET last_ui_message_id = ?, updated_at = ? WHERE user_id = ?",
            (message_id, now, user_id),
        )
        await db.commit()


async def update_notify_settings(
    db_path: str,
    user_id: int,
    notify_time: str | None = None,
    notify_enabled: int | None = None,
) -> None:
    now = iso_now()
    fields = []
    values: list[Any] = []
    if notify_time is not None:
        fields.append("notify_time = ?")
        values.append(notify_time)
    if notify_enabled is not None:
        fields.append("notify_enabled = ?")
        values.append(notify_enabled)
    if not fields:
        return
    values.extend([now, user_id])
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            f"UPDATE users SET {', '.join(fields)}, updated_at = ? WHERE user_id = ?",
            values,
        )
        await db.commit()


async def set_defaults_seeded(db_path: str, user_id: int, seeded: int = 1) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE users SET defaults_seeded = ?, updated_at = ? WHERE user_id = ?",
            (seeded, now, user_id),
        )
        await db.commit()


async def log_history(db_path: str, user_id: int, action: str, payload: dict[str, Any]) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO history (user_id, ts, action, payload) VALUES (?, ?, ?, ?)",
            (user_id, iso_now(), action, json.dumps(payload, ensure_ascii=False)),
        )
        await db.commit()


async def list_history(db_path: str, user_id: int, limit: int = 20) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(
            db,
            "SELECT * FROM history WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        )
        return [dict(row) for row in rows]


async def list_tasks(
    db_path: str,
    user_id: int,
    scope: str,
    period_key: str,
) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(
            db,
            """
            SELECT id, title, description, is_done, source, is_locked, recurring_id
            FROM tasks
            WHERE user_id = ? AND scope = ? AND period_key = ?
            ORDER BY is_locked DESC, id ASC
            """,
            (user_id, scope, period_key),
        )
        return [dict(row) for row in rows]


async def get_task(db_path: str, task_id: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        row = await _fetchone(db, "SELECT * FROM tasks WHERE id = ?", (task_id,))
        return _row_to_dict(row)


async def create_task(
    db_path: str,
    user_id: int,
    scope: str,
    period_key: str,
    title: str,
    description: str | None,
    source: str = "manual",
    is_locked: int = 0,
    recurring_id: int | None = None,
) -> int:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            """
            INSERT INTO tasks (
                user_id,
                scope,
                title,
                description,
                period_key,
                source,
                is_locked,
                recurring_id,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, scope, title, description, period_key, source, is_locked, recurring_id, now, now),
        )
        await db.commit()
        return cursor.lastrowid


async def update_task(
    db_path: str,
    task_id: int,
    title: str,
    description: str | None,
) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE tasks SET title = ?, description = ?, updated_at = ? WHERE id = ?",
            (title, description, now, task_id),
        )
        await db.commit()


async def update_task_lock(
    db_path: str,
    task_id: int,
    is_locked: int,
    recurring_id: int | None,
) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE tasks SET is_locked = ?, recurring_id = ?, updated_at = ? WHERE id = ?",
            (is_locked, recurring_id, now, task_id),
        )
        await db.commit()


async def update_task_source(db_path: str, task_id: int, source: str) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE tasks SET source = ?, updated_at = ? WHERE id = ?",
            (source, now, task_id),
        )
        await db.commit()


async def list_recurring_tasks(db_path: str, user_id: int, scope: str) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(
            db,
            "SELECT id, title, description FROM recurring_tasks WHERE user_id = ? AND scope = ? ORDER BY id ASC",
            (user_id, scope),
        )
        return [dict(row) for row in rows]


async def get_recurring_task(db_path: str, recurring_id: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        row = await _fetchone(db, "SELECT * FROM recurring_tasks WHERE id = ?", (recurring_id,))
        return _row_to_dict(row)


async def create_recurring_task(
    db_path: str,
    user_id: int,
    scope: str,
    title: str,
    description: str | None,
) -> int:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            """
            INSERT INTO recurring_tasks (user_id, scope, title, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, scope, title, description, now, now),
        )
        await db.commit()
        return cursor.lastrowid


async def update_recurring_task(
    db_path: str,
    recurring_id: int,
    title: str,
    description: str | None,
) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE recurring_tasks SET title = ?, description = ?, updated_at = ? WHERE id = ?",
            (title, description, now, recurring_id),
        )
        await db.commit()


async def delete_recurring_task(db_path: str, recurring_id: int) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute("DELETE FROM recurring_tasks WHERE id = ?", (recurring_id,))
        await db.commit()


async def delete_task(db_path: str, task_id: int) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()


async def toggle_task_done(db_path: str, task_id: int, is_done: int) -> None:
    now = iso_now()
    async with aiosqlite.connect(db_path) as db:
        done_at = now if is_done else None
        await db.execute(
            "UPDATE tasks SET is_done = ?, done_at = ?, updated_at = ? WHERE id = ?",
            (is_done, done_at, now, task_id),
        )
        await db.commit()


async def get_progress(
    db_path: str,
    user_id: int,
    scope: str,
    period_key: str,
) -> tuple[int, int]:
    async with aiosqlite.connect(db_path) as db:
        row = await _fetchone(
            db,
            """
            SELECT COUNT(*) AS total, COALESCE(SUM(is_done), 0) AS done
            FROM tasks
            WHERE user_id = ? AND scope = ? AND period_key = ?
            """,
            (user_id, scope, period_key),
        )
        total = row[0] if row else 0
        done = row[1] if row else 0
        return done, total


async def ensure_prayer_rows(db_path: str, user_id: int) -> None:
    async with aiosqlite.connect(db_path) as db:
        for weekday in range(7):
            await db.execute(
                """
                INSERT INTO prayer_plan (user_id, weekday, title, description, updated_at)
                VALUES (?, ?, NULL, NULL, ?)
                ON CONFLICT(user_id, weekday) DO NOTHING
                """,
                (user_id, weekday, iso_now()),
            )
        await db.commit()


async def list_prayer_plan(db_path: str, user_id: int) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(
            db,
            "SELECT * FROM prayer_plan WHERE user_id = ? ORDER BY weekday ASC",
            (user_id,),
        )
        return [dict(row) for row in rows]


async def set_prayer_entry(
    db_path: str,
    user_id: int,
    weekday: int,
    title: str | None,
    description: str | None,
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            INSERT INTO prayer_plan (user_id, weekday, title, description, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, weekday) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (user_id, weekday, title, description, iso_now()),
        )
        await db.commit()


async def get_prayer_entry(db_path: str, user_id: int, weekday: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        row = await _fetchone(
            db,
            "SELECT * FROM prayer_plan WHERE user_id = ? AND weekday = ?",
            (user_id, weekday),
        )
        return _row_to_dict(row)


async def is_period_initialized(db_path: str, user_id: int, scope: str, period_key: str) -> bool:
    async with aiosqlite.connect(db_path) as db:
        row = await _fetchone(
            db,
            "SELECT initialized FROM period_meta WHERE user_id = ? AND scope = ? AND period_key = ?",
            (user_id, scope, period_key),
        )
        return bool(row and row[0])


async def mark_period_initialized(db_path: str, user_id: int, scope: str, period_key: str) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            INSERT INTO period_meta (user_id, scope, period_key, initialized)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id, scope, period_key) DO UPDATE SET initialized = 1
            """,
            (user_id, scope, period_key),
        )
        await db.commit()


async def is_period_finalized(db_path: str, user_id: int, scope: str, period_key: str) -> bool:
    async with aiosqlite.connect(db_path) as db:
        row = await _fetchone(
            db,
            "SELECT 1 FROM period_summaries WHERE user_id = ? AND scope = ? AND period_key = ?",
            (user_id, scope, period_key),
        )
        return bool(row)


async def list_unfinalized_periods(db_path: str, user_id: int, scope: str) -> list[str]:
    async with aiosqlite.connect(db_path) as db:
        rows = await _fetchall(
            db,
            """
            SELECT DISTINCT period_key
            FROM tasks
            WHERE user_id = ? AND scope = ?
              AND period_key NOT IN (
                SELECT period_key FROM period_summaries WHERE user_id = ? AND scope = ?
              )
            """,
            (user_id, scope, user_id, scope),
        )
        return [row[0] for row in rows]


async def create_period_summary(
    db_path: str,
    user_id: int,
    scope: str,
    period_key: str,
    done_count: int,
    total_count: int,
    done_titles: list[str],
    undone_titles: list[str],
) -> None:
    payload_done = json.dumps(done_titles, ensure_ascii=False)
    payload_undone = json.dumps(undone_titles, ensure_ascii=False)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            INSERT INTO period_summaries (
                user_id,
                scope,
                period_key,
                finalized_at,
                done_count,
                total_count,
                done_titles,
                undone_titles
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, scope, period_key) DO NOTHING
            """,
            (
                user_id,
                scope,
                period_key,
                iso_now(),
                done_count,
                total_count,
                payload_done,
                payload_undone,
            ),
        )
        await db.commit()


async def list_period_summaries(db_path: str, user_id: int) -> list[dict[str, Any]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        rows = await _fetchall(
            db,
            """
            SELECT scope, period_key, finalized_at, done_count, total_count, done_titles, undone_titles
            FROM period_summaries
            WHERE user_id = ?
            ORDER BY finalized_at ASC
            """,
            (user_id,),
        )
        return [dict(row) for row in rows]


async def is_day_initialized(db_path: str, user_id: int, date_key: str) -> bool:
    async with aiosqlite.connect(db_path) as db:
        row = await _fetchone(
            db,
            "SELECT initialized FROM day_meta WHERE user_id = ? AND date_key = ?",
            (user_id, date_key),
        )
        return bool(row and row[0])


async def mark_day_initialized(db_path: str, user_id: int, date_key: str) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            INSERT INTO day_meta (user_id, date_key, initialized)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, date_key) DO UPDATE SET initialized = 1
            """,
            (user_id, date_key),
        )
        await db.commit()
