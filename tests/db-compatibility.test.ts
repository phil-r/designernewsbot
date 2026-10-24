import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { openExistingDatabase } from '../src/db';
import { verifyDatabaseCopy } from '../scripts/verify-db';
import { fixture, row } from './fixtures/database';

test('startup and read-only verification preserve original rows, mixed timestamps, history, sequence and extra objects', () => {
  const f = fixture();
  try {
    f.db.exec(
      `CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT); INSERT INTO _prisma_migrations VALUES ('synthetic', 'fixture'); CREATE VIEW synthetic_view AS SELECT id FROM BehanceProject; CREATE TRIGGER synthetic_trigger AFTER UPDATE ON BehanceProject BEGIN SELECT 1; END;`
    );
    f.repo.behanceProject.create({ data: row(5000) });
    f.db.exec(
      "UPDATE BehanceProject SET createdAt='2020-01-02 03:04:05', updatedAt=1234567890 WHERE id=5000"
    );
    const before = verifyDatabaseCopy(f.filename);
    const bytes = readFileSync(f.filename);
    const native = openExistingDatabase(f.filename);
    native.close();
    expect(verifyDatabaseCopy(f.filename)).toEqual(before);
    expect(readFileSync(f.filename)).toEqual(bytes);
    expect(before.inventory[1]?.timestamps).toEqual([
      { createdStorage: 'text', updatedStorage: 'integer', count: 1 },
    ]);
    expect(before.inventory[1]?.count).toBe(1);
    expect(before.legacyPrismaComparison).toStartWith('NOT RUN');
  } finally {
    f.cleanup();
  }
});

test('verification inventories missing URLs without repairing them', () => {
  const f = fixture();
  try {
    f.repo.dribbbleShot.create({ data: { ...row(), url: '' } });
    expect(verifyDatabaseCopy(f.filename).inventory[2]?.missingUrls).toBe(1);
    expect(f.repo.dribbbleShot.findUnique({ where: { id: 42 } })).toEqual({
      url: '',
    });
  } finally {
    f.cleanup();
  }
});

test('logical fingerprints retain full 64-bit SQLite integer precision', () => {
  const f = fixture();
  try {
    f.repo.behanceProject.create({ data: row() });
    f.db.exec(
      'UPDATE BehanceProject SET updatedAt=9007199254740992 WHERE id=42'
    );
    const before = verifyDatabaseCopy(f.filename).inventory[1]!.rowsSha256;
    f.db.exec(
      'UPDATE BehanceProject SET updatedAt=9007199254740993 WHERE id=42'
    );
    expect(verifyDatabaseCopy(f.filename).inventory[1]!.rowsSha256).not.toBe(
      before
    );
  } finally {
    f.cleanup();
  }
});
