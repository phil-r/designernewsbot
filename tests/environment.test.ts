import { expect, test } from 'bun:test';
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('root-only explicit environment policy, external precedence and channel selection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-env-'));
  try {
    const filename = join(directory, 'synthetic.env');
    writeFileSync(
      filename,
      'TELEGRAM_BOT_TOKEN=fixture-token\nBEHANCE_TOKEN=fixture-key\n'
    );
    writeFileSync(join(directory, '.env.local'), 'NODE_ENV=production\n');
    writeFileSync(join(directory, '.env'), 'NODE_ENV=production\n');
    for (const mode of [undefined, 'development', 'production']) {
      const script = `
        import assert from 'node:assert/strict';
        import { mock } from 'bun:test';
        const { loadEnvironment, projectEnvPath } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/load-environment.ts'))});
        assert.equal(projectEnvPath, ${JSON.stringify(resolve(import.meta.dir, '../.env'))});
        loadEnvironment(${JSON.stringify(filename)});
        assert.equal(process.env.NODE_ENV, ${JSON.stringify(mode)});
        assert.equal(process.env.TELEGRAM_BOT_TOKEN, 'external-token');
        assert.equal(process.env.BEHANCE_TOKEN, 'fixture-key');
        const { TELEGRAM_CHANNEL, development } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/helpers.ts'))});
        assert.equal(development, ${mode !== 'production'});
        assert.equal(TELEGRAM_CHANNEL, ${JSON.stringify(mode === 'production' ? '@designer_news' : '@designer_news_st')});
        let delivered = false;
        const { setFetchFixture } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/network-policy.ts'))});
        setFetchFixture((requestUrl, init) => {
          const url = requestUrl.href;
          assert.equal(init.method, 'POST');
          const data = JSON.parse(init.body);
          assert.equal(url, 'https://api.telegram.org/botexternal-token/sendMessage');
          assert.equal(data.chat_id, TELEGRAM_CHANNEL);
          delivered = true; return Promise.resolve(Response.json({ ok: true }));
        });
        const { sendMessage } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/apis/telegram.ts'))});
        await sendMessage(TELEGRAM_CHANNEL, 'synthetic');
        assert.equal(delivered, true);
        loadEnvironment(${JSON.stringify(join(directory, 'absent.env'))});
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
          cwd: directory,
          env: {
            TELEGRAM_BOT_TOKEN: 'external-token',
            ...(mode ? { NODE_ENV: mode } : {}),
          },
        }
      );
      expect(child.stderr.toString()).toBe('');
      expect(child.exitCode).toBe(0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('actual entrypoint loads synthetic project-root env before modules capture tokens, from another CWD', () => {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-root-env-'));
  try {
    // Copy code only, never the real root env or any ignored/private files.
    cpSync(resolve(import.meta.dir, '../src'), join(directory, 'src'), {
      recursive: true,
    });
    symlinkSync(
      resolve(import.meta.dir, '../node_modules'),
      join(directory, 'node_modules')
    );
    mkdirSync(join(directory, 'elsewhere'));
    writeFileSync(
      join(directory, '.env'),
      'TELEGRAM_BOT_TOKEN=root-fixture-token\nNODE_ENV=production\n'
    );
    writeFileSync(
      join(directory, '.env.local'),
      'TELEGRAM_BOT_TOKEN=wrong-local-token\n'
    );
    writeFileSync(
      join(directory, 'elsewhere/.env'),
      'TELEGRAM_BOT_TOKEN=wrong-cwd-token\n'
    );
    const script = `
      import { mock } from 'bun:test';
      import assert from 'node:assert/strict';
      let delivered = false;
      const { setFetchFixture } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/network-policy.ts'))});
      setFetchFixture((url, init) => {
        assert.equal(url.href, 'https://api.telegram.org/botroot-fixture-token/sendMessage');
        assert.equal(init.method, 'POST');
        assert.equal(JSON.parse(init.body).chat_id, '@designer_news');
        delivered = true; return Promise.resolve(Response.json({ ok: true }));
      });
      await import(${JSON.stringify(join(directory, 'src/index.ts'))});
      const { sendMessage } = await import(${JSON.stringify(join(directory, 'src/apis/telegram.ts'))});
      const { TELEGRAM_CHANNEL } = await import(${JSON.stringify(join(directory, 'src/helpers.ts'))});
      await sendMessage(TELEGRAM_CHANNEL, 'synthetic');
      assert.equal(delivered, true);
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
        cwd: join(directory, 'elsewhere'),
        env: {},
      }
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('documented bun run start/cron/test ignore automatic env files in parent and child', () => {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-run-env-'));
  try {
    for (const file of ['package.json', 'bunfig.toml'])
      cpSync(resolve(import.meta.dir, '..', file), join(directory, file));
    cpSync(resolve(import.meta.dir, '../src'), join(directory, 'src'), {
      recursive: true,
    });
    mkdirSync(join(directory, 'tests/fixtures'), { recursive: true });
    for (const file of [
      'offline.ts',
      'fixtures/network-policy.ts',
      'fixtures/block-network.ts',
    ])
      cpSync(resolve(import.meta.dir, file), join(directory, 'tests', file));
    symlinkSync(
      resolve(import.meta.dir, '../node_modules'),
      join(directory, 'node_modules')
    );
    writeFileSync(
      join(directory, '.env'),
      'ROOT_ONLY=root-value\nTELEGRAM_BOT_TOKEN=root-token\nDATABASE_URL=file:root-only.sqlite\n'
    );
    for (const file of [
      '.env.local',
      '.env.production',
      '.env.production.local',
      '.env.development',
      '.env.test',
    ])
      writeFileSync(
        join(directory, file),
        'AUTOMATIC_ONLY=forbidden\nROOT_ONLY=wrong\nNODE_ENV=wrong\nTELEGRAM_BOT_TOKEN=wrong\nDATABASE_URL=file:wrong.sqlite\n'
      );
    writeFileSync(
      join(directory, 'probe.ts'),
      `
      import './tests/fixtures/block-network';
      import assert from 'node:assert/strict';
      import { mock } from 'bun:test';
      assert.equal(process.env.AUTOMATIC_ONLY, undefined);
      assert.equal(process.env.ROOT_ONLY, undefined);
      if (process.env.TELEGRAM_BOT_TOKEN !== 'offline-test-token') {
        assert.equal(process.env.NODE_ENV, 'production');
        assert.equal(process.env.TELEGRAM_BOT_TOKEN, 'external-token');
      }
      assert.equal(process.env.DATABASE_URL, undefined);
      function verify() {
        assert.equal(process.env.AUTOMATIC_ONLY, undefined);
        assert.equal(process.env.ROOT_ONLY, 'root-value');
        assert.equal(process.env.TELEGRAM_BOT_TOKEN, 'external-token');
        assert.equal(process.env.DATABASE_URL, 'file:root-only.sqlite');
        assert.equal(process.env.NODE_ENV, 'production');
        console.log('environment-verified');
      }
      mock.module('./src/persistence.ts', () => ({ default: {}, getDatabase: verify, closeDatabase() {} }));
      mock.module('./src/http.ts', () => ({ handleRequest: () => new Response('ok') }));
      for (const name of ['dribbble','behance'])
        mock.module('./src/services/' + name + '.ts', () => ({ [name + 'Cron']: async () => {} }));
      Bun.serve = () => ({ port: 8080, stop() {} });
    `
    );
    writeFileSync(
      join(directory, 'tests/probe.test.ts'),
      `
      import { test, expect } from 'bun:test';
      test('script-runner env remains isolated before explicit root loading', async () => {
        expect(process.env.AUTOMATIC_ONLY).toBeUndefined();
        expect(process.env.ROOT_ONLY).toBeUndefined();
        const { loadEnvironment } = await import('../src/load-environment');
        loadEnvironment();
        expect(process.env.ROOT_ONLY).toBe('root-value');
        expect(process.env.TELEGRAM_BOT_TOKEN).toBe('offline-test-token');
        console.log('environment-verified');
      });
    `
    );
    const launch = (command: string) =>
      Bun.spawnSync([process.execPath, 'run', command], {
        cwd: directory,
        env: {
          PATH: `${resolve(process.execPath, '..')}:${process.env.PATH ?? ''}`,
          BUN_OPTIONS: `--preload=${join(directory, 'probe.ts')}`,
          NODE_ENV: 'production',
          TELEGRAM_BOT_TOKEN: 'external-token',
        },
        timeout: 10000,
      });
    for (const command of ['start', 'cron', 'test']) {
      const child = launch(command);
      if (child.exitCode !== 0)
        console.error(
          command,
          child.stdout.toString(),
          child.stderr.toString()
        );
      expect(child.exitCode).toBe(0);
      expect(child.stdout.toString()).toContain('environment-verified');
      expect(child.stderr.toString()).not.toContain('AssertionError');
    }
    // Independently prove the config's runtime effect using synthetic files.
    writeFileSync(
      join(directory, 'runtime-probe.ts'),
      'console.log(process.env.AUTOMATIC_ONLY ?? "disabled")'
    );
    const runtimeProbe = () =>
      Bun.spawnSync(
        [
          process.execPath,
          '--preload',
          join(directory, 'tests/fixtures/block-network.ts'),
          'runtime-probe.ts',
        ],
        { cwd: directory, env: { NODE_ENV: 'production' } }
      );
    expect(runtimeProbe().stdout.toString().trim()).toBe('disabled');
    const config = join(directory, 'bunfig.toml');
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace('env = false', '')
    );
    expect(runtimeProbe().stdout.toString().trim()).toBe('forbidden');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
