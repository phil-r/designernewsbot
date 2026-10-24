import { mock } from 'bun:test';
import { installNetworkPolicy } from './fixtures/network-policy';
installNetworkPolicy(true);

// Always active for bun test, even when a single test file is selected.
mock.module('../src/environment', () => ({}));
process.env.NODE_ENV = 'development';
process.env.TELEGRAM_BOT_TOKEN = 'offline-test-token';
process.env.BEHANCE_TOKEN = 'offline-test-token';
delete process.env.DATABASE_URL;
