import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
  decodeGalleryCursor,
  GALLERY_PAGE_SIZE,
  readGallery,
} from '../src/gallery';
import { fixture, row } from './fixtures/database';

const imageUrl = 'https://offline.invalid/preview.jpg?size=640';
const posted = (id: number, createdAt = 1700000000000) => ({
  ...row(id),
  createdAt: new Date(createdAt),
  title: String(id),
  telegramMessageId: id,
  imageUrl,
});

test('gallery excludes legacy, imports, unsuccessful writes and unusable previews', () => {
  const f = fixture();
  try {
    const { behanceProject, dribbbleShot, designerNewsStory } = f.repo;
    behanceProject.create({ data: { ...row(1), telegramMessageId: 1 } });
    f.db.exec(
      "UPDATE BehanceProject SET createdAt = '2025-12-20 19:30:15' WHERE id = 1"
    );
    behanceProject.create({ data: { ...posted(2), telegramMessageId: null } });
    dribbbleShot.create({ data: { ...posted(3), telegramMessageId: 0 } });
    dribbbleShot.create({ data: { ...posted(4), url: 'javascript:void(0)' } });
    for (const [offset, url] of [
      undefined,
      '',
      'not-a-url',
      'file:///local.jpg',
      '//offline.invalid/a',
      'http://offline.invalid/a',
      'https://user:pass@offline.invalid/a',
      'https://offline.invalid/a.MP4?t=1',
    ].entries()) {
      dribbbleShot.create({ data: { ...posted(10 + offset), imageUrl: url } });
    }
    const imported = { ...posted(24), updatedAt: new Date() };
    dribbbleShot.upsert({
      where: { id: 24 },
      create: imported,
      update: imported,
    });
    designerNewsStory.create({ data: posted(42) });
    expect(readGallery(f.db, null)).toEqual({ items: [], nextCursor: null });
    expect(
      f.db.query('SELECT id FROM DribbbleShot WHERE imageUrl IS NOT NULL').all()
    ).toEqual([]);

    behanceProject.create({ data: posted(100) });
    expect(readGallery(f.db, null)).toEqual({
      items: [{ title: '100', url: row().url, imageUrl, source: 'behance' }],
      nextCursor: null,
    });
  } finally {
    f.cleanup();
  }
});

test('keyset pagination walks both sources without skipping even when exact cross-source ties straddle pages', () => {
  const f = fixture();
  try {
    const timestamp = 1700000000000;
    // One newer row gives the first page an odd number of slots for same-ms
    // rows, splitting a Dribbble/Behance pair of identical IDs.
    f.repo.dribbbleShot.create({ data: posted(200, timestamp + 1) });
    const expected = ['dribbble:200'];
    for (let id = 37; id > 0; id--) {
      f.repo.behanceProject.create({ data: posted(id) });
      f.repo.dribbbleShot.create({ data: posted(id) });
      expected.push(`dribbble:${id}`, `behance:${id}`);
    }
    f.repo.behanceProject.create({ data: posted(201, timestamp - 1) });
    expected.push('behance:201');
    const first = readGallery(f.db, null);
    expect(first.items).toHaveLength(GALLERY_PAGE_SIZE);
    expect(first.items.at(-1)).toMatchObject({
      source: 'dribbble',
      title: '26',
    });
    expect(first.nextCursor).toBeString();
    // A new item arriving after page one is visible on refresh, not mixed
    // into the older pages of the current walk.
    f.repo.behanceProject.create({ data: posted(300, timestamp + 2) });
    const actual = first.items.map(({ title, source }) => `${source}:${title}`);
    let next = first.nextCursor;
    for (let page = 0; next && page < 5; page++) {
      const cursor = decodeGalleryCursor(next);
      expect(cursor).not.toBeNull();
      const result = readGallery(f.db, cursor);
      expect(result.items.length).toBeLessThanOrEqual(GALLERY_PAGE_SIZE);
      actual.push(
        ...result.items.map(({ title, source }) => `${source}:${title}`)
      );
      next = result.nextCursor;
    }
    expect(next).toBeNull();
    expect(actual).toEqual(expected);
    expect(readGallery(f.db, null).items[0]?.title).toBe('300');
  } finally {
    f.cleanup();
  }
});

test('native gallery HTTP publishes successful new deliveries with previews and rejects malformed cursors', () => {
  const f = fixture();
  try {
    for (let id = 1; id <= GALLERY_PAGE_SIZE; id++)
      f.repo.dribbbleShot.create({ data: posted(id) });
    const requestScript = `
      import assert from 'node:assert/strict';
      const { setFetchFixture } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/network-policy.ts'))});
      const { handleRequest } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/http.ts'))});
      const { addBehanceProject } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/services/behance.ts'))});
      const { addDribbbleShot, getDribbleShotUrl } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/services/dribbble.ts'))});
      const { project, shot } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/feeds.ts'))});
      const { default: cache } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/cache.ts'))});
      const fetchGallery = (query = '', method = 'GET') => handleRequest(new Request('https://example.invalid/api/gallery' + query, { method }));
      let delivery = 0;
      setFetchFixture((url, init) => {
        assert.equal(url.origin, 'https://api.telegram.org');
        assert.equal(init?.method, 'POST');
        delivery++;
        if (delivery === 1) return Promise.resolve(Response.json({ ok: false }));
        return Promise.resolve(Response.json({ ok: true, result: { message_id: 100 + delivery } }));
      });
      await addBehanceProject({ ...project, id: 100, name: 'Failed delivery' });
      await addBehanceProject(project);
      await addDribbbleShot({ ...shot, id: 101, img: undefined, video: 'https://offline.invalid/video.mp4' });
      assert.equal(delivery, 3);
      cache.clear();
      assert.equal(await getDribbleShotUrl(101), shot.url);
      const response = await fetchGallery();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\\/json/);
      const first = await response.json();
      assert.deepEqual(Object.keys(first).sort(), ['items', 'nextCursor']);
      assert.equal(first.items.length, ${GALLERY_PAGE_SIZE});
      assert.deepEqual(first.items[0], { title: project.name, url: project.url, imageUrl: project.covers.original, source: 'behance' });
      assert.equal(typeof first.nextCursor, 'string');
      const query = '?cursor=' + encodeURIComponent(first.nextCursor);
      const following = await fetchGallery(query);
      assert.equal(following.status, 200);
      assert.deepEqual(await following.json(), {
        items: [{ title: '1', url: '${row().url}', imageUrl: '${imageUrl}', source: 'dribbble' }],
        nextCursor: null,
      });
      const head = await fetchGallery(query, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      for (const bad of ['?cursor', '?cursor=%ZZ', '?cursor=abc', '?cursor=' + 'a'.repeat(81), '?cursor=' + 'a'.repeat(513), '?other=1', query + '&cursor=abc', query + '%3d', ...[[1, 1, 2147483648, 0], [1, 1, 1, 2], [1, 1.1, 1, 0], [2, 1, 1, 0]].map(tuple => '?cursor=' + Buffer.from(JSON.stringify(tuple)).toString('base64url'))]) {
        const rejected = await fetchGallery(bad);
        assert.equal(rejected.status, 400);
        assert.deepEqual(await rejected.json(), { error: 'Invalid gallery query' });
      }
      assert.equal((await fetchGallery('', 'POST')).status, 404);
    `;
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--preload',
        resolve(import.meta.dir, 'fixtures/block-network.ts'),
        '-e',
        requestScript,
      ],
      {
        cwd: f.directory,
        env: {
          PATH: process.env.PATH ?? '',
          DATABASE_URL: 'file:' + f.filename,
          NODE_ENV: 'development',
          TELEGRAM_BOT_TOKEN: 'offline-test-token',
        },
      }
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  } finally {
    f.cleanup();
  }
});

test('gallery serves only archived posts and never fetches an upstream feed', () => {
  const f = fixture();
  try {
    const requestScript = `
      import assert from 'node:assert/strict';
      const { setFetchFixture } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/network-policy.ts'))});
      const { handleRequest } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/http.ts'))});
      const { getDatabase } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/persistence.ts'))});
      const request = (query = '', method = 'GET') => handleRequest(new Request('https://offline.invalid/api/gallery' + query, { method }));
      const read = async (query) => {
        const response = await request(query);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.json();
      };
      const empty = { items: [], nextCursor: null };
      const later = '?cursor=' + Buffer.from(JSON.stringify([1, 42, 1, 0])).toString('base64url');
      let calls = 0;
      setFetchFixture(async () => {
        calls++;
        return Response.json({ top: [] });
      });
      assert.deepEqual(await read(), empty);
      assert.deepEqual(await read(later), empty);
      const head = await request('', 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal((await request('?cursor=bogus')).status, 400);
      assert.equal(calls, 0);

      const db = getDatabase();
      const { createRepositories } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/db.ts'))});
      createRepositories(() => db).dribbbleShot.create({ data: { ...${JSON.stringify(posted(1))}, createdAt: new Date(${posted(1).createdAt.getTime()}) } });
      assert.deepEqual(await read(), { items: [{ title: '1', url: '${row().url}', imageUrl: '${imageUrl}', source: 'dribbble' }], nextCursor: null });
      assert.equal(calls, 0);

      db.exec('DROP INDEX DribbbleShot_gallery_idx');
      const log = console.error;
      let diagnostic;
      console.error = (...args) => { diagnostic = args; };
      try {
        const broken = await request();
        assert.equal(broken.status, 500);
        assert.deepEqual(await broken.json(), { error: 'Gallery unavailable' });
        assert.equal(diagnostic[1].routeType, 'gallery');
        assert.equal(calls, 0);
      } finally { console.error = log; }
    `;
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--preload',
        resolve(import.meta.dir, 'fixtures/block-network.ts'),
        '-e',
        requestScript,
      ],
      {
        cwd: f.directory,
        env: {
          PATH: process.env.PATH ?? '',
          DATABASE_URL: 'file:' + f.filename,
          NODE_ENV: 'development',
        },
        timeout: 5000,
      }
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  } finally {
    f.cleanup();
  }
});
