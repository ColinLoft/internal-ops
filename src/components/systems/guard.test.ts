import { describe, expect, it } from 'vitest';
import { isPublicAddress, validateAddresses, validateEndpoint } from '../../../supabase/functions/systems-monitor/guard';

describe('server-side SSRF boundary', () => {
  it.each(['127.0.0.1','0.0.0.0','10.2.3.4','100.64.0.1','169.254.169.254','172.16.1.1','192.168.1.1',
    '192.0.0.9','192.0.2.1','198.18.1.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255',
    '::1','::ffff:8.8.8.8','fc00::1','fe80::1','ff02::1','64:ff9b::1','2001:db8::1','2002:0808:0808::1','2001::1','3fff::1',
    '2606::::1111','2606:4700:4700::xyz','2606:4700:4700:1'])('rejects reserved/invalid %s', ip => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])('accepts public %s', ip => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it('rejects mixed public/private DNS answers', () => {
    expect(() => validateAddresses([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }])).toThrow();
    expect(() => validateAddresses([])).toThrow();
  });
  it.each(['https://0x7f000001','https://0177.0.0.1','https://[2606:4700::1111]','https://a.b.local','https://flown.org:444',
    'https://metadata.google.internal','https://a:b@flown.org','https://flown.org/#x','file:///etc/passwd'])('blocks URL %s', value => {
    expect(() => validateEndpoint(value)).toThrow();
  });
});
