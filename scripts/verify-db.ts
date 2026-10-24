import { createHash } from 'node:crypto';
import {
  columnsFor,
  createRepositories,
  openExistingDatabase,
  tables,
} from '../src/db';

// Preserve full SQLite integer precision in logical fingerprints, and distinguish
// storage classes (e.g. historical timestamp text versus integer milliseconds).
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? { sqliteInteger: v.toString() } : v
  );
const digest = (value: unknown) =>
  createHash('sha256').update(serialize(value)).digest('hex');

// Operator must supply a consistent backup/copy, never the live filename. This
// utility opens readonly, does not initialize, change journal mode, or repair data.
export function verifyDatabaseCopy(filename: string) {
  const db = openExistingDatabase(filename, true);
  try {
    db.exec('PRAGMA query_only = ON');
    return db.transaction(() => {
      const integrity = db.query('PRAGMA integrity_check').all() as Array<{
        integrity_check: string;
      }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
        throw new Error('Database integrity check failed');
      const schema = db
        .query(
          'SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name'
        )
        .all();
      const repository = createRepositories(() => db);
      const repositories = [
        repository.designerNewsStory,
        repository.behanceProject,
        repository.dribbbleShot,
      ];
      const inventory = tables.map((table, i) => {
        const hash = createHash('sha256');
        let count = 0;
        let missingUrls = 0;
        for (const row of db
          .query(
            `SELECT *, ${columnsFor(table)
              .map((column) => `typeof("${column}") AS "__storage_${column}"`)
              .join(',')} FROM "${table}" ORDER BY id`
          )
          .safeIntegers(true)
          .iterate() as Iterable<{ id: bigint; url: string }>) {
          if (
            repositories[i]!.findUnique({ where: { id: Number(row.id) } })
              ?.url !== row.url
          )
            throw new Error(`Lookup disagreement: ${table}`);
          count++;
          if (typeof row.url !== 'string' || row.url.length === 0)
            missingUrls++;
          hash.update(serialize(row) + '\n');
        }
        const timestamps = db
          .query(
            `SELECT typeof(createdAt) AS createdStorage, typeof(updatedAt) AS updatedStorage, count(*) AS count FROM "${table}" GROUP BY 1, 2 ORDER BY 1, 2`
          )
          .all();
        return {
          table,
          count,
          missingUrls,
          timestamps,
          rowsSha256: hash.digest('hex'),
        };
      });
      const historyExists = db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'"
        )
        .get();
      const history = historyExists
        ? db
            .query('SELECT * FROM "_prisma_migrations" ORDER BY id')
            .safeIntegers(true)
            .all()
        : null;
      const sequence = (
        db
          .query('SELECT name, seq FROM sqlite_sequence ORDER BY name')
          .safeIntegers(true)
          .all() as Array<{ name: string; seq: bigint }>
      ).map(({ name, seq }) => ({ name, seq: seq.toString() }));
      return {
        integrity: 'ok',
        schemaSha256: digest(schema),
        schemaObjectCount: schema.length,
        migrationHistorySha256: digest(history),
        sequence,
        journalMode: db.query('PRAGMA journal_mode').get(),
        userVersion: db.query('PRAGMA user_version').get(),
        inventory,
        legacyPrismaComparison:
          'NOT RUN: requires isolated old runtime and separate writable copy',
        productionRehearsal:
          'NOT ESTABLISHED by this report; operator must attest consistent backup provenance',
      };
    })();
  } finally {
    db.close();
  }
}
if (import.meta.main) {
  if (
    process.argv.length !== 4 ||
    process.argv[2] !== '--operator-supplied-copy'
  ) {
    console.error(
      'usage: bun --no-env-file scripts/verify-db.ts --operator-supplied-copy <consistent-backup-copy>'
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        'read-only copy verification (not a production release approval):'
      );
      console.log(
        JSON.stringify(verifyDatabaseCopy(process.argv[3]!), null, 2)
      );
    } catch {
      console.error(
        'verification failed: copy is missing, incompatible, corrupt, or has invalid persisted IDs.'
      );
      process.exitCode = 1;
    }
  }
}
