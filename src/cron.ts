import dotenv from 'dotenv';
dotenv.config({ path: __dirname + `/../.env` });

import { behanceCron } from './services/behance';
import { dnCron } from './services/dn';
import { dribbbleCron } from './services/dribbble';

export default async function cron() {
  await dribbbleCron();
  await behanceCron();
  await dnCron();
}

cron();
