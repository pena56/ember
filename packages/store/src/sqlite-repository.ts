// SQLite-backed Repository implementation using the SqliteDriver port.
// All SQL/JSON logic lives here; the concrete driver (node:sqlite or expo-sqlite)
// is injected via SqliteDriver, keeping this module free of native dependencies.

import type { OutboxEntry } from '@ember/core';

import type { Predicate, RecordBase, Repository } from './repository.js';
import type { SqliteDriver } from './sqlite-driver.js';

/** Row shape returned by SELECT on the records table. */
interface RecordRow {
  record: string;
}

/** Row shape returned by SELECT on the outbox table. */
interface OutboxRow {
  entry: string;
}

/**
 * SQLite-backed `Repository` implementation.
 *
 * @remarks
 * - Records and outbox entries are stored as JSON text and round-tripped through
 *   `JSON.stringify` / `JSON.parse`, which provides value isolation for free
 *   (no `structuredClone` needed — each parse produces a fresh object graph).
 * - Use the static async `create(driver)` factory to construct an instance; the
 *   constructor is private because DDL must run before first use.
 */
export class SqliteRepository implements Repository {
  private closed = false;
  private constructor(private readonly driver: SqliteDriver) {}

  static async create(driver: SqliteDriver): Promise<SqliteRepository> {
    await driver.exec(`
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY, hlc TEXT NOT NULL, entry TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_hlc ON outbox (hlc);
    `);
    return new SqliteRepository(driver);
  }

  async put<T extends RecordBase>(collection: string, record: T): Promise<void> {
    // JSON.stringify on write gives value isolation — the text in the DB is independent
    // of the caller's object. INSERT OR REPLACE is the SQLite upsert idiom.
    await this.driver.run(
      'INSERT OR REPLACE INTO records (collection, id, record) VALUES (?, ?, ?)',
      [collection, record.id, JSON.stringify(record)],
    );
  }

  async get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined> {
    const rows = await this.driver.all<RecordRow>(
      'SELECT record FROM records WHERE collection = ? AND id = ?',
      [collection, id],
    );
    const row = rows[0];
    if (!row) return undefined;
    // JSON.parse produces a fresh object — value isolation on read.
    return JSON.parse(row.record) as T;
  }

  async query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]> {
    const rows = await this.driver.all<RecordRow>(
      'SELECT record FROM records WHERE collection = ?',
      [collection],
    );
    const records = rows.map((row) => JSON.parse(row.record) as T);
    return predicate ? records.filter(predicate) : records;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.driver.run(
      'DELETE FROM records WHERE collection = ? AND id = ?',
      [collection, id],
    );
  }

  async enqueue(entry: OutboxEntry): Promise<void> {
    // Store the hlc column for ORDER BY, and the full entry as JSON text.
    await this.driver.run(
      'INSERT OR REPLACE INTO outbox (id, hlc, entry) VALUES (?, ?, ?)',
      [entry.id, entry.hlc, JSON.stringify(entry)],
    );
  }

  /**
   * Returns all unacked entries sorted HLC-ascending.
   * SQLite's default BINARY collation on TEXT is lexicographic, which equals HLC-ascending
   * because the encoded HLC string is lexicographically sortable (Unit 03a guarantee).
   */
  async unacked(): Promise<OutboxEntry[]> {
    const rows = await this.driver.all<OutboxRow>(
      'SELECT entry FROM outbox ORDER BY hlc ASC',
    );
    return rows.map((row) => JSON.parse(row.entry) as OutboxEntry);
  }

  /** Idempotent: unknown ids are silently ignored by the DELETE. */
  async ack(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.driver.run(
      `DELETE FROM outbox WHERE id IN (${placeholders})`,
      ids,
    );
  }

  /** Release the underlying driver connection. Idempotent — safe to call multiple times. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.driver.close();
  }
}
