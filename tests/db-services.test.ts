import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join, resolve } from 'node:path';
import { fixture, row } from './fixtures/database';

test('cold service lookups use native SQLite; existing and missing/incompatible DB paths send nothing', () => {
  const f = fixture();
  try {
    for (const repo of Object.values(f.repo)) repo.create({ data: row() });
    const script = `
      import { mock } from 'bun:test';
      import assert from 'node:assert/strict';
      let sends = 0;
      mock.module(${JSON.stringify(import.meta.resolve('axios'))}, () => ({ default: { get: async () => { throw Error('Forbidden feed request'); }, post: async () => { sends++; throw Error('Forbidden send'); } } }));
      const { addDNStory, getDNStoryUrl } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/services/dn.ts'))});
      const { addBehanceProject, getBehanceProjectUrl } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/services/behance.ts'))});
      const { addDribbbleShot, getDribbleShotUrl } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/services/dribbble.ts'))});
      const { closeDatabase } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/db.ts'))});
      const { default: cache } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/cache.ts'))});
      const { story, project, shot } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/feeds.ts'))});
      assert.equal(await getDNStoryUrl(42), 'https://offline.invalid/repeat');
      assert.equal(await getBehanceProjectUrl(42), 'https://offline.invalid/repeat');
      assert.equal(await getDribbleShotUrl(42), 'https://offline.invalid/repeat');
      cache.clear();
      await addDNStory(story); await addBehanceProject(project); await addDribbbleShot(shot);
      assert.equal(sends, 0);
      closeDatabase(); cache.clear();
      process.env.DATABASE_URL = ${JSON.stringify('file:' + join(f.directory, 'missing.sqlite'))};
      await assert.rejects(() => addBehanceProject(project));
      assert.equal(sends, 0);
      process.env.DATABASE_URL = ${JSON.stringify('file:' + join(f.directory, 'incompatible.sqlite'))};
      await assert.rejects(() => addDNStory(story));
      assert.equal(sends, 0);
      closeDatabase();
    `;
    const incompatible = new Database(join(f.directory, 'incompatible.sqlite'));
    incompatible.exec('CREATE TABLE wrong(id INTEGER)');
    incompatible.close();
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--preload',
        resolve(import.meta.dir, 'fixtures/block-network.ts'),
        '-e',
        script,
      ],
      {
        cwd: f.directory,
        env: {
          PATH: process.env.PATH ?? '',
          DATABASE_URL: 'file:' + f.filename,
          NODE_ENV: 'development',
        },
      }
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  } finally {
    f.cleanup();
  }
});
