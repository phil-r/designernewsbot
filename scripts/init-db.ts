import { Database } from 'bun:sqlite';
import {
  openSync,
  closeSync,
  unlinkSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { validateSchema } from '../src/db';

// Explicit bootstrap only. Exclusive creation refuses even an empty existing file.
export function initializeDatabase(filename: string): void {
  const fd = openSync(filename, 'wx', 0o600);
  closeSync(fd);
  let db: Database | undefined;
  try {
    db = new Database(filename, {
      readwrite: true,
      create: false,
      strict: true,
    });
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    const names = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    db.transaction(() => {
      for (const name of names)
        db!.exec(
          readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8')
        );
      validateSchema(db!);
    })();
    db.close();
  } catch (error) {
    db?.close();
    unlinkSync(filename); // Only the new file exclusively created by this invocation.
    throw error;
  }
}
if (import.meta.main) {
  try {
    const filename = process.argv[2];
    if (!filename || process.argv.length !== 3)
      throw new Error('Invalid arguments');
    initializeDatabase(filename);
    console.log('new database initialized; no migration history invented.');
  } catch {
    console.error(
      'initialization failed; supply one new writable filename, never an existing database'
    );
    process.exitCode = 1;
  }
}
