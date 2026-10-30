const HCB_API_BASE = 'https://hcb.hackclub.com/api/v3';

export type HcbOrganization = {
  id: string;
  name: string;
  slug?: string;
  href?: string;
  transparent?: boolean;
  balances?: {
    balance_cents?: number;
    incoming_balance_cents?: number;
    total_raised?: number;
  };
};

export type HcbTransaction = {
  id: string;
  href?: string;
  amount_cents?: number;
  memo?: string;
  date?: string;
  type?: string;
  pending?: boolean;
  receipts?: { count?: number; missing?: boolean };
  tags?: Array<{ id?: string; name?: string }>;
  organization?: HcbOrganization;
};

export type HcbDonation = {
  id: string;
  href?: string;
  amount_cents?: number;
  date?: string;
  memo?: string;
  organization?: HcbOrganization;
};

type HcbCollection<T> = {
  data?: T[];
  results?: T[];
  [key: string]: unknown;
};

const readCollection = <T>(payload: HcbCollection<T>): T[] => {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
};

const requestJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(`${HCB_API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`HCB API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
};

export const listTransparentOrganizations = (signal?: AbortSignal) =>
  requestJson<HcbCollection<HcbOrganization>>('/organizations', signal).then(readCollection);

export const getOrganization = (organizationId: string, signal?: AbortSignal) =>
  requestJson<HcbOrganization>(`/organizations/${encodeURIComponent(organizationId)}`, signal);

export const listOrganizationTransactions = async (
  organizationId: string,
  options: { perPage?: number; maxPages?: number; signal?: AbortSignal } = {},
): Promise<HcbTransaction[]> => {
  const perPage = Math.min(Math.max(options.perPage ?? 100, 1), 100);
  const maxPages = Math.max(options.maxPages ?? 20, 1);
  const records: HcbTransaction[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    const payload = await requestJson<HcbCollection<HcbTransaction>>(
      `/organizations/${encodeURIComponent(organizationId)}/transactions?${query.toString()}`,
      options.signal,
    );
    const batch = readCollection(payload);
    records.push(...batch);
    if (batch.length < perPage) break;
  }
  return records;
};

export const listOrganizationDonations = async (
  organizationId: string,
  options: { perPage?: number; maxPages?: number; signal?: AbortSignal } = {},
): Promise<HcbDonation[]> => {
  const perPage = Math.min(Math.max(options.perPage ?? 100, 1), 100);
  const maxPages = Math.max(options.maxPages ?? 20, 1);
  const records: HcbDonation[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    const payload = await requestJson<HcbCollection<HcbDonation>>(
      `/organizations/${encodeURIComponent(organizationId)}/donations?${query.toString()}`,
      options.signal,
    );
    const batch = readCollection(payload);
    records.push(...batch);
    if (batch.length < perPage) break;
  }
  return records;
};

export const normalizeHcbAmount = (amountCents: number | undefined): number | null =>
  typeof amountCents === 'number' && Number.isFinite(amountCents) ? amountCents / 100 : null;
