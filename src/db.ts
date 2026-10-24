import { Database } from 'bun:sqlite';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

export const schemaDirectory = fileURLToPath(
  new URL('../prisma/', import.meta.url)
);
export const tables = [
  'DesignerNewsStory',
  'BehanceProject',
  'DribbbleShot',
] as const;
export type Table = (typeof tables)[number];
export const BUSY_TIMEOUT_MS = 1000;

// Prisma resolves relative SQLite filenames against schema.prisma, not process.cwd().
// Only plain file: filenames are supported: URI options/authorities are not guessed.
export function resolveDatabasePath(url = process.env.DATABASE_URL): string {
  if (!url?.startsWith('file:'))
    throw new Error('DATABASE_URL must be a file: filename');
  let filename = url.slice(5);
  if (!filename || /[?#\u0000]/.test(filename) || filename === ':memory:')
    throw new Error('Unsupported DATABASE_URL filename or options');
  if (filename.startsWith('//')) {
    if (!filename.startsWith('///'))
      throw new Error('DATABASE_URL authorities are unsupported');
    const uri = new URL(url);
    filename = fileURLToPath(uri);
  } else if (filename.includes('%')) {
    throw new Error(
      'Use a plain filename or an absolute file:/// URL for encoded paths'
    );
  }
  return isAbsolute(filename) ? filename : resolve(schemaDirectory, filename);
}

const baseColumns = [
  'id',
  'title',
  'message',
  'url',
  'shortUrl',
  'score',
  'telegramMessageId',
  'createdAt',
  'updatedAt',
];
export function columnsFor(table: Table): string[] {
  return table === 'DesignerNewsStory'
    ? [
        'id',
        'title',
        'text',
        'message',
        'url',
        'shortUrl',
        'shortDnUrl',
        'score',
        'telegramMessageId',
        'createdAt',
        'updatedAt',
      ]
    : [...baseColumns];
}

// Fixed identifiers only; user-controlled values are always bound parameters.
export function validateSchema(db: Database): void {
  for (const table of tables) {
    const columns = db.query(`PRAGMA table_info("${table}")`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }>;
    const expected = columnsFor(table);
    if (columns.length !== expected.length)
      throw new Error(`Incompatible schema: ${table} columns`);
    for (const [i, name] of expected.entries()) {
      const c = columns[i]!;
      const type = ['id', 'score', 'telegramMessageId'].includes(name)
        ? 'INTEGER'
        : name.endsWith('At')
          ? 'DATETIME'
          : 'TEXT';
      const nullable = ['text', 'telegramMessageId'].includes(name);
      if (
        c.name !== name ||
        c.type.toUpperCase() !== type ||
        c.notnull !== (nullable ? 0 : 1) ||
        c.pk !== (name === 'id' ? 1 : 0) ||
        c.dflt_value !== (name === 'createdAt' ? 'CURRENT_TIMESTAMP' : null)
      )
        throw new Error(`Incompatible schema: ${table}.${name}`);
    }
    const definition = db
      .query('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
      .get('table', table) as { sql: string } | null;
    // Exact original table definition, ignoring presentation, also rejects hidden CHECK/FK constraints.
    const canonical = (sql: string) =>
      sql.replace(/[\s"`\[\];]/g, '').toUpperCase();
    const expectedSQL = `CREATE TABLE ${table} (${columns.map((c) => `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}${c.pk ? ' PRIMARY KEY AUTOINCREMENT' : ''}${c.dflt_value ? ' DEFAULT ' + c.dflt_value : ''}`).join(',')})`;
    if (!definition || canonical(definition.sql) !== canonical(expectedSQL))
      throw new Error(`Incompatible schema: ${table} definition`);
    const indexes = db.query(`PRAGMA index_list("${table}")`).all() as Array<{
      name: string;
      unique: number;
      partial: number;
    }>;
    const uniqueColumns =
      table === 'DesignerNewsStory'
        ? ['shortUrl', 'shortDnUrl', 'telegramMessageId']
        : ['shortUrl', 'telegramMessageId'];
    if (indexes.filter((i) => i.unique).length !== uniqueColumns.length)
      throw new Error(`Incompatible schema: ${table} unique indexes`);
    for (const column of uniqueColumns) {
      const name = `${table}_${column}_key`;
      const index = indexes.find((i) => i.name === name);
      // Name is built solely from the fixed table/column allowlists above.
      const info = db.query(`PRAGMA index_xinfo("${name}")`).all() as Array<{
        name: string | null;
        key: number;
        coll: string;
        desc: number;
      }>;
      const keys = info.filter((i) => i.key);
      if (
        !index?.unique ||
        index.partial ||
        keys.length !== 1 ||
        keys[0]!.name !== column ||
        keys[0]!.coll !== 'BINARY' ||
        keys[0]!.desc
      )
        throw new Error(`Incompatible schema: ${name}`);
    }
  }
}

export type RecordInput = {
  id: number;
  title: string;
  message: string;
  url: string;
  shortUrl: string;
  score: number;
  telegramMessageId?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};
export type StoryInput = RecordInput & {
  shortDnUrl: string;
  text?: string | null;
};
export function validateInteger(
  value: unknown,
  name: string
): asserts value is number {
  // Prisma Int is signed 32-bit, including IDs and Telegram message IDs.
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < -2147483648 ||
    value > 2147483647
  )
    throw new TypeError(`${name} must be a signed 32-bit integer`);
}
function timestamp(value: unknown, name: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError(`${name} must be a valid Date`);
  return value.getTime();
}
function valuesFor(
  table: Table,
  data: RecordInput | StoryInput,
  imported: boolean
) {
  validateInteger(data.id, 'id');
  validateInteger(data.score, 'score');
  if (data.telegramMessageId != null)
    validateInteger(data.telegramMessageId, 'telegramMessageId');
  const now = new Date();
  const story = data as StoryInput;
  const values = columnsFor(table).map((name) => {
    if (name === 'createdAt' || name === 'updatedAt')
      return timestamp(imported ? data[name] : (data[name] ?? now), name);
    if (name === 'telegramMessageId') return data.telegramMessageId ?? null;
    if (name === 'text') {
      if (story.text != null && typeof story.text !== 'string')
        throw new TypeError('text must be a string or null');
      return story.text ?? null;
    }
    if (name === 'id' || name === 'score') return data[name];
    const value = (data as unknown as Record<string, unknown>)[name];
    if (typeof value !== 'string')
      throw new TypeError(`${name} must be a string`);
    return value;
  });
  return values;
}

function repository<T extends RecordInput>(
  connection: () => Database,
  table: Table
) {
  const columns = columnsFor(table);
  const insert = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
  return {
    findUnique({
      where: { id },
    }: {
      where: { id: number };
    }): { url: string } | null {
      validateInteger(id, 'id');
      return connection()
        .query(`SELECT url FROM "${table}" WHERE id = ?`)
        .get(id) as { url: string } | null;
    },
    create({ data }: { data: T }): void {
      const values = valuesFor(table, data, false);
      connection()
        .query(insert)
        .run(...values);
    },
    upsert({
      where: { id },
      create,
      update,
    }: {
      where: { id: number };
      create: T;
      update: T;
    }): void {
      validateInteger(id, 'id');
      if (create.id !== id || update.id !== id)
        throw new TypeError('Upsert IDs must match');
      const insertValues = valuesFor(table, create, true);
      const updateValues = valuesFor(table, update, true);
      // Prisma skips undefined nullable fields on update; explicit null clears them.
      // Inserts still map omitted optional fields to SQL NULL.
      const updates = columns
        .map((column, i) => ({ column, value: updateValues[i]! }))
        .filter(
          ({ column }) =>
            column !== 'id' &&
            !(
              column === 'telegramMessageId' &&
              update.telegramMessageId === undefined
            ) &&
            !(
              column === 'text' &&
              (update as RecordInput & { text?: string | null }).text ===
                undefined
            )
        );
      connection()
        .query(
          `${insert} ON CONFLICT(id) DO UPDATE SET ${updates.map(({ column }) => `"${column}" = ?`).join(',')}`
        )
        .run(...insertValues, ...updates.map(({ value }) => value));
    },
  };
}
export function createRepositories(connection: () => Database) {
  return {
    designerNewsStory: repository<StoryInput>(connection, 'DesignerNewsStory'),
    behanceProject: repository<RecordInput>(connection, 'BehanceProject'),
    dribbbleShot: repository<RecordInput>(connection, 'DribbbleShot'),
  };
}
export function openExistingDatabase(
  filename: string,
  readonly = false
): Database {
  let db: Database | undefined;
  try {
    if (!filename || !statSync(filename).isFile())
      throw new Error('Existing regular database file required');
    db = new Database(filename, {
      readonly,
      readwrite: !readonly,
      create: false,
      strict: true,
    });
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    validateSchema(db);
    return db;
  } catch (error) {
    db?.close();
    // No configured filenames or row contents in operational errors.
    throw new Error('Cannot open compatible existing database', {
      cause: error,
    });
  }
}
let shared: Database | undefined;
export function getDatabase(): Database {
  return (shared ??= openExistingDatabase(resolveDatabasePath()));
}
export function closeDatabase(): void {
  shared?.close();
  shared = undefined;
}
export default createRepositories(getDatabase);
