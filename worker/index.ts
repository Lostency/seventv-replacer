import { Hono } from 'hono';
import type { Env } from './env';
import { presets } from './routes/presets';
import { stats } from './routes/stats';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));
app.route('/presets', presets);
app.route('/stats', stats);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
