import bcrypt from 'bcrypt';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { StoreManager, type Logger } from '../src/store/manager.js';

export const quietLogger: Logger = { info: () => undefined, error: () => undefined };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'frog-test-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function openManager(dataDir?: string): Promise<StoreManager> {
  const dir = dataDir ?? (await tempDir());
  const manager = await StoreManager.open({ dataDir: dir, flushDelayMs: 10, logger: quietLogger });
  cleanups.push(() => manager.close());
  return manager;
}

export const PASSWORD = 'correct horse';
const hash = bcrypt.hashSync(PASSWORD, 4);

export async function startServer() {
  const dataDir = await tempDir();
  const manager = await openManager(dataDir);
  const config: Config = {
    production: false,
    host: '127.0.0.1',
    port: 0,
    dataDir,
    passwordHash: hash,
    sessionSecret: 'test-secret-test-secret-test-secret',
    cookieSecure: true,
    clientDist: path.join(dataDir, 'no-client'),
    version: '1.0.0-test',
  };
  const app = createApp({ config, manager, logger: quietLogger });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let cookie = '';
  const request = async (
    method: string,
    url: string,
    body?: unknown,
    opts: { raw?: string } = {},
  ) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined || opts.raw ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, headers: res.headers, json: json as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  return {
    manager,
    dataDir,
    request,
    login: () => request('POST', '/api/login', { password: PASSWORD }),
    getCookie: () => cookie,
    setCookie: (value: string) => {
      cookie = value;
    },
  };
}
