// Test setup — installs a headless IndexedDB global so Dexie can run under vitest
// without a browser or jsdom environment.
import 'fake-indexeddb/auto';
