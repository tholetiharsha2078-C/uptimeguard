import { isBlockedAddress, validateWebsiteUrl, type UrlErrorCode } from '../../shared/url';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export class UnsafeTargetError extends Error {
  readonly code: 'blocked' | 'invalid_url' | 'unresolvable';

  constructor(code: 'blocked' | 'invalid_url' | 'unresolvable', message: string) {
    super(message);
    this.name = 'UnsafeTargetError';
    this.code = code;
  }
}

interface DohAnswer {
  type: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  return bare.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || /^\d+$/.test(bare);
}

async function queryDoh(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new UnsafeTargetError('unresolvable', 'Could not resolve the domain name.');
  }
  if (!response.ok) {
    throw new UnsafeTargetError('unresolvable', 'The DNS resolver is unavailable right now.');
  }
  const body = (await response.json()) as DohResponse;
  if (body.Status !== 0) {
    throw new UnsafeTargetError('unresolvable', 'The domain name does not resolve.');
  }
  const expectedType = type === 'A' ? 1 : 28;
  return (body.Answer ?? []).filter((answer) => answer.type === expectedType).map((answer) => answer.data);
}

/**
 * Resolves every A/AAAA record for a host and rejects the URL if any of them
 * points at a private, loopback, link-local or reserved address. Checking all
 * records (not just the first) blocks DNS-based bypasses.
 */
export async function assertSafeTarget(rawUrl: string): Promise<URL> {
  const validation = validateWebsiteUrl(rawUrl);
  if (!validation.ok) {
    throw new UnsafeTargetError(validation.code === 'invalid_url' ? 'invalid_url' : 'blocked', validation.message);
  }

  const url = new URL(validation.url);
  if (!isIpLiteral(url.hostname)) {
    const addresses = [...(await queryDoh(url.hostname, 'A')), ...(await queryDoh(url.hostname, 'AAAA'))];
    if (addresses.length === 0) {
      throw new UnsafeTargetError('unresolvable', 'The domain name has no public IP address.');
    }
    for (const address of addresses) {
      if (isBlockedAddress(address)) {
        throw new UnsafeTargetError(
          'blocked',
          'This domain resolves to a private, loopback or reserved address and cannot be monitored.',
        );
      }
    }
  }

  return url;
}

export function urlErrorMessage(error: unknown): { result: 'blocked' | 'invalid_url' | 'connection_error'; message: string } {
  if (error instanceof UnsafeTargetError) {
    if (error.code === 'invalid_url') return { result: 'invalid_url', message: error.message };
    if (error.code === 'unresolvable') return { result: 'connection_error', message: error.message };
    return { result: 'blocked', message: error.message };
  }
  return { result: 'connection_error', message: error instanceof Error ? error.message : 'Unknown error' };
}

export function isUserFacingUrlError(error: unknown): error is UnsafeTargetError {
  return error instanceof UnsafeTargetError;
}

export function unsafeCodeToApiCode(code: UnsafeTargetError['code']): string {
  return code === 'invalid_url' ? 'invalid_url' : code === 'unresolvable' ? 'unresolvable_domain' : 'unsafe_target';
}

export type { UrlErrorCode };
