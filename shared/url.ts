/**
 * Pure URL validation shared by the Worker API and the browser form.
 * DNS resolution and redirect re-validation live in the Worker (see
 * `worker/lib/ssrf.ts`) because they need network access.
 */

export type UrlErrorCode =
  | 'invalid_url'
  | 'unsupported_protocol'
  | 'credentials_not_allowed'
  | 'blocked_host'
  | 'private_address'
  | 'invalid_port'
  | 'too_long'
  | 'unresolvable';

export type UrlValidationResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; code: UrlErrorCode; message: string };

export const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
export const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home.arpa',
  '.corp',
  '.private',
  '.test',
  '.invalid',
  '.example',
  '.onion',
  '.alt',
];

/** 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, link-local, CGNAT, reserved. */
export function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.');
  if (octets.length !== 4) return true;
  const nums = octets.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a = -1, b = -1] = nums;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 88 && nums[2] === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && nums[2] === 100) return true;
  if (a === 203 && b === 0 && nums[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** Only global-unicast IPv6 is allowed; mapped/loopback/ULA/link-local/docs are rejected. */
export function isPrivateIpv6(rawIp: string): boolean {
  const ip = rawIp.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ip.includes(':')) return true;
  if (ip === '::' || ip === '::1') return true;

  const firstGroup = ip.split(':')[0] ?? '';
  if (!/^[0-9a-f]{1,4}$/.test(firstGroup)) {
    // Covers "::ffff:127.0.0.1" and other compressed leading forms.
    return true;
  }
  const first = Number.parseInt(firstGroup, 16);
  const firstNibble = first >> 12;
  if (firstNibble !== 2 && firstNibble !== 3) return true;

  // Documented, benchmarking, ORCHID, Teredo, 6to4 and documentation prefixes.
  if (first === 0x2001) {
    const second = Number.parseInt(ip.split(':')[1] ?? '', 16);
    if (second === 0x0db8) return true;
    if (second === 0x0000) return true;
    if (second === 0x0002) return true;
    if (second === 0x0010 || second === 0x0020) return true;
  }
  if (first === 0x2002) return true;
  if (first === 0x3fff) return true;
  return false;
}

/** Accepts a bare IPv4/IPv6 address; anything unparseable is treated as blocked. */
export function isBlockedAddress(address: string): boolean {
  const value = address.trim().replace(/^\[|\]$/g, '');
  if (value.includes(':')) return isPrivateIpv6(value);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return isPrivateIpv4(value);
  return true;
}

function parseIpv4Shorthand(hostname: string): string | null {
  // Decimal/hex/octal IPv4 notations are never public websites. Report them as
  // addresses so the caller blocks them instead of attempting a DNS lookup.
  if (/^\d+$/.test(hostname)) return '0.0.0.0';
  if (/^0x[0-9a-f]+$/i.test(hostname)) return '0.0.0.0';
  const dotted = hostname.split('.');
  if (dotted.length === 4 && dotted.every((part) => /^(0x[0-9a-f]+|\d+)$/i.test(part))) {
    if (dotted.some((part) => /^0x/i.test(part))) return '0.0.0.0';
    return dotted.join('.');
  }
  return null;
}

export function validateWebsiteUrl(raw: string): UrlValidationResult {
  const input = raw.trim();
  if (!input) {
    return { ok: false, code: 'invalid_url', message: 'Enter a website URL.' };
  }
  if (input.length > MAX_URL_LENGTH) {
    return { ok: false, code: 'too_long', message: 'URL is too long (maximum 2048 characters).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, code: 'invalid_url', message: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'unsupported_protocol', message: 'Only http:// and https:// URLs are supported.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: 'credentials_not_allowed', message: 'URLs containing credentials are not allowed.' };
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return {
      ok: false,
      code: 'invalid_port',
      message: 'Only ports 80, 443, 8080 and 8443 are allowed.',
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    return { ok: false, code: 'invalid_url', message: 'The URL is missing a hostname.' };
  }

  const shorthand = parseIpv4Shorthand(hostname);
  const isIpv6Literal = hostname.startsWith('[') && hostname.endsWith(']');
  if (shorthand) {
    if (isBlockedAddress(shorthand)) {
      return {
        ok: false,
        code: 'private_address',
        message: 'Private, loopback and reserved IP addresses cannot be monitored.',
      };
    }
  } else if (isIpv6Literal) {
    if (isBlockedAddress(hostname)) {
      return {
        ok: false,
        code: 'private_address',
        message: 'Private, loopback and reserved IP addresses cannot be monitored.',
      };
    }
  } else {
    if (BLOCKED_HOSTS.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
      return {
        ok: false,
        code: 'blocked_host',
        message: 'Localhost, private networks and internal hostnames cannot be monitored.',
      };
    }
    if (!hostname.includes('.')) {
      return {
        ok: false,
        code: 'blocked_host',
        message: 'Use a public domain name, for example https://example.com.',
      };
    }
    if (/[^a-z0-9.\-_]/.test(hostname)) {
      return { ok: false, code: 'invalid_url', message: 'The hostname contains unsupported characters.' };
    }
  }

  parsed.hash = '';
  return { ok: true, url: parsed.toString(), hostname: parsed.hostname.toLowerCase() };
}

export function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
