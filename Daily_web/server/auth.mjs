import crypto from 'node:crypto';

const sessionLifetimeMs = 180 * 86400000;

function isoNow() {
  return new Date().toISOString();
}

export function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeDisplayName(login, displayName) {
  const explicit = String(displayName || '').trim();
  if (explicit) {
    return explicit.slice(0, 80);
  }
  return String(login || '').trim().slice(0, 80);
}

export function validateCredentials(login, password) {
  const normalizedLogin = normalizeLogin(login);
  if (normalizedLogin.length < 3) {
    return 'Логин должен быть не короче 3 символов.';
  }
  if (!/^[a-z0-9._-]+$/i.test(normalizedLogin)) {
    return 'Логин может содержать только буквы, цифры, точку, дефис и нижнее подчеркивание.';
  }
  const cleanPassword = String(password || '');
  if (cleanPassword.length < 6) {
    return 'Пароль должен быть не короче 6 символов.';
  }
  return null;
}

export function publicUser(user) {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) {
    return false;
  }
  try {
    const calculated = crypto.scryptSync(password, record.salt, 64);
    const expected = Buffer.from(record.hash, 'hex');
    if (calculated.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(calculated, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueSession(store, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const now = isoNow();
  store.sessions[tokenHash] = {
    tokenHash,
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + sessionLifetimeMs).toISOString(),
  };
  return token;
}

export function pruneExpiredSessions(store) {
  const now = Date.now();
  for (const [tokenHash, session] of Object.entries(store.sessions || {})) {
    if (!session?.expiresAt || Number.isNaN(Date.parse(session.expiresAt))) {
      continue;
    }
    if (Date.parse(session.expiresAt) <= now) {
      delete store.sessions[tokenHash];
    }
  }
}

export function getUserByLogin(store, login) {
  const normalized = normalizeLogin(login);
  return Object.values(store.users || {}).find((user) => user.loginNormalized === normalized) || null;
}

export function getSessionContext(store, token) {
  if (!token) {
    return null;
  }
  pruneExpiredSessions(store);
  const tokenHash = hashSessionToken(token);
  const session = store.sessions?.[tokenHash];
  if (!session) {
    return null;
  }
  const user = store.users?.[session.userId];
  if (!user) {
    delete store.sessions[tokenHash];
    return null;
  }
  session.lastSeenAt = isoNow();
  return { tokenHash, session, user };
}

export function revokeSession(store, token) {
  if (!token) {
    return;
  }
  delete store.sessions?.[hashSessionToken(token)];
}

function normalizeUpdatedAt(value) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return isoNow();
}

export function reconcileSnapshot(user, incomingSnapshot, incomingUpdatedAt) {
  const currentUpdatedAt = normalizeUpdatedAt(user.snapshotUpdatedAt || user.updatedAt || isoNow());
  const nextUpdatedAt = incomingSnapshot ? normalizeUpdatedAt(incomingUpdatedAt) : null;

  if (!user.snapshot && incomingSnapshot) {
    user.snapshot = incomingSnapshot;
    user.snapshotUpdatedAt = nextUpdatedAt;
    user.updatedAt = isoNow();
    return { snapshot: user.snapshot, snapshotUpdatedAt: user.snapshotUpdatedAt, source: 'local' };
  }

  if (!incomingSnapshot) {
    return {
      snapshot: user.snapshot ?? null,
      snapshotUpdatedAt: user.snapshotUpdatedAt ?? currentUpdatedAt,
      source: user.snapshot ? 'server' : 'empty',
    };
  }

  if (!user.snapshot) {
    user.snapshot = incomingSnapshot;
    user.snapshotUpdatedAt = nextUpdatedAt;
    user.updatedAt = isoNow();
    return { snapshot: user.snapshot, snapshotUpdatedAt: user.snapshotUpdatedAt, source: 'local' };
  }

  if ((nextUpdatedAt ? Date.parse(nextUpdatedAt) : 0) >= Date.parse(currentUpdatedAt)) {
    user.snapshot = incomingSnapshot;
    user.snapshotUpdatedAt = nextUpdatedAt;
    user.updatedAt = isoNow();
    return { snapshot: user.snapshot, snapshotUpdatedAt: user.snapshotUpdatedAt, source: 'local' };
  }

  return {
    snapshot: user.snapshot,
    snapshotUpdatedAt: user.snapshotUpdatedAt ?? currentUpdatedAt,
    source: 'server',
  };
}

export function createUser(store, { login, password, displayName, snapshot, snapshotUpdatedAt }) {
  const validationError = validateCredentials(login, password);
  if (validationError) {
    throw new Error(validationError);
  }

  const normalizedLogin = normalizeLogin(login);
  if (getUserByLogin(store, normalizedLogin)) {
    throw new Error('Пользователь с таким логином уже существует.');
  }

  const now = isoNow();
  const id = crypto.randomUUID();
  const user = {
    id,
    login: String(login).trim(),
    loginNormalized: normalizedLogin,
    displayName: normalizeDisplayName(login, displayName),
    password: hashPassword(password),
    snapshot: null,
    snapshotUpdatedAt: null,
    devices: {},
    createdAt: now,
    updatedAt: now,
  };

  store.users[id] = user;
  const resolved = reconcileSnapshot(user, snapshot, snapshotUpdatedAt);
  const token = issueSession(store, id);
  return { token, user: publicUser(user), ...resolved };
}

export function loginUser(store, { login, password, snapshot, snapshotUpdatedAt }) {
  const user = getUserByLogin(store, login);
  if (!user || !verifyPassword(password, user.password)) {
    throw new Error('Неверный логин или пароль.');
  }

  const resolved = reconcileSnapshot(user, snapshot, snapshotUpdatedAt);
  const token = issueSession(store, user.id);
  user.updatedAt = isoNow();
  return { token, user: publicUser(user), ...resolved };
}
