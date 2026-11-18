import { afterEach, describe, expect, it, vi } from 'vitest';
import { performCheck } from '../worker/services/monitor';

const PUBLIC_IPV4 = '93.184.216.34';
const PUBLIC_IPV6 = '2606:2800:220:1:248:1893:25c8:1946';

function dohResponse(hostname: string, type: string): Response {
  if (hostname === 'internal.example') {
    return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '10.0.0.5' }] : [] });
  }
  if (hostname === 'loopback.example') {
    return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '127.0.0.1' }] : [] });
  }
  if (hostname === 'does-not-resolve-uptimeguard-12345.com') {
    return Response.json({ Status: 3 });
  }
  return Response.json({
    Status: 0,
    Answer: type === 'A' ? [{ type: 1, data: PUBLIC_IPV4 }] : [{ type: 28, data: PUBLIC_IPV6 }],
  });
}

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      const parsed = new URL(url);
      return dohResponse(parsed.searchParams.get('name') ?? '', parsed.searchParams.get('type') ?? 'A');
    }
    return handler(url, init);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('performCheck', () => {
  it('records a successful 200 response and its duration', async () => {
    installFetch(async () => new Response('ok', { status: 200 }));

    const outcome = await performCheck('https://example.com');

    expect(outcome.isUp).toBe(true);
    expect(outcome.result).toBe('success');
    expect(outcome.statusCode).toBe(200);
    expect(outcome.errorMessage).toBeNull();
    expect(outcome.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('distinguishes an HTTP application error from a connection failure', async () => {
    installFetch(async () => new Response('nope', { status: 503 }));

    const outcome = await performCheck('https://example.com');

    expect(outcome.isUp).toBe(false);
    expect(outcome.result).toBe('http_error');
    expect(outcome.statusCode).toBe(503);
    expect(outcome.errorMessage).toContain('503');
  });

  it('classifies timeouts', async () => {
    installFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });

    const outcome = await performCheck('https://example.com');

    expect(outcome.isUp).toBe(false);
    expect(outcome.result).toBe('timeout');
    expect(outcome.statusCode).toBeNull();
  });

  it('classifies connection errors', async () => {
    installFetch(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    });

    const outcome = await performCheck('https://example.com');

    expect(outcome.isUp).toBe(false);
    expect(outcome.result).toBe('connection_error');
    expect(outcome.errorMessage).toContain('ECONNREFUSED');
  });

  it('blocks domains that resolve to private addresses before making a request', async () => {
    const mock = installFetch(async () => new Response('should not happen', { status: 200 }));

    const outcome = await performCheck('https://internal.example');

    expect(outcome.isUp).toBe(false);
    expect(outcome.result).toBe('blocked');
    expect(mock.mock.calls.some(([url]) => String(url).includes('internal.example/'))).toBe(false);
  });

  it('blocks loopback resolutions', async () => {
    installFetch(async () => new Response('should not happen', { status: 200 }));
    const outcome = await performCheck('https://loopback.example');
    expect(outcome.result).toBe('blocked');
  });

  it('reports unresolvable domains as connection errors', async () => {
    installFetch(async () => new Response('should not happen', { status: 200 }));
    const outcome = await performCheck('https://does-not-resolve-uptimeguard-12345.com');
    expect(outcome.result).toBe('connection_error');
    expect(outcome.errorMessage).toContain('does not resolve');
  });

  it('never requests a private host from a redirect', async () => {
    const requested: string[] = [];
    installFetch(async (url) => {
      requested.push(url);
      if (url === 'https://example.com/') {
        return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
      }
      return new Response('ok', { status: 200 });
    });

    const outcome = await performCheck('https://example.com/');

    expect(outcome.isUp).toBe(false);
    expect(outcome.result).toBe('blocked');
    expect(requested.some((url) => url.includes('127.0.0.1'))).toBe(false);
  });

  it('follows safe redirects and records the final URL', async () => {
    installFetch(async (url) => {
      if (url === 'https://example.com/') {
        return new Response(null, { status: 301, headers: { location: 'https://www.example.com/' } });
      }
      return new Response('ok', { status: 200 });
    });

    const outcome = await performCheck('https://example.com/');

    expect(outcome.isUp).toBe(true);
    expect(outcome.redirectedTo).toBe('https://www.example.com/');
  });

  it('rejects non-http(s) redirect targets', async () => {
    installFetch(async (url) => {
      if (url === 'https://example.com/') {
        return new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } });
      }
      return new Response('ok', { status: 200 });
    });

    const outcome = await performCheck('https://example.com/');
    expect(outcome.result).toBe('blocked');
  });
});
