import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const get = (path: string) => exports.default.fetch(`https://x${path}`);

describe('api', () => {
  it('GET /api/health answers ok', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers unknown /api paths with JSON 404', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
