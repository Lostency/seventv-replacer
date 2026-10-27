import { exports } from 'cloudflare:workers';
import { vi } from 'vitest';

// Manual redirects: the sign-in routes answer with redirects the tests inspect, never follow.
export const call = (path: string, init?: RequestInit) =>
  exports.default.fetch(`https://x${path}`, { redirect: 'manual', ...init });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Answers the Worker's outbound fetches by URL prefix; anything else fails like a network error. */
export function mockOutbound(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = Object.keys(handlers).find((prefix) => url.startsWith(prefix));
    if (!match) throw new TypeError(`Network error: ${url}`);
    return handlers[match]!(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const cookieValue = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

export const twitchHandlers = (login = 'viewer', id = 'T1') => ({
  'https://id.twitch.tv/oauth2/token': () => json({ access_token: 'twitch-access' }),
  'https://api.twitch.tv/helix/users': () => json({ data: [{ id, login, display_name: login }] }),
});

/** Runs the real sign-in round trip against a mocked Twitch and returns the session cookie. */
export async function signIn(login = 'viewer', extra: Record<string, Handler> = {}): Promise<string> {
  mockOutbound({ ...twitchHandlers(login), ...extra });
  const start = await call('/api/auth/login?return=/compare');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const stateCookie = cookieValue(start, 'ser_oauth')!;
  const done = await call(`/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: stateCookie } });
  return cookieValue(done, 'ser_session')!;
}
