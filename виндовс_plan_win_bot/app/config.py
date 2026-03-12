import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    bot_token: str
    admin_user_id: int | None
    db_path: str


def load_config() -> Config:
    load_dotenv()
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN is not set")

    admin_raw = os.getenv("ADMIN_USER_ID")
    admin_user_id = int(admin_raw) if admin_raw and admin_raw.isdigit() else None

    db_path = os.getenv("DB_PATH", "data/bot.db")

    return Config(bot_token=token, admin_user_id=admin_user_id, db_path=db_path)

