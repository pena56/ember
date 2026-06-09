import { runRepositoryConformance } from '../conformance.js';
import { nodeSqliteDriver } from '../node-sqlite-driver.js';
import { SqliteRepository } from '../sqlite-repository.js';

runRepositoryConformance('SqliteRepository', () =>
  SqliteRepository.create(nodeSqliteDriver()), // fresh :memory: db per repo
);
