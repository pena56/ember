// packages/store — Repository interface + platform implementations

export const STORE_VERSION = '0.0.1';

export * from './repository.js';
export * from './memory-repository.js';
export * from './conformance.js';
export * from './dexie-repository.js';
