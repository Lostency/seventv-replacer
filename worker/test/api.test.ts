import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { PresetResponse } from '../../shared/types';

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

  it('serves a seeded preset', async () => {
    const res = await get('/api/presets/halloween');
    const body = await res.json<PresetResponse>();
    expect(res.status).toBe(200);
    expect(body.season).toBe('halloween');
    expect(body.mappings).toHaveLength(275);
    expect(body.mappings[0]).toEqual({ originalId: expect.any(String), replacementId: expect.any(String) });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('404s an unknown season as JSON', async () => {
    const res = await get('/api/presets/easter');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Unknown season' });
  });

  it('counts mappings per season', async () => {
    const res = await get('/api/stats');
    expect(await res.json()).toEqual({ mappings: { halloween: 275, winter: 568 } });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('reports 0 for a season without mappings', async () => {
    await env.DB.prepare("DELETE FROM mappings WHERE season = 'winter'").run();
    const res = await get('/api/stats');
    expect(await res.json()).toEqual({ mappings: { halloween: 275, winter: 0 } });
  });
});
