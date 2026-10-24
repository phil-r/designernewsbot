import './environment';
import { getDatabase, closeDatabase } from './persistence';
import { behanceCron } from './services/behance';
import { dnCron } from './services/dn';
import { dribbbleCron } from './services/dribbble';

export default async function cron() {
  try {
    getDatabase(); // Validate before any feed lookup or Telegram delivery.
    await dribbbleCron();
    await behanceCron();
    await dnCron();
  } finally {
    closeDatabase();
  }
}

if (require.main === module) {
  cron().catch(() => {
    console.error('posting job failed');
    process.exitCode = 1;
  });
}
