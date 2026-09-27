import bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface Config {
  production: boolean;
  host: string;
  port: number;
  dataDir: string;
  passwordHash: string;
  sessionSecret: string;
  cookieSecure: boolean;
  /** Built client (`client/dist`); served when it exists. */
  clientDist: string;
  version: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const production = env.NODE_ENV === 'production';
  const missing = (name: string) => {
    throw new Error(`${name} is not set. Add it to the env file (see deploy/.env.example).`);
  };

  let passwordHash = env.PASSWORD_HASH ?? '';
  let sessionSecret = env.SESSION_SECRET ?? '';
  if (production) {
    if (!passwordHash) missing('PASSWORD_HASH');
    if (sessionSecret.length < 32) missing('SESSION_SECRET (at least 32 characters)');
  } else {
    if (!passwordHash) {
      passwordHash = await bcrypt.hash('frog', 10);
      console.warn('[frog] PASSWORD_HASH not set; dev password is "frog".');
    }
    if (!sessionSecret) sessionSecret = 'dev-only-session-secret-change-me-please';
  }

  return {
    production,
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3080),
    dataDir: path.resolve(
      env.DATA_DIR ?? (production ? '/srv/frog/data' : path.join(here, '..', '..', '.data')),
    ),
    passwordHash,
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    clientDist: path.resolve(env.CLIENT_DIST ?? path.join(here, '..', '..', 'client', 'dist')),
    version: readVersion(),
  };
}
