import './environment';
import { getDatabase, closeDatabase } from './persistence';
import { handleRequest } from './http';

export function parsePort(value: string | undefined): number {
  if (value === undefined) return 8080;
  if (!/^\d+$/.test(value))
    throw new Error('PORT must be an integer from 1 to 65535');
  const port = Number(value);
  if (port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535');
  return port;
}

export function startServer() {
  const port = parsePort(process.env.PORT);
  getDatabase(); // Fail closed before opening the listener.
  let server;
  try {
    server = Bun.serve({ port, fetch: handleRequest });
  } catch (error) {
    closeDatabase();
    throw error;
  }
  console.log(`server ready on port ${server.port}`);
  return server;
}

if (require.main === module) {
  try {
    const server = startServer();
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await server.stop(); // Drain active requests before closing SQLite.
      } catch {
        console.error('HTTP shutdown failed');
        process.exitCode = 1;
      } finally {
        closeDatabase();
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    console.error(
      'server startup failed; check PORT and database configuration'
    );
    process.exitCode = 1;
  }
}
