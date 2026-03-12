# Daily Web

Отдельная веб/PWA-версия `Daily`, вынесенная в отдельную корневую папку и не затрагивающая Flutter-приложение в `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily`.

## Что уже реализовано

- Отдельный React + TypeScript + Vite проект.
- PWA-база: `manifest.webmanifest`, service worker, app icons.
- Локальное хранение состояния в `IndexedDB` через `Dexie`.
- Планы по периодам: день, неделя, месяц, год.
- Создание, редактирование, удаление, выполнение и закрепление задач.
- Напоминания по задачам внутри веб-приложения.
- Молитвенный план по дням недели.
- История действий с разделением по дням.
- Настройки: timezone, утро/вечер, тест уведомления, экспорт/импорт, описание приложения.
- Адаптивный UI под телефон, планшет и десктоп.

## Запуск

```bash
cd Daily_web
npm install
npm run server:dev
```

Во втором терминале:

```bash
cd Daily_web
npm run dev
```

В `dev` фронт работает на `http://localhost:4173`, а push backend на `http://localhost:8787`.

## Production build

```bash
cd Daily_web
npm run build
npm run server:start
```

В production сервер сам раздает `dist` и `api` c одного origin на порту `8787`.

Готовая сборка появляется в `dist/`, после чего отдельный `vite preview` уже не нужен.

## GitHub Pages

Статический фронт можно публиковать на `GitHub Pages`.

Что уже подготовлено:

- workflow: `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/.github/workflows/daily-web-pages.yml`
- автоматический `base path` под `username.github.io/repo`
- SPA fallback через `404.html`
- `.nojekyll` для корректной раздачи Vite-артефактов

Важно:

- `GitHub Pages` поднимет только фронт/PWA из `Daily_web/dist`
- `Web Push backend` и scheduler на Pages не запускаются
- если нужен полный стек с push-уведомлениями, backend нужно держать отдельно на VPS/Render/Railway/Fly.io

После привязки remote и push в `main` останется:

1. открыть `Settings > Pages` в GitHub
2. выбрать `GitHub Actions` как source
3. дождаться первого успешного workflow

## Тесты

```bash
cd Daily_web
npm test
```

## Web Push backend

- Backend лежит в `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/server`
- Health endpoint: `http://localhost:8787/api/health`
- Push config endpoint: `http://localhost:8787/api/push/config`
- Локально VAPID-ключи генерируются автоматически и сохраняются в `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/server/data/push-store.json`
- Для production можно задать собственные ключи через `.env`

Шаблон env:

```bash
cp .env.example .env
```

Если фронт и backend работают на одном production-домене, `VITE_PUSH_API_BASE_URL` не нужен.

Если фронт живет отдельно от backend, задай:

```bash
VITE_PUSH_API_BASE_URL=http://localhost:8787
```

## Docker

Локальный контейнерный запуск:

```bash
cd Daily_web
docker compose up --build
```

После этого приложение и API будут доступны на `http://localhost:8787`.

Файлы:

- `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/Dockerfile`
- `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/docker-compose.yml`

## HTTPS deploy

Для VPS-поднятия через Caddy:

1. Создай `deploy/.env` из `deploy/.env.example`
2. Укажи домен в `DAILY_DOMAIN`
3. При необходимости пропиши свои `PUSH_VAPID_*`
4. Запусти:

```bash
cd Daily_web
cp deploy/.env.example deploy/.env
cd deploy
docker compose -f docker-compose.https.yml up --build -d
```

Файлы:

- `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/deploy/docker-compose.https.yml`
- `/Users/pro/Desktop/ЗАВЕРШЕННЫЕ ПРОЕКТЫ/plan_win_bot/Daily_web/deploy/Caddyfile.example`

В этой схеме:

- `Caddy` поднимает HTTPS автоматически
- `daily-web` обслуживает и PWA, и `/api/push/*`
- фронт и push backend живут на одном домене, что упрощает `Web Push` и установку PWA на телефон

## Основные каталоги

- `src/domain` — модели, периоды, recurring-логика, история, правила задач.
- `src/store` — Zustand store и IndexedDB persistence.
- `src/screens` — экраны `Планы`, `Молитвы`, `История`, `Настройки`.
- `src/services/notifications.ts` — браузерные уведомления и scheduler.
- `public` — логотип, иконки, `manifest.webmanifest`, `sw.js`.
- `docs` — ТЗ, parity и ограничения веб-push.

## Важно про уведомления

Сейчас реализованы браузерные уведомления и локальный scheduler внутри PWA/web-app. Это дает рабочий поток для разрешения, теста и напоминаний, пока приложение активно или живет как PWA в браузерной среде.

Для надежных фоновых уведомлений после полного закрытия браузера нужен backend с `Web Push`, потому что web-платформа не дает native-эквивалент Android scheduler без server push.
