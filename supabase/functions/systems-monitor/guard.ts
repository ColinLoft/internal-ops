export class UnsafeEndpoint extends Error {}

export function validateEndpoint(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeEndpoint('Invalid endpoint URL.'); }
  const host = url.hostname.toLowerCase();
  if (value.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.hash
    || (url.port && url.port !== '443') || !host.includes('.') || host.endsWith('.')
    || !/^[a-z0-9.-]+$/.test(host) || /^[\d.]+$/.test(host)
    || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)
    || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new UnsafeEndpoint('Only public HTTPS hostnames on port 443 are allowed.');
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  if (address.includes(':')) {
    // Only global unicast. Reject transition/documentation/protocol assignment space,
    // mapped IPv4, zones, local, multicast, NAT64 and future/reserved ranges.
    const halves = address.toLowerCase().split('::');
    if (halves.length > 2) return false;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const explicit = [...left, ...right];
    if (explicit.some(part => !/^[a-f0-9]{1,4}$/.test(part))
      || (halves.length === 1 ? explicit.length !== 8 : explicit.length >= 8)) return false;
    const expanded = halves.length === 2 ? [...left, ...Array(8 - explicit.length).fill('0'), ...right] : left;
    const [first, second] = expanded.map(part => parseInt(part, 16));
    return first >= 0x2000 && first <= 0x3fff
      && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
      && first !== 0x2002 && !(first === 0x3fff && second < 0x1000);
  }
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b, c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

export function validateAddresses(addresses: { address: string; family: number }[]) {
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new UnsafeEndpoint('DNS returned a non-public or reserved address.');
  }
  return addresses.find(item => item.family === 4) || addresses[0];
}
