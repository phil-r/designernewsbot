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
