import { describe, expect, it } from 'vitest';
import { isBlockedAddress, isPrivateIpv4, isPrivateIpv6, validateWebsiteUrl } from '@shared/url';

describe('validateWebsiteUrl', () => {
  it('accepts public http and https URLs', () => {
    expect(validateWebsiteUrl('https://example.com')).toMatchObject({ ok: true, hostname: 'example.com' });
    expect(validateWebsiteUrl('http://example.com/path?q=1')).toMatchObject({ ok: true });
    expect(validateWebsiteUrl('example.com')).toMatchObject({ ok: true, url: 'https://example.com/' });
    expect(validateWebsiteUrl('https://sub.example.co.uk/a/b')).toMatchObject({ ok: true });
  });

  it('strips fragments and rejects credentials', () => {
    const result = validateWebsiteUrl('https://example.com/page#section');
    expect(result.ok && result.url).toBe('https://example.com/page');
    expect(validateWebsiteUrl('https://user:pass@example.com')).toMatchObject({ ok: false, code: 'credentials_not_allowed' });
  });

  it('rejects unsupported protocols and ports', () => {
    expect(validateWebsiteUrl('ftp://example.com')).toMatchObject({ ok: false, code: 'unsupported_protocol' });
    expect(validateWebsiteUrl('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(validateWebsiteUrl('https://example.com:22')).toMatchObject({ ok: false, code: 'invalid_port' });
    expect(validateWebsiteUrl('https://example.com:8443')).toMatchObject({ ok: true });
  });

  it('blocks localhost, internal hostnames and single-label hosts', () => {
    expect(validateWebsiteUrl('http://localhost')).toMatchObject({ ok: false, code: 'blocked_host' });
    expect(validateWebsiteUrl('http://app.localhost:3000')).toMatchObject({ ok: false });
    expect(validateWebsiteUrl('http://metadata.google.internal')).toMatchObject({ ok: false, code: 'blocked_host' });
    expect(validateWebsiteUrl('http://router.local')).toMatchObject({ ok: false, code: 'blocked_host' });
    expect(validateWebsiteUrl('http://intranet')).toMatchObject({ ok: false, code: 'blocked_host' });
    expect(validateWebsiteUrl('http://example.test')).toMatchObject({ ok: false });
  });

  it('blocks private and reserved IPv4 literals in any notation', () => {
    for (const host of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '2130706433',
      '0x7f000001',
      '0177.0.0.1',
    ]) {
      const result = validateWebsiteUrl(`http://${host}/`);
      expect(result.ok, host).toBe(false);
    }
  });

  it('allows public IP literals', () => {
    expect(validateWebsiteUrl('http://8.8.8.8/')).toMatchObject({ ok: true });
    expect(validateWebsiteUrl('http://[2606:2800:220:1:248:1893:25c8:1946]/')).toMatchObject({ ok: true });
  });

  it('blocks loopback, ULA and link-local IPv6', () => {
    for (const host of ['[::1]', '[::]', '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[::ffff:127.0.0.1]']) {
      expect(validateWebsiteUrl(`http://${host}/`).ok, host).toBe(false);
    }
  });

  it('rejects empty and overly long input', () => {
    expect(validateWebsiteUrl('   ')).toMatchObject({ ok: false, code: 'invalid_url' });
    expect(validateWebsiteUrl(`https://example.com/${'a'.repeat(2100)}`)).toMatchObject({ ok: false, code: 'too_long' });
  });
});

describe('IP classification', () => {
  it('classifies reserved IPv4 ranges', () => {
    expect(isPrivateIpv4('192.168.0.1')).toBe(true);
    expect(isPrivateIpv4('172.31.255.255')).toBe(true);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
    expect(isPrivateIpv4('203.0.113.10')).toBe(true);
    expect(isPrivateIpv4('8.8.4.4')).toBe(false);
  });

  it('classifies reserved IPv6 ranges', () => {
    expect(isPrivateIpv6('::1')).toBe(true);
    expect(isPrivateIpv6('fe80::abcd')).toBe(true);
    expect(isPrivateIpv6('fd00::1')).toBe(true);
    expect(isPrivateIpv6('2001:db8::1')).toBe(true);
    expect(isPrivateIpv6('2606:4700:4700::1111')).toBe(false);
  });

  it('treats unparseable addresses as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
  });
});
