import { Hono } from 'hono';
import { admin } from './routes/admin';
import { auth, me } from './routes/auth';
import { comparisons } from './routes/comparisons';
import { presets } from './routes/presets';
import { stats } from './routes/stats';
import type { AppEnv } from './session';

export const app = new Hono<AppEnv>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));
app.route('/presets', presets);
app.route('/stats', stats);
app.route('/auth', auth);
app.route('/me', me);
app.route('/comparisons', comparisons);
app.route('/admin', admin);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
