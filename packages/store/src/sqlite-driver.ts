// SqliteDriver port — the minimal async surface both nodeSqliteDriver and
// expoSqliteDriver satisfy. SqliteRepository depends only on this interface,
// never on a concrete SQLite library.

export type SqlValue = string | number | null;

export interface SqliteDriver {
  /** Run DDL / statements with no bound params (may contain multiple statements). */
  exec(sql: string): Promise<void>;
  /** Run a single write statement with positional params. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Run a SELECT and return rows. */
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Release the underlying connection. */
  close(): Promise<void>;
}
