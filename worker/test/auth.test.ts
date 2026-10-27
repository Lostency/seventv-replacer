import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '../../shared/types';
import { call, mockOutbound, signIn, twitchHandlers } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('Twitch sign-in', () => {
  it('sends the visitor to Twitch with a state it remembers', async () => {
    const res = await call('/api/auth/login?return=/compare');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://id.twitch.tv/oauth2/authorize');
    expect(location.searchParams.get('client_id')).toBe('test-client');
    expect(location.searchParams.get('redirect_uri')).toBe('https://x/api/auth/callback');
    expect(res.headers.get('set-cookie')).toContain(`ser_oauth=${location.searchParams.get('state')}`);
  });

  it('signs in, reports who is signed in, and signs out', async () => {
    const cookie = await signIn('niena');
    const me = await (await call('/api/me', { headers: { Cookie: cookie } })).json<MeResponse>();
    expect(me).toEqual({ user: { login: 'niena', displayName: 'niena', admin: true }, signInAvailable: true });

    const out = await call('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    expect(out.status).toBe(204);
    const after = await (await call('/api/me', { headers: { Cookie: cookie } })).json<MeResponse>();
    expect(after.user).toBeNull();
  });

  it('is nobody without a session', async () => {
    expect(await (await call('/api/me')).json()).toEqual({ user: null, signInAvailable: true });
  });

  it('refuses a callback whose state does not match', async () => {
    mockOutbound(twitchHandlers());
    const res = await call('/api/auth/callback?code=abc&state=forged', { headers: { Cookie: 'ser_oauth=real|/compare' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/compare?signin=expired');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('ser_session='))).toBe(false);
  });

  it('goes back quietly when the visitor cancels on Twitch', async () => {
    const res = await call('/api/auth/callback?error=access_denied&state=s', { headers: { Cookie: 'ser_oauth=s|/compare' } });
    expect(res.headers.get('location')).toBe('/compare?signin=cancelled');
  });

  it('never redirects off-site after sign-in', async () => {
    const res = await call('/api/auth/login?return=//evil.example');
    expect(res.headers.get('set-cookie')).toContain('%7C%2Fcompare');
  });
});
