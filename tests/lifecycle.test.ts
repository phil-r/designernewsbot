import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixture } from './fixtures/database';

const source = (name: string) =>
  resolve(import.meta.dir, '../src', name + '.ts');

test('CLI server, cron and importer reject a missing DB without creating it or leaking its path', () => {
  const f = fixture();
  try {
    const missing = join(f.directory, 'sensitive-missing.sqlite');
    for (const name of ['index', 'cron', 'import']) {
      const child = Bun.spawnSync(
        [
          process.execPath,
          '--no-env-file',
          '--preload',
          resolve(import.meta.dir, 'fixtures/cli-offline.ts'),
          source(name),
        ],
        { cwd: f.directory, env: { DATABASE_URL: 'file:' + missing } }
      );
      expect(child.exitCode).toBe(1);
      expect(child.stderr.toString()).toContain('failed');
      expect(child.stderr.toString()).not.toContain(missing);
      expect(child.stderr.toString()).not.toContain('Offline CLI');
      expect(existsSync(missing)).toBe(false);
    }
  } finally {
    f.cleanup();
  }
});

test('startup precedes listening/feeds and cron closes resources on success and failure', () => {
  const script = `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    let events = [], failOpen = false, failJob = false;
    mock.module(${JSON.stringify(source('environment'))}, () => ({}));
    mock.module(${JSON.stringify(source('persistence'))}, () => ({
      getDatabase: () => { events.push('open'); if (failOpen) throw Error('private path'); },
      closeDatabase: () => events.push('close'), default: {}
    }));
    for (const name of ['dribbble', 'behance', 'dn']) {
      mock.module(${JSON.stringify(resolve(import.meta.dir, '../src/services'))} + '/' + name + '.ts', () => ({
        [name + 'Cron']: async () => { events.push(name); if (failJob) throw Error('private response'); }
      }));
    }
    const { default: cron } = await import(${JSON.stringify(source('cron'))});
    await cron(); assert.deepEqual(events, ['open','dribbble','behance','dn','close']);
    events = []; failJob = true;
    await assert.rejects(cron); assert.deepEqual(events, ['open','dribbble','close']);
    events = []; failOpen = true;
    await assert.rejects(cron); assert.deepEqual(events, ['open','close']);
    mock.module(${JSON.stringify(source('http'))}, () => ({ handleRequest: () => new Response('ok') }));
    Bun.serve = () => { events.push('listen'); throw Error('port in use'); };
    const { startServer } = await import(${JSON.stringify(source('index'))});
    events = []; assert.throws(startServer); assert.deepEqual(events, ['open']);
    events = []; failOpen = false;
    assert.throws(startServer); assert.deepEqual(events, ['open','listen','close']);
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
    { env: {} }
  );
  expect(child.stderr.toString()).toBe('');
  expect(child.exitCode).toBe(0);
});

test('posting batches drain other in-flight sends before surfacing failure', async () => {
  const { settlePosts } = await import('../src/settle-posts');
  let release!: () => void;
  let finished = false;
  const inFlight = new Promise<void>((resolve) => {
    release = resolve;
  });
  const batch = settlePosts([
    Promise.reject(new Error('synthetic insert failure')),
    inFlight,
  ]);
  const outcome = batch.catch(() => {
    finished = true;
  });
  await Bun.sleep(1);
  expect(finished).toBe(false);
  release();
  await outcome;
  expect(finished).toBe(true);
});

test('explicit initializer CLI refuses an existing fixture without leaking its path or changing it', () => {
  const f = fixture();
  try {
    const before = f.db
      .query('SELECT sql FROM sqlite_master ORDER BY name')
      .all();
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--preload',
        resolve(import.meta.dir, 'fixtures/block-network.ts'),
        resolve(import.meta.dir, '../scripts/init-db.ts'),
        f.filename,
      ],
      { env: {} }
    );
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain('initialization failed');
    expect(child.stderr.toString()).not.toContain(f.filename);
    expect(
      f.db.query('SELECT sql FROM sqlite_master ORDER BY name').all()
    ).toEqual(before);
  } finally {
    f.cleanup();
  }
});

test('HTTP CLI serves a synthetic DB and drains on SIGTERM without schema changes', async () => {
  const f = fixture();
  const probe = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('probe'),
  });
  const port = probe.port!;
  await probe.stop(true);
  const before = f.db
    .query('SELECT sql FROM sqlite_master ORDER BY name')
    .all();
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--preload',
      resolve(import.meta.dir, 'fixtures/cli-offline.ts'),
      source('index'),
    ],
    {
      cwd: f.directory,
      env: { DATABASE_URL: 'file:' + f.filename, PORT: String(port) },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const ready = await child.stdout.getReader().read();
    expect(new TextDecoder().decode(ready.value)).toContain('server ready');
    const response = await fetch(`http://127.0.0.1:${port}/yo`);
    expect(response.status).toBe(200);
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe('');
    expect(
      f.db.query('SELECT sql FROM sqlite_master ORDER BY name').all()
    ).toEqual(before);
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await child.exited;
    f.cleanup();
  }
});
