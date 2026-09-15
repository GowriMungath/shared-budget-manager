# IndexedDB Persistence

The persistence layer uses Dexie inside `src/infrastructure/persistence/indexeddb`.
Domain modules do not import Dexie, IndexedDB, browser storage APIs, or storage DTOs.

## Versioning

- Dexie database name: `SharedBudgetManagerDB`
- Current database version: `1`
- Current backup schema version: `1`

Future schema changes should add a new Dexie `.version(n).stores(...)` declaration and
an explicit migration step for records that need transformation. Backup/restore changes
should increment `BACKUP_SCHEMA_VERSION` and provide a version-specific parser/migrator
before writing imported data.

## Restore Semantics

MVP restore uses replace-current-database semantics. The backup is fully validated before
any tables are cleared. The replacement write is performed in one Dexie transaction, so a
failed import leaves the previous database contents intact.
