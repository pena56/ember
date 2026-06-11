// packages/store — Repository interface + platform implementations
//
// Public barrel = consumer-facing runtime surface only. Test-only modules are imported by tests
// via their relative paths, NEVER re-exported here, so platform bundlers (Metro) don't pull them:
//   - ./conformance.js            imports `vitest`        (test harness)
//   - ./blob-store-conformance.js imports `vitest`        (test harness)
//   - ./node-sqlite-driver.js     imports `node:sqlite`  (CI binding; not in the RN runtime)

export const STORE_VERSION = '0.0.1';

export * from './repository.js';
export * from './memory-repository.js';
export * from './dexie-repository.js';
export * from './sqlite-driver.js';
export * from './sqlite-repository.js';
export * from './blob-store.js';
export * from './memory-blob-store.js';
export * from './documents.js';
export * from './reading-positions.js';
