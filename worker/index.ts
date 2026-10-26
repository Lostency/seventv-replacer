import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
