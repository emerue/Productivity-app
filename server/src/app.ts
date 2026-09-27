import { StoreSchema, SyncRequestSchema, type Store } from '@frog/shared';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { createAuth } from './auth.js';
import type { Config } from './config.js';
import { runMigrations } from './migrations/index.js';
import { backupStore } from './store/backups.js';
import {
  consoleLogger,
  InvalidChangeError,
  SyncConflictError,
  type Logger,
  type StoreManager,
} from './store/manager.js';

export interface AppDeps {
  config: Config;
  manager: StoreManager;
  logger?: Logger;
}

const noCache = (res: Response) => res.setHeader('Cache-Control', 'no-cache');

export function createApp({ config, manager, logger = consoleLogger }: AppDeps) {
  const app = express();
  const auth = createAuth(config);

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser(config.sessionSecret));

  const api = express.Router();
  api.use(express.json({ limit: '5mb' }));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: manager.healthy, rev: manager.store.rev, version: config.version });
  });
  api.post('/login', auth.loginLimiter, auth.login);
  api.post('/logout', auth.logout);

  api.use(auth.requireAuth);

  api.get('/session', (_req, res) => {
    res.json({ ok: true });
  });

  api.get('/store', (_req, res) => {
    res.json(manager.store);
  });

  api.post('/sync', (req, res) => {
    const body = SyncRequestSchema.parse(req.body);
    res.json(manager.sync(body));
  });

  api.get('/export', (_req, res) => {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="frog-store-${stamp}.json"`);
    res.type('application/json').send(JSON.stringify(manager.store, null, 2));
  });

  api.post('/import', async (req, res) => {
    let incoming: Store;
    try {
      incoming = StoreSchema.parse(runMigrations(req.body as Record<string, unknown>));
    } catch (err) {
      const detail = err instanceof ZodError ? summarise(err) : (err as Error).message;
      res
        .status(400)
        .json({ error: `This file is not a valid Frog export. Nothing was changed. (${detail})` });
      return;
    }
    await backupStore(manager, config.dataDir, 'pre-import');
    const store = await manager.replace(incoming);
    logger.info(`Imported store (rev ${store.rev})`);
    res.json({ ok: true, rev: store.rev, epoch: store.epoch });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use('/api', api);

  // Built client. Hashed assets are immutable; entry points must revalidate.
  if (existsSync(config.clientDist)) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders: (res, file) => {
          const rel = path.relative(config.clientDist, file).replaceAll('\\', '/');
          if (rel.startsWith('assets/'))
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (rel === 'sw.js' || rel.endsWith('.webmanifest') || rel.endsWith('.html'))
            noCache(res);
          else res.setHeader('Cache-Control', 'public, max-age=604800');
        },
      }),
    );
    app.get('/{*splat}', (_req, res) => {
      noCache(res);
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: `Invalid request: ${summarise(err)}` });
      return;
    }
    if (err instanceof SyncConflictError) {
      res.status(409).json({ error: err.message, epoch: err.epoch });
      return;
    }
    if (err instanceof InvalidChangeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const status = (err as { status?: number }).status;
    if (status === 413) {
      res.status(413).json({ error: 'Request is larger than 5 MB.' });
      return;
    }
    if (status === 400) {
      res.status(400).json({ error: 'Request body is not valid JSON.' });
      return;
    }
    logger.error('Unhandled error', err);
    res
      .status(500)
      .json({ error: 'Server error. Your changes are safe on this device; try again shortly.' });
  };
  app.use(onError);

  return app;
}

function summarise(err: ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
    .join('; ');
}
