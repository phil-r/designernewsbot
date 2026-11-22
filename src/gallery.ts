import type { Database } from 'bun:sqlite';
import { Buffer } from 'node:buffer';
import { galleryPredicate } from './db';

export const GALLERY_PAGE_SIZE = 24;
const sources = ['behance', 'dribbble'] as const;
const sourceTables = ['BehanceProject', 'DribbbleShot'] as const;
type SourceRank = 0 | 1;
type Cursor = { createdAt: number; id: number; rank: SourceRank };
export type GalleryItem = {
  title: string;
  url: string;
  imageUrl: string;
  source: (typeof sources)[number];
};
type StoredItem = Omit<GalleryItem, 'source'> & Omit<Cursor, 'rank'>;

function encodeCursor({ createdAt, id, rank }: Cursor): string {
  return Buffer.from(JSON.stringify([1, createdAt, id, rank])).toString(
    'base64url'
  );
}

export function decodeGalleryCursor(value: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) return null;
  try {
    const tuple: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    );
    if (!Array.isArray(tuple) || tuple.length !== 4) return null;
    const [version, createdAt, id, rank] = tuple;
    if (
      version !== 1 ||
      !Number.isSafeInteger(createdAt) ||
      Math.abs(createdAt) > 8.64e15 ||
      !Number.isInteger(id) ||
      id < -2147483648 ||
      id > 2147483647 ||
      (rank !== 0 && rank !== 1)
    )
      return null;
    const cursor = { createdAt, id, rank };
    return encodeCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export function readGallery(db: Database, cursor: Cursor | null) {
  // Read both sources in one snapshot and seek into their partial indexes.
  // createdAt and id sort descending; rank breaks ties across the two tables.
  const rows = db.transaction(() =>
    ([0, 1] as const).flatMap((rank) => {
      const table = sourceTables[rank];
      const fetchRows = (seek: string, ...params: number[]) =>
        db
          .query<StoredItem, number[]>(
            `SELECT title, url, imageUrl, createdAt, id
           FROM "${table}" INDEXED BY "${table}_gallery_idx"
           WHERE ${galleryPredicate} ${seek}
           ORDER BY "createdAt" DESC, "id" DESC LIMIT ?`
          )
          .all(...params);
      const limit = GALLERY_PAGE_SIZE + 1;
      let page: StoredItem[];
      if (cursor) {
        const operator = rank < cursor.rank ? '<=' : '<';
        // Separate ranges let SQLite seek on id too, not just createdAt.
        page = fetchRows(
          `AND "createdAt" = ? AND "id" ${operator} ?`,
          cursor.createdAt,
          cursor.id,
          limit
        );
        if (page.length < limit)
          page.push(
            ...fetchRows(
              'AND "createdAt" < ?',
              cursor.createdAt,
              limit - page.length
            )
          );
      } else {
        page = fetchRows('', limit);
      }
      return page.map((item) => ({ ...item, rank }));
    })
  )();
  rows.sort(
    (a, b) => b.createdAt - a.createdAt || b.id - a.id || b.rank - a.rank
  );
  const page = rows.slice(0, GALLERY_PAGE_SIZE);
  const items: GalleryItem[] = page.map(({ title, url, imageUrl, rank }) => ({
    title,
    url,
    imageUrl,
    source: sources[rank],
  }));
  return {
    items,
    nextCursor:
      rows.length > GALLERY_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
  };
}
