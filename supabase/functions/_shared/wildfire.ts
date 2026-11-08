export type ProspectSource = { title: string; url: string; snippet: string };
export type ProspectResult = {
  name: string; website: string; email: string; phone: string; location: string;
  summary: string; fit_reason: string; source_urls: string[];
};

export const publicSearchQuery = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    throw new Error('Enter an explicit public search query of 1–500 characters.');
  }
  return value.trim();
};

export const webUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
};

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const groundedNarrative = (value: unknown, max: number, evidence: string, urls: string[]) => text(value, max)
  .replace(/https?:\/\/[^\s<>")\]]+/gi, (url) => urls.includes(webUrl(url) || '') ? url : '[unsupported URL removed]')
  .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, (email) =>
    evidence.toLowerCase().includes(email.toLowerCase()) ? email : '[unsupported email removed]')
  .replace(/\+?\d[\d ().-]{5,}\d/g, (phone) => {
    const digits = phone.replace(/\D/g, '');
    return (evidence.match(/\+?\d[\d ().-]{5,}\d/g) || []).some((item) => item.replace(/\D/g, '') === digits)
      ? phone : '[unsupported phone removed]';
  });

export const validateProspects = (value: unknown, sources: ProspectSource[], count: number): ProspectResult[] => {
  const results = (value as { results?: unknown })?.results;
  if (!Array.isArray(results)) throw new Error('The research model returned an invalid results payload.');
  const byUrl = new Map(sources.map((source) => [webUrl(source.url), source]));
  const seen = new Set<string>();
  return results.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const urls = Array.isArray(row.source_urls) ? [...new Set(row.source_urls.map(webUrl).filter((url): url is string => !!url && byUrl.has(url)))] : [];
    const cited = urls.map((url) => byUrl.get(url)!);
    const evidence = cited.map((source) => `${source.title} ${source.snippet}`).join('\n');
    const name = text(row.name, 200);
    if (normalized(name).length < 2 || !cited.length || !normalized(evidence).includes(normalized(name)) || seen.has(normalized(name))) return [];
    seen.add(normalized(name));
    const website = webUrl(row.website);
    const email = text(row.email, 254).toLowerCase();
    const evidencedEmails = evidence.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
    const phone = text(row.phone, 80);
    const phoneDigits = phone.replace(/\D/g, '');
    const evidencedPhones = evidence.match(/\+?\d[\d ().-]{5,}\d/g) || [];
    const location = text(row.location, 200);
    return [{
      name,
      website: website && byUrl.has(website) ? website : '',
      email: email && evidencedEmails.includes(email) ? email : '',
      phone: phoneDigits.length >= 7 && evidencedPhones.some((candidate) => candidate.replace(/\D/g, '') === phoneDigits) ? phone : '',
      location: location && evidence.toLowerCase().includes(location.toLowerCase()) ? location : '',
      summary: `${groundedNarrative(row.summary, 2000, evidence, urls)}\n\n${cited.map((source) => `[${source.url}] ${source.snippet.slice(0, 350)}`).join('\n')}`.trim(),
      fit_reason: groundedNarrative(row.fit_reason, 1500, evidence, urls),
      source_urls: urls,
    }];
  }).slice(0, count);
};

export const validateSigner = (body: Record<string, unknown>) => {
  const name = text(body.name, 201);
  const email = text(body.email, 255).toLowerCase();
  if (name.length < 2 || name.length > 200 || email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.acknowledged !== true) {
    throw new Error('Enter your name and email and explicitly acknowledge the quote terms.');
  }
  return { name, email };
};

export const validateSignaturePng = (bytes: Uint8Array) => {
  const header = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || !header.every((value, index) => bytes[index] === value)) throw new Error('Invalid PNG signature.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8; let imageData = false; let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (offset + 12 + length > bytes.length) throw new Error('Truncated PNG signature.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw new Error('Invalid PNG signature header.');
      const width = view.getUint32(offset + 8); const height = view.getUint32(offset + 12);
      if (!width || !height || width > 4096 || height > 4096 || width * height > 4_000_000) throw new Error('Signature dimensions are too large.');
    }
    if (type === 'IDAT' && length > 0) imageData = true;
    offset += length + 12;
    if (type === 'IEND') { ended = length === 0 && offset === bytes.length; break; }
  }
  if (!imageData || !ended) throw new Error('Incomplete PNG signature.');
};

export const quoteToken = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Invalid quote link.');
  return value;
};
