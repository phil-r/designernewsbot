import './environment';
import { promises as fs } from 'node:fs';
import db, { closeDatabase, getDatabase } from './persistence';
import { importRecords, type ExportObjects } from './import-records';

export const main = async () => {
  getDatabase();
  // Historical mismatch intentionally retained: listing hidden/export/dest but
  // reading export/dest. Repair requires an explicit import-use request.
  const files = await fs.readdir('./hidden/export/dest/');
  for (const file of files) {
    const contents = await fs.readFile('./export/dest/' + file, 'utf8');
    importRecords(JSON.parse(contents) as ExportObjects, db);
  }
};

if (require.main === module) {
  main()
    .catch(() => {
      console.error('import failed');
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
