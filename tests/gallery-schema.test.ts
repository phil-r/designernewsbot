import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGallerySchema } from '../scripts/gallery-schema';
import { verifyDatabaseCopy } from '../scripts/verify-db';
import {
  columnsFor,
  createRepositories,
  openExistingDatabase,
  tables,
  validateSchema,
} from '../src/db';
import { row } from './fixtures/database';

const legacySql = readFileSync(
  new URL(
    '../prisma/migrations/20220813164612_init/migration.sql',
    import.meta.url
  ),
  'utf8'
);

function retainedState(db: Database) {
  return {
    rows: tables.map((table) =>
      db
        .query(
          `SELECT ${columnsFor(table, 'legacy').join(', ')} FROM "${table}" ORDER BY id`
        )
        .safeIntegers(true)
        .all()
    ),
    sequence: db.query('SELECT * FROM sqlite_sequence ORDER BY name').all(),
    otherObjects: db
      .query(
        `SELECT * FROM sqlite_master WHERE name NOT IN (
      'BehanceProject', 'DribbbleShot', 'BehanceProject_gallery_idx', 'DribbbleShot_gallery_idx'
    ) ORDER BY name`
      )
      .all(),
    history: db.query('SELECT * FROM _prisma_migrations').all(),
  };
}

test('gallery migration preserves legacy data and accepts new thumbnails on a backup copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-schema-'));
  const legacy = join(dir, 'legacy.sqlite');
  const copy = join(dir, 'working.sqlite');
  try {
    const before = (() => {
      const db = new Database(legacy);
      try {
        db.exec(legacySql);
        db.exec(`CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT);
          INSERT INTO _prisma_migrations VALUES ('synthetic', '20220813164612_init');
          CREATE VIEW synthetic_view AS SELECT id FROM DribbbleShot;
          CREATE TRIGGER synthetic_trigger AFTER UPDATE ON BehanceProject BEGIN SELECT 1; END;`);
        for (const table of tables) {
          const commentColumn =
            table === 'DesignerNewsStory' ? ', shortDnUrl' : '';
          const commentValue = commentColumn
            ? ", 'https://old.invalid/comments'"
            : '';
          db.exec(`INSERT INTO "${table}" (id, title, message, url, shortUrl, score, telegramMessageId, createdAt, updatedAt${commentColumn})
            VALUES (42, 'old', 'legacy', 'https://old.invalid/${table}', 'https://short.invalid/42', 3, 12, '2020-01-02 03:04:05', 9007199254740993${commentValue})`);
        }
        return retainedState(db);
      } finally {
        db.close();
      }
    })();
    copyFileSync(legacy, copy);
    applyGallerySchema(copy);
    expect(verifyDatabaseCopy(copy).integrity).toBe('ok');
    const db = openExistingDatabase(copy);
    try {
      expect(retainedState(db)).toEqual(before);
      const repositories = createRepositories(() => db);
      for (const repository of [
        repositories.behanceProject,
        repositories.dribbbleShot,
      ])
        repository.create({
          data: {
            ...row(73),
            url: 'https://new.invalid/post',
            telegramMessageId: 99,
            imageUrl: 'https://new.invalid/thumbnail.jpg',
          },
        });
      for (const table of ['BehanceProject', 'DribbbleShot']) {
        expect(
          db.query(`SELECT imageUrl FROM "${table}" ORDER BY id`).all()
        ).toEqual([
          { imageUrl: null },
          { imageUrl: 'https://new.invalid/thumbnail.jpg' },
        ]);
      }
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration is atomic on a late index conflict and respects Prisma history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-schema-'));
  const filename = join(dir, 'legacy.sqlite');
  const db = new Database(filename);
  try {
    db.exec(legacySql);
    db.exec('CREATE INDEX DribbbleShot_gallery_idx ON DribbbleShot(title)');
    expect(() => applyGallerySchema(filename)).toThrow('already exists');
    validateSchema(db, 'legacy');
    db.exec(`DROP INDEX DribbbleShot_gallery_idx;
      CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT);
      INSERT INTO _prisma_migrations VALUES ('synthetic', '20261122172100_gallery_images');`);
    const before = retainedState(db);
    expect(() => applyGallerySchema(filename)).toThrow('Prisma history');
    validateSchema(db, 'legacy');
    expect(retainedState(db)).toEqual(before);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
