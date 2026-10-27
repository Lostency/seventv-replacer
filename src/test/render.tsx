import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../routes';

let router: ReturnType<typeof createMemoryRouter> | undefined;

export function renderAt(path: string) {
  router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

export function currentPath(): string {
  const location = router?.state.location;
  return location ? `${location.pathname}${location.search}` : '';
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Answers fetch by URL prefix; anything unmatched rejects like a network failure. */
export function mockFetch(handlers: Record<string, Handler>) {
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

export function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
