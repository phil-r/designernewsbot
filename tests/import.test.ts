import { expect, test } from 'bun:test';
import { fixture, row } from './fixtures/database';

for (const name of [
  'designerNewsStory',
  'behanceProject',
  'dribbbleShot',
] as const)
  test(`${name} import upsert preserves dates, IDs, unrelated rows and conflict failures`, () => {
    const f = fixture();
    try {
      const r = f.repo[name];
      const first = {
        ...row(700),
        createdAt: new Date('2015-02-03T04:05:06.789Z'),
        updatedAt: new Date('2016-01-01T00:00:00Z'),
      };
      r.create({ data: row(701) });
      r.upsert({ where: { id: 700 }, create: first, update: first });
      const second = {
        ...first,
        title: 'updated synthetic',
        createdAt: new Date(123456),
        updatedAt: new Date(234567),
      };
      r.upsert({ where: { id: 700 }, create: second, update: second });
      const table = {
        designerNewsStory: 'DesignerNewsStory',
        behanceProject: 'BehanceProject',
        dribbbleShot: 'DribbbleShot',
      }[name];
      const stored = f.db
        .query(
          `SELECT id, title, createdAt, updatedAt FROM "${table}" WHERE id=700`
        )
        .get();
      expect(stored).toEqual({
        id: 700,
        title: second.title,
        createdAt: 123456,
        updatedAt: 234567,
      });
      expect(r.findUnique({ where: { id: 701 } })).toEqual({ url: row().url });
      const collision = { ...second, shortUrl: row(701).shortUrl };
      expect(() =>
        r.upsert({ where: { id: 700 }, create: collision, update: collision })
      ).toThrow();
      expect(
        f.db
          .query(
            `SELECT id, title, createdAt, updatedAt FROM "${table}" WHERE id=700`
          )
          .get()
      ).toEqual(stored);
      expect(() =>
        r.upsert({
          where: { id: 700 },
          create: { ...first, createdAt: undefined },
          update: first,
        })
      ).toThrow();
      expect(() =>
        r.upsert({ where: { id: 699 }, create: first, update: first })
      ).toThrow();
    } finally {
      f.cleanup();
    }
  });

test('legacy export mapping preserves epoch-ms dates, nullable text and unknown-type behavior', async () => {
  const { importRecords } = await import('../src/import-records');
  const f = fixture();
  try {
    const record = {
      created: 1234567890123,
      title: 'synthetic import',
      telegram_message_id: null,
      message: '<b>import</b>',
      url: 'https://offline.invalid',
      short_url: 'synthetic-short',
      short_dn_url: 'synthetic-comments',
      score: 15,
      text: null,
    };
    importRecords(
      {
        BehanceProject: { '88': record },
        DribbbleShot: { '88': record },
        StoryPost: { '88': record },
        Unknown: { '88': record },
      },
      f.repo
    );
    for (const table of [
      'DesignerNewsStory',
      'BehanceProject',
      'DribbbleShot',
    ]) {
      expect(
        f.db
          .query(
            `SELECT createdAt, updatedAt, telegramMessageId FROM "${table}" WHERE id=88`
          )
          .get()
      ).toEqual({
        createdAt: record.created,
        updatedAt: record.created,
        telegramMessageId: null,
      });
    }
    expect(
      f.db.query('SELECT text FROM DesignerNewsStory WHERE id=88').get()
    ).toEqual({ text: null });
    expect(() =>
      importRecords(
        { StoryPost: { '89': { ...record, created: NaN } } },
        f.repo
      )
    ).toThrow();
    expect(() =>
      importRecords({ StoryPost: { 'not-an-id': record } }, f.repo)
    ).toThrow();
  } finally {
    f.cleanup();
  }
});

test('upsert distinguishes omitted nullable fields from explicit NULL like Prisma', () => {
  const f = fixture();
  try {
    const r = f.repo.designerNewsStory;
    const data = {
      ...row(),
      text: 'keep',
      telegramMessageId: 15,
      createdAt: new Date(10),
      updatedAt: new Date(20),
    };
    r.upsert({ where: { id: 42 }, create: data, update: data });
    const omitted = { ...data, text: undefined, telegramMessageId: undefined };
    r.upsert({ where: { id: 42 }, create: omitted, update: omitted });
    expect(
      f.db
        .query(
          'SELECT text, telegramMessageId FROM DesignerNewsStory WHERE id=42'
        )
        .get()
    ).toEqual({ text: 'keep', telegramMessageId: 15 });
    const cleared = { ...data, text: null, telegramMessageId: null };
    r.upsert({ where: { id: 42 }, create: cleared, update: cleared });
    expect(
      f.db
        .query(
          'SELECT text, telegramMessageId FROM DesignerNewsStory WHERE id=42'
        )
        .get()
    ).toEqual({ text: null, telegramMessageId: null });
  } finally {
    f.cleanup();
  }
});

for (const [table, name] of [
  ['BehanceProject', 'behanceProject'],
  ['DribbbleShot', 'dribbbleShot'],
] as const)
  test(`${table} import never adds a preview and keeps one only for the same URL and delivery`, async () => {
    const { importRecords } = await import('../src/import-records');
    const f = fixture();
    try {
      const repo = f.repo[name];
      const preview = 'https://offline.invalid/original.jpg';
      const replacement = 'https://offline.invalid/imported.jpg';
      for (const id of [101, 102, 103, 104, 105, 107]) {
        repo.create({
          data: { ...row(id), telegramMessageId: id, imageUrl: preview },
        });
      }
      const record = (id: number) => ({
        created: 1234567890123,
        title: 'updated title',
        telegram_message_id: id,
        message: 'updated message',
        url: row(id).url,
        short_url: `https://offline.invalid/updated/${id}`,
        score: 30,
        imageUrl: replacement,
      });
      importRecords(
        {
          [table]: {
            '101': record(101),
            '102': { ...record(102), url: 'https://offline.invalid/different' },
            '103': { ...record(103), telegram_message_id: 203 },
            '104': { ...record(104), telegram_message_id: null },
            '106': record(106),
          },
        },
        f.repo
      );
      // Omitted delivery leaves the old one in place; use UPDATE values, not
      // the would-be INSERT values, to decide whether the URL changed.
      for (const id of [105, 107]) {
        const data = {
          ...row(id),
          createdAt: new Date(10),
          updatedAt: new Date(20),
          telegramMessageId: undefined,
          imageUrl: replacement,
        };
        repo.upsert({
          where: { id },
          create: { ...data, telegramMessageId: id + 100 },
          update:
            id === 105 ? data : { ...data, url: 'https://offline.invalid/new' },
        });
      }
      expect(
        f.db
          .query(
            `SELECT id, telegramMessageId, imageUrl FROM "${table}" ORDER BY id`
          )
          .all()
      ).toEqual([
        { id: 101, telegramMessageId: 101, imageUrl: preview },
        { id: 102, telegramMessageId: 102, imageUrl: null },
        { id: 103, telegramMessageId: 203, imageUrl: null },
        { id: 104, telegramMessageId: null, imageUrl: null },
        { id: 105, telegramMessageId: 105, imageUrl: preview },
        { id: 106, telegramMessageId: 106, imageUrl: null },
        { id: 107, telegramMessageId: 107, imageUrl: null },
      ]);
      expect(
        f.db
          .query(`SELECT title, shortUrl FROM "${table}" WHERE id = 101`)
          .get()
      ).toEqual({
        title: 'updated title',
        shortUrl: record(101).short_url,
      });
    } finally {
      f.cleanup();
    }
  });
