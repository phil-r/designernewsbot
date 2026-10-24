import { expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

test('native staged formatter formats the index without staging partial worktree edits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-index-'));
  const run = (...command: string[]) =>
    Bun.spawnSync(command, { cwd: directory });
  try {
    expect(run('git', 'init', '--quiet').exitCode).toBe(0);
    writeFileSync(
      join(directory, 'bunfig.toml'),
      '[fmt]\nsingleQuote = true\ntrailingComma = "es5"\n'
    );
    writeFileSync(join(directory, 'full.ts'), 'const full="staged"\n');
    writeFileSync(join(directory, 'partial.ts'), 'const partial="staged"\n');
    expect(run('git', 'add', 'full.ts', 'partial.ts').exitCode).toBe(0);
    writeFileSync(
      join(directory, 'partial.ts'),
      'const partial="staged"\nconst secretUnstaged="keep me"\n'
    );
    const result = run(process.execPath, '--no-env-file', 'fmt', '--staged');
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain(
      'both staged and unstaged changes'
    );
    expect(run('git', 'show', ':full.ts').stdout.toString()).toBe(
      "const full = 'staged';\n"
    );
    expect(run('git', 'show', ':partial.ts').stdout.toString()).toBe(
      'const partial="staged"\n'
    );
    expect(readFileSync(join(directory, 'partial.ts'), 'utf8')).toContain(
      'secretUnstaged'
    );
    expect(run('git', 'diff', '--', 'partial.ts').stdout.toString()).toContain(
      'secretUnstaged'
    );
    expect(run('git', 'diff', '--cached').stdout.toString()).not.toContain(
      'secretUnstaged'
    );
    expect(run('git', 'add', 'partial.ts').exitCode).toBe(0);
    expect(
      run(process.execPath, '--no-env-file', 'fmt', '--staged').exitCode
    ).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Husky prepare installs a Git hook that preserves partial-index safety', () => {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-husky-'));
  const env = {
    ...process.env,
    HOME: directory,
    XDG_CONFIG_HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    HUSKY: '',
    PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
  };
  const run = (...command: string[]) =>
    Bun.spawnSync(command, { cwd: directory, env });
  try {
    expect(run('git', 'init', '--quiet', '--template=').exitCode).toBe(0);
    mkdirSync(join(directory, '.husky'));
    writeFileSync(
      join(directory, '.husky/pre-commit'),
      readFileSync(new URL('../.husky/pre-commit', import.meta.url))
    );
    const { scripts } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ scripts: { prepare: scripts.prepare } })
    );
    symlinkSync(
      new URL('../node_modules', import.meta.url).pathname,
      join(directory, 'node_modules'),
      'dir'
    );
    const prepare = run(process.execPath, '--no-env-file', 'run', 'prepare');
    expect(prepare.exitCode).toBe(0);
    expect(prepare.stderr.toString()).not.toContain('DEPRECATED');
    expect(
      run('git', 'config', '--local', 'core.hooksPath').stdout.toString()
    ).toBe('.husky/_\n');
    writeFileSync(
      join(directory, 'bunfig.toml'),
      '[fmt]\nsingleQuote = true\ntrailingComma = "es5"\n'
    );
    writeFileSync(join(directory, 'full.ts'), 'const full="staged"\n');
    writeFileSync(join(directory, 'partial.ts'), 'const partial="staged"\n');
    expect(run('git', 'add', 'full.ts', 'partial.ts').exitCode).toBe(0);
    const partial = 'const partial="staged"\nconst secretUnstaged="keep me"\n';
    writeFileSync(join(directory, 'partial.ts'), partial);
    const hook = run('git', 'hook', 'run', 'pre-commit');
    expect(hook.exitCode).not.toBe(0);
    expect(hook.stderr.toString()).toContain(
      'both staged and unstaged changes'
    );
    expect(hook.stdout.toString() + hook.stderr.toString()).not.toContain(
      'DEPRECATED'
    );
    expect(run('git', 'show', ':full.ts').stdout.toString()).toBe(
      "const full = 'staged';\n"
    );
    expect(run('git', 'show', ':partial.ts').stdout.toString()).toBe(
      'const partial="staged"\n'
    );
    expect(readFileSync(join(directory, 'partial.ts'), 'utf8')).toBe(partial);
    expect(run('git', 'diff', '--cached').stdout.toString()).not.toContain(
      'secretUnstaged'
    );
    expect(
      Bun.spawnSync(['git', 'hook', 'run', 'pre-commit'], {
        cwd: directory,
        env: { ...env, HUSKY: '0' },
      }).exitCode
    ).toBe(0);
    expect(run('git', 'add', 'partial.ts').exitCode).toBe(0);
    expect(run('git', 'hook', 'run', 'pre-commit').exitCode).toBe(0);
    expect(run('git', 'show', ':partial.ts').stdout.toString()).toBe(
      "const partial = 'staged';\nconst secretUnstaged = 'keep me';\n"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
