import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { MeResponse } from '../../shared/types';
import type { Env } from '../env';
import { endSession, isAdmin, randomToken, readSession, startSession, type AppEnv } from '../session';

const STATE_COOKIE = 'ser_oauth';
const TWITCH_AUTHORIZE = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS = 'https://api.twitch.tv/helix/users';

/** Only same-site paths, so the sign-in round trip can't be turned into an open redirect. */
function safeReturn(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/compare';
}

function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, 'https://x');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

const signInConfigured = (env: Env) => Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);

export const auth = new Hono<AppEnv>();

auth.get('/login', (c) => {
  const clientId = c.env.TWITCH_CLIENT_ID;
  if (!clientId || !signInConfigured(c.env)) {
    return c.json({ error: 'Twitch sign-in isn’t set up on this server yet.' }, 503);
  }
  const state = randomToken();
  const returnTo = safeReturn(c.req.query('return'));
  setCookie(c, STATE_COOKIE, `${state}|${returnTo}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/api/auth',
    maxAge: 600,
  });
  const url = new URL(TWITCH_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/api/auth/callback', c.req.url).href,
    response_type: 'code',
    scope: '',
    state,
  }).toString();
  return c.redirect(url.href);
});

auth.get('/callback', async (c) => {
  const [expected, stored] = (getCookie(c, STATE_COOKIE) ?? '').split('|');
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth', secure: true });
  const returnTo = safeReturn(stored);
  const { code, state, error } = c.req.query();

  if (error) return c.redirect(withParam(returnTo, 'signin', 'cancelled'));
  if (!expected || !code || state !== expected) return c.redirect(withParam(returnTo, 'signin', 'expired'));

  const tokenResponse = await fetch(TWITCH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.TWITCH_CLIENT_ID ?? '',
      client_secret: c.env.TWITCH_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: new URL('/api/auth/callback', c.req.url).href,
    }),
  });
  const token = tokenResponse.ok ? await tokenResponse.json<{ access_token?: string }>() : null;
  if (!token?.access_token) return c.redirect(withParam(returnTo, 'signin', 'failed'));

  const usersResponse = await fetch(TWITCH_USERS, {
    headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': c.env.TWITCH_CLIENT_ID ?? '' },
  });
  const users = usersResponse.ok
    ? await usersResponse.json<{ data?: Array<{ id: string; login: string; display_name: string }> }>()
    : null;
  const user = users?.data?.[0];
  if (!user) return c.redirect(withParam(returnTo, 'signin', 'failed'));

  await startSession(c, { twitchId: user.id, login: user.login, displayName: user.display_name });
  return c.redirect(returnTo);
});

auth.post('/logout', async (c) => {
  await endSession(c);
  return c.body(null, 204);
});

export const me = new Hono<AppEnv>();

me.get('/', async (c) => {
  const user = await readSession(c);
  const body: MeResponse = {
    user: user && { login: user.login, displayName: user.displayName, admin: isAdmin(c.env, user.login) },
    signInAvailable: signInConfigured(c.env),
  };
  return c.json(body, 200, { 'Cache-Control': 'no-store' });
});
