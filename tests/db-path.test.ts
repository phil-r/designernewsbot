import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveDatabasePath, schemaDirectory } from '../src/db';

test('Prisma relative filename is anchored to schema directory, including from another CWD', () => {
  expect(resolveDatabasePath('file:./dev.db')).toBe(
    resolve(schemaDirectory, 'dev.db')
  );
  const script = `import { resolveDatabasePath } from ${JSON.stringify(resolve(import.meta.dir, '../src/db.ts'))}; console.log(resolveDatabasePath('file:./dev.db'));`;
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--preload',
      resolve(import.meta.dir, 'fixtures/block-network.ts'),
      '-e',
      script,
    ],
    { cwd: '/tmp', env: { PATH: process.env.PATH ?? '' } }
  );
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString().trim()).toBe(
    resolve(schemaDirectory, 'dev.db')
  );
});
test('absolute filenames and file URLs supported; unknown schemes/options rejected', () => {
  expect(resolveDatabasePath('file:/tmp/synthetic db.sqlite')).toBe(
    '/tmp/synthetic db.sqlite'
  );
  expect(
    resolveDatabasePath(pathToFileURL('/tmp/synthetic db.sqlite').href)
  ).toBe('/tmp/synthetic db.sqlite');
  for (const value of [
    '',
    'sqlite:foo',
    'file:',
    'file::memory:',
    'file:./dev.db?mode=ro',
    'file:./dev.db#x',
    'file://host/tmp/a',
    'file:dev%20db',
    'file:x\0y',
  ])
    expect(() => resolveDatabasePath(value)).toThrow();
});
