import { runRepositoryConformance } from '../conformance.js';
import { DexieRepository } from '../dexie-repository.js';

// Unique db name per repo call guarantees IndexedDB state isolation across tests.
runRepositoryConformance(
  'DexieRepository',
  async () => new DexieRepository(`ember-test-${crypto.randomUUID()}`),
);
