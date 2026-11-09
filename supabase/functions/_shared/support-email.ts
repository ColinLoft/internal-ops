const encoder = new TextEncoder();

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const equalBytes = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left[index] ^ right[index];
  return different === 0;
};

const toArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export async function verifyResendSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): Promise<boolean> {
  const id = headers.get('svix-id') || '';
  const timestamp = headers.get('svix-timestamp') || '';
  const signatures = headers.get('svix-signature') || '';
  if (!id || !/^\d+$/.test(timestamp) || !signatures || !secret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > toleranceSeconds) return false;

  const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(encodedSecret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = encoder.encode(`${id}.${timestamp}.${rawBody}`);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  return signatures.split(/\s+/).some((part) => {
    const [version, value] = part.split(',', 2);
    if (version !== 'v1' || !value) return false;
    try { return equalBytes(expected, decodeBase64(value)); } catch { return false; }
  });
}

export function extractEmailAddresses(value: unknown): string[] {
  const sources = Array.isArray(value) ? value : [value];
  const found = new Set<string>();
  for (const source of sources) {
    const text = typeof source === 'string'
      ? source
      : source && typeof source === 'object'
        ? String((source as Record<string, unknown>).email || '')
        : '';
    for (const match of text.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      found.add(match[0].toLowerCase());
    }
  }
  return [...found];
}

export function extractMessageIds(value: unknown): string[] {
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join(' ') : '';
  const bracketed = [...text.matchAll(/<([^<>\s]+)>/g)].map((match) => match[1]);
  const ids = bracketed.length ? bracketed : text.split(/[\s,]+/).map((part) => part.replace(/^<|>$/g, ''));
  return [...new Set(ids.map((id) => id.trim()).filter((id) => /^[^\s<>@]+@[^\s<>@]+$/.test(id)))].slice(0, 50);
}

export function conversationTokenFromRecipients(addresses: string[]): string | null {
  for (const address of addresses) {
    const match = address.match(/^team\+([a-f0-9]{32,96})@[^@]+$/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

const decodeEntities = (text: string) => text
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

export function plainTextFromEmail(email: Record<string, unknown>, maxLength = 10_000): string {
  const plain = typeof email.text === 'string' ? email.text.trim() : '';
  if (plain) return plain.slice(0, maxLength);
  const html = typeof email.html === 'string' ? email.html : '';
  return decodeEntities(html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/blockquote|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}
