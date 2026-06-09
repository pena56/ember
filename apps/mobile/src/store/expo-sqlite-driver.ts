// expo-sqlite driver adapter — the ONLY file in this project that imports expo-sqlite.
// Implements the SqliteDriver port from @ember/store over expo-sqlite's async API.
// DEV-ONLY: this file is platform glue; production store wiring lands with entity units (04/07/10).

import { openDatabaseAsync } from 'expo-sqlite';

import type { SqliteDriver } from '@ember/store';

export async function expoSqliteDriver(name = 'ember.db'): Promise<SqliteDriver> {
  const db = await openDatabaseAsync(name);
  return {
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params = []) {
      await db.runAsync(sql, params);
    },
    async all(sql, params = []) {
      return db.getAllAsync(sql, params);
    },
    async close() {
      await db.closeAsync();
    },
  };
}
