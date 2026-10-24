// Manual isolated compatibility probe only; not imported by the application.
// Arguments are supplied by scripts/verify-legacy-fixture.ts for a new synthetic DB.
const assert = require('node:assert/strict');
const { PrismaClient } = require(process.argv[2]);
const client = new PrismaClient({
  datasources: { db: { url: 'file:' + process.argv[3] } },
});
async function main() {
  for (const table of ['designerNewsStory', 'behanceProject', 'dribbbleShot']) {
    const normal = await client[table].findUnique({ where: { id: 42 } });
    assert.equal(normal.title, 'Synthetic "雪"');
    assert.equal(normal.telegramMessageId, null);
    assert.equal(normal.createdAt.getTime(), normal.updatedAt.getTime());
    const imported = await client[table].findUnique({ where: { id: 43 } });
    assert.equal(imported.createdAt.getTime(), 1234567890123);
    assert.equal(imported.updatedAt.getTime(), 1234567890456);
    await client[table].create({
      data: {
        id: 44,
        title: 'old client',
        message: 'synthetic',
        url: 'https://offline.invalid/old',
        shortUrl: 'old-client-short',
        score: 1,
        telegramMessageId: null,
        createdAt: new Date(1234567890789),
        updatedAt: new Date(1234567890999),
        ...(table === 'designerNewsStory'
          ? { shortDnUrl: 'old-client-comments', text: null }
          : {}),
      },
    });
  }
}
main()
  .catch(() => {
    console.error('synthetic legacy roundtrip failed');
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
