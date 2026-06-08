import { runRepositoryConformance } from '../conformance.js';
import { MemoryRepository } from '../memory-repository.js';

runRepositoryConformance('MemoryRepository', async () => new MemoryRepository());
