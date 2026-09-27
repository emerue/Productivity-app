import bcrypt from 'bcrypt';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from './config.js';

export const SESSION_COOKIE = 'frog_session';
const DAY_MS = 86_400_000;
const SESSION_MS = 90 * DAY_MS;
/** Sessions with less than this left are renewed on use. */
const RENEW_BELOW_MS = 60 * DAY_MS;

const LoginSchema = z.object({ password: z.string().min(1).max(1000) });

export function createAuth(config: Config) {
  const cookieOptions = {
    signed: true,
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict' as const,
    path: '/',
  };

  const issue = (res: Response) => {
    res.cookie(SESSION_COOKIE, String(Date.now() + SESSION_MS), {
      ...cookieOptions,
      maxAge: SESSION_MS,
    });
  };

  /** Expiry of a valid session, or null. */
  const sessionExpiry = (req: Request): number | null => {
    const value: unknown = req.signedCookies?.[SESSION_COOKIE];
    const exp = typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(exp) && exp > Date.now() ? exp : null;
  };

  const requireAuth: RequestHandler = (req, res, next) => {
    const exp = sessionExpiry(req);
    if (exp === null) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    if (exp - Date.now() < RENEW_BELOW_MS) issue(res);
    next();
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Wait 15 minutes, then try again.' },
  });

  const login = async (req: Request, res: Response, _next: NextFunction) => {
    const body = LoginSchema.safeParse(req.body);
    const ok = body.success && (await bcrypt.compare(body.data.password, config.passwordHash));
    if (!ok) {
      res.status(401).json({ error: 'That password is not right. Try again.' });
      return;
    }
    issue(res);
    res.status(204).end();
  };

  const logout: RequestHandler = (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions, signed: undefined });
    res.status(204).end();
  };

  return { requireAuth, loginLimiter, login, logout };
}
