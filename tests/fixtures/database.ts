import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase } from '../../scripts/init-db';
import { openExistingDatabase, createRepositories } from '../../src/db';

export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'designernews-synthetic-'));
  const filename = join(directory, 'fixture.sqlite');
  initializeDatabase(filename);
  const db = openExistingDatabase(filename);
  return {
    directory,
    filename,
    db,
    repo: createRepositories(() => db),
    cleanup() {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export function row(id = 42) {
  return {
    id,
    title: 'Synthetic "雪"',
    text: null,
    message: "<b>quote's</b>\nnew line",
    url: 'https://offline.invalid/repeat',
    shortUrl: `https://offline.invalid/s/${id}`,
    shortDnUrl: `https://offline.invalid/c/${id}`,
    score: 12,
    telegramMessageId: null,
  };
}
