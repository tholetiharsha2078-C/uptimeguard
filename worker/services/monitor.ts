import type { CheckResult } from '../../shared/types';
import { assertSafeTarget, UnsafeTargetError, urlErrorMessage } from '../lib/ssrf';

export const CHECK_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;

export interface CheckOutcome {
  checkedAt: number;
  statusCode: number | null;
  responseTimeMs: number | null;
  result: CheckResult;
  isUp: boolean;
  errorMessage: string | null;
  redirectedTo: string | null;
}

function statusText(status: number): string {
  const known: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    410: 'Gone',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    520: 'Web Server Returned an Unknown Error',
    521: 'Web Server Is Down',
    522: 'Connection Timed Out',
    523: 'Origin Is Unreachable',
    524: 'A Timeout Occurred',
    525: 'SSL Handshake Failed',
    526: 'Invalid SSL Certificate',
    530: 'Origin DNS Error',
  };
  return known[status] ?? 'HTTP error';
}

function cleanMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Body already consumed or unavailable; nothing to release.
  }
}

/**
 * Performs a single health check with a hard 10s budget, validated DNS for
 * every hop and manual redirect following so each Location is re-checked.
 * Never throws: failures are normalised into a CheckOutcome.
 */
export async function performCheck(rawUrl: string): Promise<CheckOutcome> {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  let currentUrl = rawUrl;
  let redirects = 0;
  let finalUrl: string | null = null;

  try {
    for (;;) {
      const safeUrl = await assertSafeTarget(currentUrl);
      finalUrl = safeUrl.href;

      const response = await fetch(safeUrl.href, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': 'UptimeGuard/1.0 (website health monitor)',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'cache-control': 'no-cache',
        },
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location && redirects < MAX_REDIRECTS) {
        await cancelBody(response);
        const next = new URL(location, safeUrl);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          throw new UnsafeTargetError('blocked', 'The site redirected to an unsupported protocol.');
        }
        currentUrl = next.href;
        redirects += 1;
        continue;
      }
      if (response.status >= 300 && response.status < 400 && location) {
        await cancelBody(response);
        const elapsed = Date.now() - startedAt;
        return {
          checkedAt: startedAt,
          statusCode: response.status,
          responseTimeMs: elapsed,
          result: 'connection_error',
          isUp: false,
          errorMessage: `Too many redirects (more than ${MAX_REDIRECTS}).`,
          redirectedTo: finalUrl,
        };
      }

      await cancelBody(response);
      const elapsed = Date.now() - startedAt;
      const isUp = response.status >= 200 && response.status < 400;

      return {
        checkedAt: startedAt,
        statusCode: response.status,
        responseTimeMs: elapsed,
        result: isUp ? 'success' : 'http_error',
        isUp,
        errorMessage: isUp ? null : `HTTP ${response.status} ${statusText(response.status)}`,
        redirectedTo: redirects > 0 ? finalUrl : null,
      };
    }
  } catch (error) {
    const elapsed = Date.now() - startedAt;

    if (error instanceof UnsafeTargetError) {
      const mapped = urlErrorMessage(error);
      return {
        checkedAt: startedAt,
        statusCode: null,
        responseTimeMs: null,
        result: mapped.result,
        isUp: false,
        errorMessage: cleanMessage(mapped.message),
        redirectedTo: redirects > 0 ? finalUrl : null,
      };
    }

    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        checkedAt: startedAt,
        statusCode: null,
        responseTimeMs: null,
        result: 'timeout',
        isUp: false,
        errorMessage: `The request timed out after ${CHECK_TIMEOUT_MS / 1000} seconds.`,
        redirectedTo: redirects > 0 ? finalUrl : null,
      };
    }

    return {
      checkedAt: startedAt,
      statusCode: null,
      responseTimeMs: elapsed,
      result: 'connection_error',
      isUp: false,
      errorMessage: cleanMessage(error instanceof Error ? error.message : 'Connection failed.') || 'Connection failed.',
      redirectedTo: redirects > 0 ? finalUrl : null,
    };
  }
}
