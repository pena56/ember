// Node built-in SQLite driver binding — wraps DatabaseSync (sync) in an async interface.
// Used only in CI/test via the nodeSqliteDriver() factory; never imported by expo-sqlite.
// node:sqlite is experimental in Node 24 and prints a runtime warning — that is expected.

import { DatabaseSync } from 'node:sqlite';

import type { SqliteDriver, SqlValue } from './sqlite-driver.js';

export function nodeSqliteDriver(filename = ':memory:'): SqliteDriver {
  const db = new DatabaseSync(filename);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async close() {
      db.close();
    },
  };
}
