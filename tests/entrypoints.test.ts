import './setup';
import { expect, test, spyOn } from 'bun:test';
import fs from 'node:fs';
import { trace, db, outbound, resetDoubles } from './setup';

test('entrypoints have explicit main guards before importing them', async () => {
  for (const file of ['index', 'cron', 'import']) {
    const source = await Bun.file(
      `${import.meta.dir}/../src/${file}.ts`
    ).text();
    expect(source).toContain('require.main === module');
  }
});

test('importing entrypoints neither listens, reads exports, sends nor writes', async () => {
  resetDoubles();
  const listen = spyOn(Bun, 'serve').mockImplementation(() => {
    throw new Error('Unexpected listener');
  });
  const readdir = spyOn(fs.promises, 'readdir').mockImplementation(async () => {
    throw new Error('Unexpected export read');
  });
  try {
    // Avoid executing unsafe legacy code if the guard test has not yet passed.
    for (const file of ['index', 'cron', 'import']) {
      if (
        !(
          await Bun.file(`${import.meta.dir}/../src/${file}.ts`).text()
        ).includes('require.main === module')
      )
        throw new Error('Unsafe legacy entrypoint');
      await import(`../src/${file}.ts`);
    }
    expect(listen).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
    expect(trace).toEqual([]);
    for (const t of Object.values(db)) expect(t.upsert).not.toHaveBeenCalled();
  } finally {
    listen.mockRestore();
    readdir.mockRestore();
  }
});

test('one-shot cron awaits only Dribbble → Behance, ignoring retired DN stories', async () => {
  resetDoubles();
  outbound.feeds.stories = [
    {
      id: '42',
      title: 'Retired feed story',
      url: 'https://example.invalid/story',
      sponsored: false,
      vote_count: 100,
      comment_count: 2,
      comment: '',
    },
  ];
  const { default: cron } = await import('../src/cron');
  await cron();
  expect(trace).toEqual(['feed:dribbble', 'feed:behance']);
  expect(outbound.posts).toEqual([]);
  expect(db.designerNewsStory.findUnique).not.toHaveBeenCalled();
  expect(db.designerNewsStory.create).not.toHaveBeenCalled();
  expect(db.designerNewsStory.upsert).not.toHaveBeenCalled();
});
