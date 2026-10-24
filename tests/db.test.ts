import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import {
  BUSY_TIMEOUT_MS,
  createRepositories,
  openExistingDatabase,
  validateSchema,
} from '../src/db';
import { initializeDatabase } from '../scripts/init-db';
import { fixture, row } from './fixtures/database';

for (const name of [
  'designerNewsStory',
  'behanceProject',
  'dribbbleShot',
] as const)
  describe(name, () => {
    test('native writes preserve values, epoch-ms dates, NULLs, ordinary URL duplicates and constraints', () => {
      const f = fixture();
      try {
        const r = f.repo[name];
        expect(r.findUnique({ where: { id: 42 } })).toBeNull();
        r.create({ data: row() });
        r.create({ data: row(43) });
        expect(r.findUnique({ where: { id: 42 } })).toEqual({ url: row().url });
        expect(() => r.create({ data: row() })).toThrow();
        expect(() =>
          r.create({ data: { ...row(44), shortUrl: row().shortUrl } })
        ).toThrow();
        r.create({ data: { ...row(45), telegramMessageId: 5 } });
        expect(() =>
          r.create({ data: { ...row(46), telegramMessageId: 5 } })
        ).toThrow();
        for (const data of [
          { ...row(47), score: 1.2 },
          { ...row(47), id: NaN },
          { ...row(47), id: 2147483648 },
          { ...row(47), title: null },
          { ...row(47), updatedAt: new Date(NaN) },
          { ...row(47), createdAt: 42 },
        ])
          expect(() => r.create({ data: data as any })).toThrow();
        const table = {
          designerNewsStory: 'DesignerNewsStory',
          behanceProject: 'BehanceProject',
          dribbbleShot: 'DribbbleShot',
        }[name];
        const stored = f.db
          .query(
            `SELECT *, typeof(createdAt) AS storage FROM "${table}" WHERE id=42`
          )
          .get() as any;
        expect(stored.title).toBe(row().title);
        expect(stored.message).toBe(row().message);
        expect(stored.telegramMessageId).toBeNull();
        expect(stored.createdAt).toBe(stored.updatedAt);
        expect(stored.storage).toBe('integer');
        r.create({ data: row(1000000) });
        expect(
          (
            f.db
              .query('SELECT seq FROM sqlite_sequence WHERE name = ?')
              .get(table) as any
          ).seq
        ).toBe(1000000);
      } finally {
        f.cleanup();
      }
    });
  });

test('initialization refuses existing destination, missing open never creates, schema drift fails', () => {
  const f = fixture();
  try {
    const before = readFileSync(f.filename);
    expect(() => initializeDatabase(f.filename)).toThrow();
    expect(readFileSync(f.filename)).toEqual(before);
    const missing = join(f.directory, 'missing.sqlite');
    expect(() => openExistingDatabase(missing)).toThrow();
    expect(existsSync(missing)).toBe(false);
    f.db.exec('DROP INDEX BehanceProject_shortUrl_key');
    expect(() => validateSchema(f.db)).toThrow();
    expect(() => openExistingDatabase(f.filename)).toThrow();
    f.db.exec(
      'CREATE UNIQUE INDEX BehanceProject_shortUrl_key ON BehanceProject(shortUrl COLLATE NOCASE)'
    );
    expect(() => validateSchema(f.db)).toThrow();
  } finally {
    f.cleanup();
  }
});

test('required DN comment URL and its unique index are enforced', () => {
  const f = fixture();
  try {
    f.repo.designerNewsStory.create({ data: row() });
    expect(() =>
      f.repo.designerNewsStory.create({
        data: { ...row(43), shortDnUrl: row().shortDnUrl },
      })
    ).toThrow();
    expect(() =>
      f.repo.designerNewsStory.create({
        data: { ...row(44), shortDnUrl: undefined } as any,
      })
    ).toThrow();
  } finally {
    f.cleanup();
  }
});

test('separate connections bound lock waiting and recover without changing journal settings', () => {
  const f = fixture();
  const other = openExistingDatabase(f.filename);
  try {
    const journal = f.db.query('PRAGMA journal_mode').get();
    expect(other.query('PRAGMA busy_timeout').get()).toEqual({
      timeout: BUSY_TIMEOUT_MS,
    });
    f.db.exec('BEGIN IMMEDIATE');
    const start = Date.now();
    expect(() =>
      createRepositories(() => other).behanceProject.create({ data: row() })
    ).toThrow();
    expect(Date.now() - start).toBeGreaterThanOrEqual(BUSY_TIMEOUT_MS - 100);
    expect(Date.now() - start).toBeLessThan(BUSY_TIMEOUT_MS + 2000);
    f.db.exec('ROLLBACK');
    createRepositories(() => other).behanceProject.create({ data: row() });
    expect(other.query('PRAGMA journal_mode').get()).toEqual(journal);
  } finally {
    other.close();
    f.cleanup();
  }
});

test('unexpected CHECK constraint is incompatible even with matching columns', () => {
  const db = new Database(':memory:');
  try {
    const sql = readFileSync(
      new URL(
        '../prisma/migrations/20220813164612_init/migration.sql',
        import.meta.url
      ),
      'utf8'
    );
    db.exec(
      sql.replace(
        '"score" INTEGER NOT NULL',
        '"score" INTEGER NOT NULL CHECK(score >= 0)'
      )
    );
    expect(() => validateSchema(db)).toThrow();
  } finally {
    db.close();
  }
});
