import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

import {
  createUser,
  getSessionContext,
  loginUser,
  publicUser,
  revokeSession,
} from './auth.mjs';
import { computeDueNotifications, markDelivered } from './logic.mjs';
import { ensureStore, loadStore, saveStore } from './store.mjs';

dotenv.config();

const app = express();
const port = Number(process.env.PUSH_SERVER_PORT || 8787);
const allowedOrigin = process.env.PUSH_ALLOWED_ORIGIN?.trim() || '*';
const publicAppUrl = process.env.DAILY_APP_BASE_URL?.trim() || '';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const distIndex = path.join(distDir, 'index.html');
const canServeStatic = existsSync(distIndex);

app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }));
app.use(express.json({ limit: '5mb' }));

const bootStore = await ensureStore();
webpush.setVapidDetails(bootStore.vapid.subject, bootStore.vapid.publicKey, bootStore.vapid.privateKey);

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim() || null;
}

async function requireAuth(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'auth_required' });
    return null;
  }
  const store = await loadStore();
  const context = getSessionContext(store, token);
  if (!context) {
    res.status(401).json({ ok: false, error: 'invalid_session' });
    return null;
  }
  return { store, token, ...context };
}

function buildAppUrl(tab = 'plans') {
  if (!publicAppUrl) {
    return `/?tab=${encodeURIComponent(tab)}`;
  }
  try {
    const url = new URL(publicAppUrl);
    url.searchParams.set('tab', tab);
    return url.toString();
  } catch {
    return `/?tab=${encodeURIComponent(tab)}`;
  }
}

function extractTab(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return 'plans';
  }
  try {
    const source = rawUrl.startsWith('http') ? new URL(rawUrl) : new URL(rawUrl, 'https://daily.local');
    return source.searchParams.get('tab') || 'plans';
  } catch {
    return 'plans';
  }
}

function withPublicAppUrl(payload) {
  const tab = extractTab(payload?.data?.url);
  return {
    ...payload,
    data: {
      ...(payload?.data || {}),
      url: buildAppUrl(tab),
    },
  };
}

function normalizeDeviceId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'daily-web-cloud',
    now: new Date().toISOString(),
    auth: true,
    push: true,
    static: canServeStatic,
  });
});

app.get('/api/push/config', async (_req, res) => {
  const store = await loadStore();
  res.json({
    enabled: Boolean(store.vapid.publicKey && store.vapid.privateKey),
    publicKey: store.vapid.publicKey,
    subject: store.vapid.subject,
    authRequired: true,
  });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const store = await loadStore();
    const payload = createUser(store, {
      login: req.body?.login,
      password: req.body?.password,
      displayName: req.body?.displayName,
      snapshot: req.body?.snapshot,
      snapshotUpdatedAt: req.body?.snapshotUpdatedAt,
    });
    await saveStore(store);
    return res.json({ ok: true, ...payload });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'signup_failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const store = await loadStore();
    const payload = loginUser(store, {
      login: req.body?.login,
      password: req.body?.password,
      snapshot: req.body?.snapshot,
      snapshotUpdatedAt: req.body?.snapshotUpdatedAt,
    });
    await saveStore(store);
    return res.json({ ok: true, ...payload });
  } catch (error) {
    return res.status(401).json({ ok: false, error: error instanceof Error ? error.message : 'login_failed' });
  }
});

app.get('/api/auth/session', async (req, res) => {
  const context = await requireAuth(req, res);
  if (!context) {
    return;
  }
  await saveStore(context.store);
  return res.json({
    ok: true,
    user: publicUser(context.user),
    snapshot: context.user.snapshot ?? null,
    snapshotUpdatedAt: context.user.snapshotUpdatedAt ?? null,
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.json({ ok: true });
  }
  const store = await loadStore();
  revokeSession(store, token);
  await saveStore(store);
  return res.json({ ok: true });
});

app.put('/api/account/snapshot', async (req, res) => {
  const context = await requireAuth(req, res);
  if (!context) {
    return;
  }
  const snapshot = req.body?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ ok: false, error: 'snapshot_required' });
  }
  context.user.snapshot = snapshot;
  context.user.snapshotUpdatedAt =
    typeof req.body?.snapshotUpdatedAt === 'string' ? req.body.snapshotUpdatedAt : new Date().toISOString();
  context.user.updatedAt = new Date().toISOString();
  await saveStore(context.store);
  return res.json({ ok: true, snapshotUpdatedAt: context.user.snapshotUpdatedAt });
});

app.post('/api/push/sync', async (req, res) => {
  const context = await requireAuth(req, res);
  if (!context) {
    return;
  }

  const deviceId = normalizeDeviceId(req.body?.deviceId);
  const subscription = req.body?.subscription;
  const snapshot = req.body?.snapshot;
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId is required' });
  }
  if (!subscription || typeof subscription.endpoint !== 'string') {
    return res.status(400).json({ ok: false, error: 'subscription is required' });
  }
  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ ok: false, error: 'snapshot is required' });
  }

  context.user.snapshot = snapshot;
  context.user.snapshotUpdatedAt =
    typeof req.body?.snapshotUpdatedAt === 'string' ? req.body.snapshotUpdatedAt : new Date().toISOString();
  context.user.updatedAt = new Date().toISOString();
  context.user.devices ||= {};
  context.user.devices[deviceId] = {
    deviceId,
    subscription,
    updatedAt: new Date().toISOString(),
  };

  await saveStore(context.store);
  return res.json({ ok: true, snapshotUpdatedAt: context.user.snapshotUpdatedAt });
});

app.post('/api/push/test', async (req, res) => {
  const context = await requireAuth(req, res);
  if (!context) {
    return;
  }

  const requestedDeviceId = normalizeDeviceId(req.body?.deviceId);
  const device = requestedDeviceId
    ? context.user.devices?.[requestedDeviceId]
    : Object.values(context.user.devices || {})[0];

  if (!device?.subscription) {
    return res.status(404).json({ ok: false, error: 'device_not_registered' });
  }

  try {
    await webpush.sendNotification(
      device.subscription,
      JSON.stringify(
        withPublicAppUrl({
          title: 'Daily',
          body: 'Тестовое push-уведомление отправлено через сервер Daily Web.',
          tag: `server-test:${Date.now()}`,
          data: { url: '/?tab=settings' },
        }),
      ),
    );
    return res.json({ ok: true });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      delete context.user.devices?.[device.deviceId];
      delete context.store.delivered?.[context.user.id]?.[device.deviceId];
      await saveStore(context.store);
    }
    return res.status(500).json({ ok: false, error: 'push_send_failed' });
  }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const context = await requireAuth(req, res);
  if (!context) {
    return;
  }
  const deviceId = normalizeDeviceId(req.body?.deviceId);
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId is required' });
  }
  delete context.user.devices?.[deviceId];
  delete context.store.delivered?.[context.user.id]?.[deviceId];
  await saveStore(context.store);
  return res.json({ ok: true });
});

if (canServeStatic) {
  app.use(
    express.static(distDir, {
      maxAge: '7d',
      index: false,
    }),
  );

  app.get('*route', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(distIndex);
  });
}

const server = app.listen(port, () => {
  console.log(`[Daily Web Cloud] listening on http://localhost:${port}`);
  console.log(`[Daily Web Cloud] public key: ${bootStore.vapid.publicKey}`);
  if (canServeStatic) {
    console.log(`[Daily Web Cloud] serving dist from ${distDir}`);
  } else {
    console.log('[Daily Web Cloud] dist not found, API-only mode');
  }
});

let schedulerBusy = false;
async function tickScheduler() {
  if (schedulerBusy) {
    return;
  }
  schedulerBusy = true;
  try {
    const store = await loadStore();
    let changed = false;

    for (const [userId, user] of Object.entries(store.users || {})) {
      if (!user?.snapshot || !user?.devices) {
        continue;
      }

      for (const [deviceId, device] of Object.entries(user.devices)) {
        if (!device?.subscription) {
          continue;
        }

        const { notifications, snapshot } = computeDueNotifications(store, userId, deviceId, user.snapshot, new Date());
        user.snapshot = snapshot;
        user.snapshotUpdatedAt = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
        changed = true;

        for (const payload of notifications) {
          try {
            await webpush.sendNotification(device.subscription, JSON.stringify(withPublicAppUrl(payload)));
            markDelivered(store, userId, deviceId, payload.tag, new Date().toISOString());
            changed = true;
          } catch (error) {
            if (error?.statusCode === 404 || error?.statusCode === 410) {
              delete user.devices[deviceId];
              delete store.delivered?.[userId]?.[deviceId];
              changed = true;
              break;
            }
          }
        }
      }
    }

    if (changed) {
      await saveStore(store);
    }
  } finally {
    schedulerBusy = false;
  }
}

const interval = setInterval(() => {
  void tickScheduler();
}, 30000);
void tickScheduler();

function shutdown(signal) {
  clearInterval(interval);
  server.close(() => {
    console.log(`[Daily Web Cloud] stopped by ${signal}`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
