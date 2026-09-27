import { newTask } from '@frog/shared';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startServer } from './helpers.js';

const empty = { lists: [], tasks: [], days: [], focusSessions: [] };

describe('auth', () => {
  it('serves health without auth', async () => {
    const s = await startServer();
    const r = await s.request('GET', '/api/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, rev: 0, version: '1.0.0-test' });
  });

  it('requires a session for data endpoints', async () => {
    const s = await startServer();
    for (const [method, url] of [
      ['GET', '/api/session'],
      ['GET', '/api/store'],
      ['POST', '/api/sync'],
      ['GET', '/api/export'],
      ['POST', '/api/import'],
    ] as const) {
      expect((await s.request(method, url)).status).toBe(401);
    }
  });

  it('signs in with the right password and sets a strict, http-only, secure cookie', async () => {
    const s = await startServer();
    expect((await s.request('POST', '/api/login', { password: 'nope' })).status).toBe(401);
    const r = await s.login();
    expect(r.status).toBe(204);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=7776000/);
    expect((await s.request('GET', '/api/session')).status).toBe(200);
  });

  it('rejects a tampered cookie', async () => {
    const s = await startServer();
    await s.login();
    // Push the expiry far into the future without a valid signature.
    s.setCookie(s.getCookie().replace(/s%3A\d+/, 's%3A99999999999999'));
    expect((await s.request('GET', '/api/session')).status).toBe(401);
    s.setCookie('frog_session=9999999999999');
    expect((await s.request('GET', '/api/session')).status).toBe(401);
  });

  it('rate-limits failed logins to 5 per 15 minutes', async () => {
    const s = await startServer();
    for (let i = 0; i < 5; i++)
      expect((await s.request('POST', '/api/login', { password: 'x' })).status).toBe(401);
    const blocked = await s.request('POST', '/api/login', { password: 'x' });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error).toMatch(/15 minutes/);
  });

  it('signs out', async () => {
    const s = await startServer();
    await s.login();
    await s.request('POST', '/api/logout');
    expect((await s.request('GET', '/api/session')).status).toBe(401);
  });
});

describe('data endpoints', () => {
  it('returns the full store and syncs changes', async () => {
    const s = await startServer();
    await s.login();
    const store = (await s.request('GET', '/api/store')).json;
    expect(Object.keys(store.lists)).toHaveLength(4);

    const task = newTask(
      { title: 'From client', listId: store.settings.defaultListId },
      new Date().toISOString(),
    );
    const r = await s.request('POST', '/api/sync', {
      sinceRev: 0,
      epoch: store.epoch,
      changes: { ...empty, tasks: [task] },
    });
    expect(r.status).toBe(200);
    expect(r.json.rev).toBe(1);
    expect(r.json.changes.tasks[0].id).toBe(task.id);
    expect(r.json.changes.tasks[0].rev).toBe(1);
  });

  it('rejects invalid changes with 400 and persists nothing', async () => {
    const s = await startServer();
    await s.login();
    const bad = {
      ...newTask({ title: 'x', listId: 'l_nope' }, new Date().toISOString()),
      status: 'weird',
    };
    const r = await s.request('POST', '/api/sync', {
      sinceRev: 0,
      changes: { ...empty, tasks: [bad] },
    });
    expect(r.status).toBe(400);
    expect(s.manager.store.rev).toBe(0);
    expect((await s.request('POST', '/api/sync', undefined, { raw: '{not json' })).status).toBe(
      400,
    );
  });

  it('returns 409 with the new epoch when the store was replaced', async () => {
    const s = await startServer();
    await s.login();
    const r = await s.request('POST', '/api/sync', { sinceRev: 0, epoch: 'stale', changes: empty });
    expect(r.status).toBe(409);
    expect(r.json.epoch).toBe(s.manager.store.epoch);
  });

  it('exports the store as a download', async () => {
    const s = await startServer();
    await s.login();
    const r = await s.request('GET', '/api/export');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="frog-store-/);
    expect(r.json.schemaVersion).toBe(1);
  });

  it('imports a valid store after backing up the current one', async () => {
    const s = await startServer();
    await s.login();
    const exported = (await s.request('GET', '/api/export')).json;
    const oldEpoch = exported.epoch;
    const task = newTask(
      { title: 'Imported', listId: exported.settings.defaultListId },
      new Date().toISOString(),
    );
    exported.tasks[task.id] = task;

    const r = await s.request('POST', '/api/import', exported);
    expect(r.status).toBe(200);
    expect(r.json.epoch).not.toBe(oldEpoch);
    expect(s.manager.store.tasks[task.id]?.title).toBe('Imported');
    const backups = await readdir(path.join(s.dataDir, 'backups', 'pre-import'));
    expect(backups).toHaveLength(1);
  });

  it('rejects a malformed import and leaves data untouched', async () => {
    const s = await startServer();
    await s.login();
    const before = JSON.stringify(s.manager.store);
    const r = await s.request('POST', '/api/import', { schemaVersion: 1, lists: 'nope' });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/not a valid Frog export/);
    expect(JSON.stringify(s.manager.store)).toBe(before);
  });

  it('sets security headers', async () => {
    const s = await startServer();
    const r = await s.request('GET', '/api/health');
    expect(r.headers.get('content-security-policy')).toMatch(/default-src 'self'/);
    expect(r.headers.get('strict-transport-security')).toMatch(/max-age=/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
  });
});
