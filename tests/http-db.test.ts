import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { fixture, row } from './fixtures/database';

test('native HTTP resolves cold short links for legacy rows in migrated SQLite fixtures', () => {
  const f = fixture();
  try {
    for (const repo of Object.values(f.repo)) repo.create({ data: row() });
    // A separate process avoids the characterization suite's persistence mock.
    const script = `
      import { mock } from 'bun:test';
      import assert from 'node:assert/strict';
      mock.module('dotenv/config', () => ({}));
      mock.module('dotenv', () => ({ default: { config: () => ({}) } }));
      const { handleRequest } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/http.ts'))});
      const { closeDatabase } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/db.ts'))});
      const { encode } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/shortener.ts'))});
      try {
        for (const prefix of ['s', 'b', 'd']) {
          const response = await handleRequest(new Request('http://localhost/' + prefix.toUpperCase() + '/L/?ignored=1'));
          assert.equal(response.status, 302);
          assert.equal(response.headers.get('location'), 'https://offline.invalid/repeat');
          const head = await handleRequest(new Request('http://localhost/' + prefix + '/L', { method: 'HEAD' }));
          assert.equal(head.status, 302);
          assert.equal(await head.text(), '');
          const missing = await handleRequest(new Request('http://localhost/' + prefix + '/Y'));
          assert.equal(missing.status, 503);
          assert.equal(missing.headers.get('retry-after'), '5');
        }
        for (const prefix of ['s', 'b', 'c', 'd']) {
          for (const method of ['GET', 'HEAD']) {
            const oversized = await handleRequest(new Request('http://localhost/' + prefix + '/' + encode(2147483648), { method }));
            assert.equal(oversized.status, 400);
            assert.equal(await oversized.text(), method === 'HEAD' ? '' : 'Malformed request');
          }
        }
        const comments = await handleRequest(new Request('http://localhost/c/L'));
        assert.equal(comments.status, 302);
        assert.equal(comments.headers.get('location'), 'https://www.designernews.co/stories/42');
      } finally { closeDatabase(); }
    `;
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
