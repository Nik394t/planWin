# Запуск на сервере через Docker Compose (Windows)

## 1) Подготовка
1. Установите Docker Desktop.
2. Скопируйте папку `виндовс_plan_win_bot` на сервер.
3. Убедитесь, что файл `.env` находится рядом с `docker-compose.yml`.

## 2) Перенос данных
Данные хранятся в `./data/bot.db` (volume монтируется в контейнер как `/data/bot.db`).

Если у вас уже есть данные:
- Скопируйте ваш файл `bot.db` в `виндовс_plan_win_bot/data/bot.db`.

Если данные лежат в Docker volume:
1. Остановите старый контейнер.
2. Узнайте имя volume: `docker volume ls`.
3. Скопируйте БД в локальную папку:

```
docker run --rm -v <OLD_VOLUME>:/data -v "%cd%\data":/backup busybox cp /data/bot.db /backup/
```

## 3) Сборка и запуск (без кеша)
Из папки `виндовс_plan_win_bot`:

```
docker compose build --no-cache
```

```
docker compose up -d --force-recreate
```

## 4) Обновление
Для обновления кода:

```
docker compose down
```

```
docker compose build --no-cache
```

```
docker compose up -d --force-recreate
```

## 5) Логи

```
docker compose logs -f
```

## Примечание
- Данные пользователя сохраняются в `./data/bot.db` и не удаляются при пересборке контейнера.
- Не используйте `docker compose down -v` и не удаляйте папку `data`, чтобы не потерять историю.
- Экспорт Excel будет сохраняться в `./exports`.
- Если Telegram API недоступен, настройте прокси и добавьте его в `.env` (по запросу добавлю поддержку).
