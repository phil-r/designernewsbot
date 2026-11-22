import { Database } from 'bun:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { BUSY_TIMEOUT_MS, validateSchema } from '../src/db';

const name = '20261122172100_gallery_images';

// Explicit operator action only. Use on a consistent test copy first and quiesce
// all database clients before touching the database selected for release.
export function applyGallerySchema(filename: string) {
  if (!statSync(filename).isFile())
    throw new Error('Existing regular database file required');
  const sql = readFileSync(
    new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    'utf8'
  );
  const db = new Database(filename, {
    readwrite: true,
    create: false,
    strict: true,
  });
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.transaction(() => {
      const historyExists = db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'"
        )
        .get();
      if (
        historyExists &&
        db
          .query('SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ?')
          .get(name)
      )
        throw new Error('Gallery migration already recorded in Prisma history');
      validateSchema(db, 'legacy');
      db.exec(sql);
      validateSchema(db, 'gallery');
    }).immediate();
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const [, , direction, filename] = process.argv;
  if (process.argv.length !== 4 || !filename || direction !== 'apply') {
    console.error(
      'usage: bun --no-env-file scripts/gallery-schema.ts apply <existing-database-file>'
    );
    process.exitCode = 1;
  } else {
    try {
      applyGallerySchema(filename);
      console.log('Gallery migration applied.');
    } catch {
      console.error(
        'Gallery schema change failed: check that the selected file exists, has the expected schema, has no active clients or dependent objects, and has no gallery entry in Prisma migration history.'
      );
      process.exitCode = 1;
    }
  }
}
