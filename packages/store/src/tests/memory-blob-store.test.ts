import { runBlobStoreConformance } from '../blob-store-conformance.js';
import { MemoryBlobStore } from '../memory-blob-store.js';

runBlobStoreConformance('MemoryBlobStore', () => new MemoryBlobStore());
