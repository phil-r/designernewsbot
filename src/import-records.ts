import type { createRepositories } from './db';

type ExportRecord = {
  created: number;
  title: string;
  telegram_message_id: number | null;
  message: string;
  url: string;
  short_url: string;
  score: number;
  short_dn_url?: string;
  text?: string | null;
};
export type ExportObjects = Record<string, Record<string, ExportRecord>>;

// No network, file reads, implicit connection or async transaction here.
export function importRecords(
  parsed: ExportObjects,
  db: ReturnType<typeof createRepositories>
): void {
  for (const [type, objects] of Object.entries(parsed)) {
    if (!['BehanceProject', 'DribbbleShot', 'StoryPost'].includes(type))
      continue;
    for (const [id, o] of Object.entries(objects)) {
      if (typeof o.created !== 'number' || !Number.isFinite(o.created))
        throw new TypeError('Export created must be epoch milliseconds');
      const fields = {
        id: Number(id),
        title: o.title,
        message: o.message,
        url: o.url,
        score: o.score,
        shortUrl: o.short_url,
        createdAt: new Date(o.created),
        updatedAt: new Date(o.created),
        telegramMessageId: o.telegram_message_id,
      };
      if (type === 'StoryPost') {
        if (typeof o.short_dn_url !== 'string')
          throw new TypeError('Export short_dn_url must be a string');
        const story = { ...fields, shortDnUrl: o.short_dn_url, text: o.text };
        db.designerNewsStory.upsert({
          where: { id: fields.id },
          create: story,
          update: story,
        });
      } else {
        const repository =
          type === 'BehanceProject' ? db.behanceProject : db.dribbbleShot;
        repository.upsert({
          where: { id: fields.id },
          create: fields,
          update: fields,
        });
      }
    }
  }
}
