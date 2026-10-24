import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
