import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from './env';

export const SESSION_COOKIE = 'ser_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  twitchId: string;
  login: string;
  displayName: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** The database only ever holds this hash, so a leaked table can't sign anyone in. */
async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export async function startSession(c: Context<AppEnv>, user: SessionUser): Promise<void> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.DB.prepare(
    'INSERT INTO sessions (id_hash, twitch_id, login, display_name, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await hashToken(token), user.twitchId, user.login, user.displayName, expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function readSession(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT twitch_id AS twitchId, login, display_name AS displayName
       FROM sessions WHERE id_hash = ? AND expires_at > ?`,
  )
    .bind(await hashToken(token), new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await hashToken(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

export function isAdmin(env: Env, login: string): boolean {
  return (env.ADMIN_LOGINS ?? '')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await readSession(c);
  if (!user) return c.json({ error: 'Sign in with Twitch to compare sets.' }, 401);
  c.set('user', user);
  await next();
};
