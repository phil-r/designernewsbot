import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const projectEnvPath = fileURLToPath(
  new URL('../.env', import.meta.url)
);

// Only the root .env, never CWD/.env.local/mode files; external values win.
export function loadEnvironment(
  filename = projectEnvPath,
  env: NodeJS.ProcessEnv = process.env
): void {
  let contents: string;
  try {
    contents = readFileSync(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error('unable to load project environment');
  }
  for (const [key, value] of Object.entries(dotenv.parse(contents))) {
    if (env[key] === undefined) env[key] = value;
  }
}
