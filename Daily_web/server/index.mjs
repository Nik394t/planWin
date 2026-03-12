import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

import { computeDueNotifications, markDelivered } from './logic.mjs';
import { ensureStore, loadStore, saveStore } from './store.mjs';

dotenv.config();

const app = express();
const port = Number(process.env.PUSH_SERVER_PORT || 8787);
const allowedOrigin = process.env.PUSH_ALLOWED_ORIGIN?.trim() || '*';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const distIndex = path.join(distDir, 'index.html');
const canServeStatic = existsSync(distIndex);

app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }));
app.use(express.json({ limit: '2mb' }));

const bootStore = await ensureStore();
webpush.setVapidDetails(bootStore.vapid.subject, bootStore.vapid.publicKey, bootStore.vapid.privateKey);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'daily-web-push', now: new Date().toISOString() });
});

app.get('/api/push/config', async (_req, res) => {
  const store = await loadStore();
  res.json({
    enabled: Boolean(store.vapid.publicKey && store.vapid.privateKey),
    publicKey: store.vapid.publicKey,
    subject: store.vapid.subject,
  });
});

app.post('/api/push/sync', async (req, res) => {
  const { deviceId, subscription, snapshot } = req.body ?? {};
  if (typeof deviceId !== 'string' || !deviceId.trim()) {
    return res.status(400).json({ ok: false, error: 'deviceId is required' });
  }
  if (!subscription || typeof subscription.endpoint !== 'string') {
    return res.status(400).json({ ok: false, error: 'subscription is required' });
  }
  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ ok: false, error: 'snapshot is required' });
  }

  const store = await loadStore();
  store.devices[deviceId] = {
    deviceId,
    subscription,
    snapshot,
    updatedAt: new Date().toISOString(),
  };
  await saveStore(store);

  return res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  const { deviceId } = req.body ?? {};
  if (typeof deviceId !== 'string' || !deviceId.trim()) {
    return res.status(400).json({ ok: false, error: 'deviceId is required' });
  }

  const store = await loadStore();
  const device = store.devices[deviceId];
  if (!device?.subscription) {
    return res.status(404).json({ ok: false, error: 'device not registered' });
  }

  try {
    await webpush.sendNotification(
      device.subscription,
      JSON.stringify({
        title: 'Daily',
        body: 'Тестовое push-уведомление отправлено через сервер Daily Web.',
        tag: `server-test:${Date.now()}`,
        data: { url: '/?tab=settings' },
      }),
    );
    return res.json({ ok: true });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      delete store.devices[deviceId];
      await saveStore(store);
    }
    return res.status(500).json({ ok: false, error: 'push send failed' });
  }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const { deviceId } = req.body ?? {};
  if (typeof deviceId !== 'string' || !deviceId.trim()) {
    return res.status(400).json({ ok: false, error: 'deviceId is required' });
  }
  const store = await loadStore();
  delete store.devices[deviceId];
  delete store.delivered[deviceId];
  await saveStore(store);
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
  console.log(`[Daily Web Push] listening on http://localhost:${port}`);
  console.log(`[Daily Web Push] public key: ${bootStore.vapid.publicKey}`);
  if (canServeStatic) {
    console.log(`[Daily Web Push] serving dist from ${distDir}`);
  } else {
    console.log('[Daily Web Push] dist not found, API-only mode');
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

    for (const [deviceId, device] of Object.entries(store.devices)) {
      if (!device?.subscription || !device?.snapshot) {
        continue;
      }
      const { notifications, snapshot } = computeDueNotifications(store, deviceId, device.snapshot, new Date());
      device.snapshot = snapshot;
      changed = true;

      for (const payload of notifications) {
        try {
          await webpush.sendNotification(device.subscription, JSON.stringify(payload));
          markDelivered(store, deviceId, payload.tag, new Date().toISOString());
          changed = true;
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            delete store.devices[deviceId];
            delete store.delivered[deviceId];
            changed = true;
            break;
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
    console.log(`[Daily Web Push] stopped by ${signal}`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
