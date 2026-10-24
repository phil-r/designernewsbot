import './setup';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db, outbound, resetDoubles, trace } from './setup';
import cache from '../src/cache';
const { addDNStory, getDNStoryUrl } = await import('../src/services/dn');
const { addBehanceProject, getBehanceProjectUrl } =
  await import('../src/services/behance');
const { addDribbbleShot, getDribbleShotUrl } =
  await import('../src/services/dribbble');
import { project, shot, story } from './fixtures/feeds';

beforeEach(() => {
  resetDoubles();
  cache.clear();
});
const cases = [
  {
    name: 'DN',
    add: addDNStory,
    item: story,
    below: { ...story, vote_count: 9 },
    table: db.designerNewsStory,
    lookup: getDNStoryUrl,
    method: 'sendMessage',
    text: "<b>Synthetic story</b> (Score: 10+) #DN\n\n<b>Link:</b> http://localhost:8080/s/L\n<b>Comments:</b> http://localhost:8080/c/L\n\n\nIt's a/b\n",
    markup: [
      [
        { text: 'Read', url: story.url },
        { text: '2+ Comments', url: 'https://www.designernews.co/stories/42' },
      ],
    ],
  },
  {
    name: 'Behance',
    add: addBehanceProject,
    item: project,
    below: { ...project, stats: { ...project.stats, appreciations: 1799 } },
    table: db.behanceProject,
    lookup: getBehanceProjectUrl,
    method: 'sendPhoto',
    text: '<b>Synthetic project</b> (Score: 1800+) #Behance\n\n<b>Link:</b> http://localhost:8080/b/L\n',
    markup: [[{ text: 'Open project', url: project.url }]],
  },
  {
    name: 'Dribbble',
    add: addDribbbleShot,
    item: shot,
    below: { ...shot, likes: 249 },
    table: db.dribbbleShot,
    lookup: getDribbleShotUrl,
    method: 'sendPhoto',
    text: '<b>Synthetic shot</b> (Score: 250+) #dribbble\n\n<b>Link:</b> http://localhost:8080/d/L\n',
    markup: [[{ text: 'Open shot', url: shot.url }]],
  },
];
for (const c of cases)
  describe(c.name, () => {
    // The callable union intentionally accepts the per-service synthetic input here.
    const add = c.add as (item: any, ignoreLimit?: boolean) => Promise<void>;
    test('below threshold does not look up, send or insert', async () => {
      await add(c.below);
      expect(c.table.findUnique).not.toHaveBeenCalled();
      expect(outbound.posts).toEqual([]);
      expect(c.table.create).not.toHaveBeenCalled();
    });
    test('existing IDs send nothing and warm the cache', async () => {
      c.table.findUnique.mockResolvedValue({ url: c.item.url });
      await add(c.item);
      await add(c.item);
      expect(c.table.findUnique).toHaveBeenCalledTimes(1);
      expect(outbound.posts).toEqual([]);
      expect(c.table.create).not.toHaveBeenCalled();
    });
    test('threshold payload, buttons and send-before-persist; cache suppresses duplicates', async () => {
      await add(c.item);
      expect(trace[0]).toBe('send');
      expect(trace[1]).toStartWith('insert:');
      expect(outbound.posts).toHaveLength(1);
      const { url, data, options } = outbound.posts[0];
      expect(url).toEndWith('/' + c.method);
      expect(data).toEqual({
        chat_id: '@designer_news_st',
        parse_mode: 'HTML',
        disable_notification: true,
        reply_markup: { inline_keyboard: c.markup },
        ...(c.name === 'DN'
          ? { text: c.text }
          : {
              caption: c.text,
              photo: c.name === 'Behance' ? project.covers.original : shot.img,
            }),
      });
      expect(options.timeout).toBe(c.name === 'DN' ? 10000 : 30000);
      expect(c.table.create.mock.calls[0][0].data).toMatchObject({
        id: 42,
        message: c.text,
        telegramMessageId: 123,
      });
      await add(c.item);
      expect(outbound.posts).toHaveLength(1);
    });
    test('failed send inserts nothing and remains retryable', async () => {
      outbound.result = { ok: false };
      await add(c.item);
      outbound.result = null;
      await add(c.item);
      expect(c.table.create).not.toHaveBeenCalled();
      expect(outbound.posts).toHaveLength(2);
    });
    test('database failure after delivery remains visible and does not warm cache', async () => {
      c.table.create.mockRejectedValue(new Error('synthetic write failure'));
      await expect(add(c.item)).rejects.toThrow('synthetic write failure');
      await expect(add(c.item)).rejects.toThrow('synthetic write failure');
      expect(outbound.posts).toHaveLength(2);
    });
    test('cold lookup returns stored URL, caches hits, and does not cache misses', async () => {
      expect(await c.lookup(42)).toBeNull();
      c.table.findUnique.mockResolvedValue({
        url: 'https://example.invalid/stored',
      });
      expect(await c.lookup(42)).toBe('https://example.invalid/stored');
      expect(await c.lookup(42)).toBe('https://example.invalid/stored');
      expect(c.table.findUnique).toHaveBeenCalledTimes(2);
      expect(outbound.posts).toEqual([]);
    });
    test('explicit ignoreLimit bypasses threshold', async () => {
      await add(c.below, true);
      expect(outbound.posts).toHaveLength(1);
    });
  });

test('sponsored DN stays excluded even with ignoreLimit', async () => {
  await addDNStory({ ...story, sponsored: true }, true);
  expect(outbound.posts).toEqual([]);
  expect(db.designerNewsStory.findUnique).not.toHaveBeenCalled();
});
test('DN without an external URL uses comments as the stored/public destination', async () => {
  await addDNStory({ ...story, url: '', comment: '' });
  expect(outbound.posts[0].data.text).toBe(
    '<b>Synthetic story</b> (Score: 10+) #DN\n\n<b>Link:</b> http://localhost:8080/c/L\n'
  );
  expect(outbound.posts[0].data.reply_markup.inline_keyboard).toEqual([
    [{ text: '2+ Comments', url: 'https://www.designernews.co/stories/42' }],
  ]);
  expect(db.designerNewsStory.create.mock.calls[0][0].data.url).toBe(
    'https://www.designernews.co/stories/42'
  );
});
test('Dribbble video uses sendVideo with the unchanged caption and timeout', async () => {
  await addDribbbleShot({
    ...shot,
    video: 'https://example.invalid/video.mp4',
  });
  expect(outbound.posts[0].url).toEndWith('/sendVideo');
  expect(outbound.posts[0].data.video).toBe(
    'https://example.invalid/video.mp4'
  );
  expect(outbound.posts[0].data.caption).toBe(cases[2].text);
  expect(outbound.posts[0].options.timeout).toBe(30000);
});

test('upstream timeout/failure returns no work without writing or sending', async () => {
  outbound.getError = new Error('synthetic timeout');
  const { default: cron } = await import('../src/cron');
  await cron();
  expect(trace).toEqual(['feed:dribbble', 'feed:behance', 'feed:dn']);
  expect(outbound.posts).toEqual([]);
  for (const table of Object.values(db))
    expect(table.create).not.toHaveBeenCalled();
});

test('transport failure is swallowed by legacy Telegram client, inserts nothing', async () => {
  outbound.postError = new Error('synthetic Telegram timeout');
  await addDribbbleShot(shot);
  expect(db.dribbbleShot.create).not.toHaveBeenCalled();
  expect(outbound.posts).toHaveLength(1);
});
