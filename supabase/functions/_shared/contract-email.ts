export type ContractEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  attachments?: { filename: string; content: string }[];
};

export type ContractEmailResult = { sent: true; emailId: string | null } | { sent: false; error: string };

export const deliverContractEmail = async (
  email: ContractEmail,
  options: { apiKey?: string; from?: string; fetcher?: typeof fetch } = {},
): Promise<ContractEmailResult> => {
  const apiKey = options.apiKey ?? Deno.env.get('RESEND_API_KEY');
  const from = options.from ?? Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from) {
    return { sent: false, error: 'Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.' };
  }
  if (!/(^|<)team@flown\.org(?:>|$)/i.test(from.trim())) {
    return { sent: false, error: 'RESEND_FROM_EMAIL must use the verified team@flown.org sender address.' };
  }
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: from.trim(),
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.attachments?.length ? { attachments: email.attachments } : {}),
      }),
    });
  } catch {
    return { sent: false, error: 'Resend could not be reached. Retry delivery; the request has not been marked sent.' };
  }
  if (!response.ok) {
    return { sent: false, error: `Resend rejected the email (HTTP ${response.status}). Verify the sender domain and recipient address, then retry.` };
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  return { sent: true, emailId: typeof result.id === 'string' ? result.id : null };
};
