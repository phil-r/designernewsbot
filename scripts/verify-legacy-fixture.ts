import { resolve } from 'node:path';
import { fixture, row } from '../tests/fixtures/database';
import { tables } from '../src/db';

// Optional old-client probe. All database filenames are created here; the caller
// supplies only an isolated generated Prisma 4.11 client and compatible Node.
export function verifyLegacyFixture(
  clientDirectory: string,
  nodeExecutable = 'node'
): void {
  const f = fixture();
  try {
    for (const repository of Object.values(f.repo)) {
      repository.create({ data: row() });
      const data = {
        ...row(43),
        createdAt: new Date(1234567890123),
        updatedAt: new Date(1234567890456),
      };
      repository.upsert({ where: { id: 43 }, create: data, update: data });
    }
    const result = Bun.spawnSync(
      [
        nodeExecutable,
        resolve(
          import.meta.dir,
          '../tests/fixtures/legacy-prisma-roundtrip.cjs'
        ),
        resolve(clientDirectory),
        f.filename,
      ],
      {
        cwd: f.directory,
        env: { PATH: process.env.PATH ?? '', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    if (result.exitCode !== 0)
      throw new Error('Isolated legacy client failed synthetic roundtrip');
    const repositories = Object.values(f.repo);
    for (const [i, table] of tables.entries()) {
      if (
        repositories[i]!.findUnique({ where: { id: 44 } })?.url !==
        'https://offline.invalid/old'
      )
        throw new Error('Native lookup of legacy fixture failed');
      const stored = f.db
        .query(
          `SELECT createdAt, updatedAt, typeof(createdAt) AS storage FROM "${table}" WHERE id=44`
        )
        .get() as { createdAt: number; updatedAt: number; storage: string };
      if (
        stored.createdAt !== 1234567890789 ||
        stored.updatedAt !== 1234567890999 ||
        stored.storage !== 'integer'
      )
        throw new Error('Legacy timestamp encoding disagrees');
    }
  } finally {
    f.cleanup();
  }
}
if (import.meta.main) {
  if (!process.argv[2])
    throw new Error(
      'Supply isolated generated Prisma client directory (and optionally a Node executable)'
    );
  verifyLegacyFixture(process.argv[2], process.argv[3]);
  console.log(
    'synthetic Prisma/Bun roundtrip passed for all three tables; real-copy rehearsal remains unverified.'
  );
}
