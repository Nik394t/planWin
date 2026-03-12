import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const storePath = path.join(dataDir, 'push-store.json');

function defaultStore() {
  return {
    vapid: {
      publicKey: '',
      privateKey: '',
      subject: 'mailto:daily@example.local',
    },
    devices: {},
    delivered: {},
  };
}

function mergeStore(parsed) {
  const fallback = defaultStore();
  return {
    ...fallback,
    ...(parsed ?? {}),
    vapid: {
      ...fallback.vapid,
      ...(parsed?.vapid ?? {}),
    },
    devices: parsed?.devices ?? {},
    delivered: parsed?.delivered ?? {},
  };
}

export async function ensureStore() {
  await mkdir(dataDir, { recursive: true });

  let store = defaultStore();
  try {
    const content = await readFile(storePath, 'utf8');
    store = mergeStore(JSON.parse(content));
  } catch {
    store = defaultStore();
  }

  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.PUSH_VAPID_SUBJECT?.trim() || store.vapid.subject;

  if (publicKey && privateKey) {
    store.vapid = { publicKey, privateKey, subject };
  } else if (!store.vapid.publicKey || !store.vapid.privateKey) {
    const generated = webpush.generateVAPIDKeys();
    store.vapid = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    };
  } else {
    store.vapid.subject = subject;
  }

  await saveStore(store);
  return store;
}

export async function loadStore() {
  const store = await ensureStore();
  return store;
}

export async function saveStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}
