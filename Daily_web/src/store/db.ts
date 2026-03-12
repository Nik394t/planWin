import Dexie, { type Table } from 'dexie';

import type { DailySnapshot } from '../domain/types';

interface SnapshotRecord {
  id: string;
  payload: DailySnapshot;
  updatedAt: string;
}

class DailyWebDb extends Dexie {
  snapshots!: Table<SnapshotRecord, string>;

  constructor() {
    super('daily-web-db');
    this.version(1).stores({
      snapshots: 'id, updatedAt',
    });
  }
}

const db = new DailyWebDb();
const snapshotId = 'app-state';

export async function loadSnapshot(): Promise<DailySnapshot | null> {
  const record = await db.snapshots.get(snapshotId);
  return record?.payload ?? null;
}

export async function saveSnapshot(payload: DailySnapshot): Promise<void> {
  await db.snapshots.put({
    id: snapshotId,
    payload,
    updatedAt: new Date().toISOString(),
  });
}
