// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  conversations: [{
    id: 'conversation-1',
    customer_id: 'customer-1',
    subject: 'Help with my account',
    status: 'open',
    channel: 'email',
    priority: 'normal',
    assignee_id: null,
    unread_staff: 1,
    last_message_at: '2026-11-01T10:00:00Z',
    last_message_preview: 'I need help signing in.',
    ticket_id: null,
  }],
  customers: [{
    id: 'customer-1',
    name: 'Avery Customer',
    email: 'avery@example.org',
    phone: null,
    organization: 'Example Co',
    notes: null,
    crm_contact_id: null,
    first_seen_at: '2026-11-01T10:00:00Z',
    last_seen_at: '2026-11-01T10:00:00Z',
  }],
  messages: [{
    id: 'message-1',
    sender_type: 'customer',
    sender_id: null,
    channel: 'email',
    body: 'I need help signing in.',
    created_at: '2026-11-01T10:00:00Z',
    email_attachments: [],
  }],
  updates: [] as Record<string, unknown>[],
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ currentUser: { id: 'staff-1' }, users: [{ id: 'staff-1', name: 'Staff One', systemRole: 'admin' }] }),
}));
vi.mock('../../lib/useAppAccess', () => ({ useAppAccess: () => ({ canEdit: true }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({
  useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); },
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, (...args: unknown[]) => unknown> = {
        select: () => query,
        order: () => query,
        range: async () => ({ data: mock.conversations, error: null }),
        in: async () => ({ data: mock.customers, error: null }),
        eq: () => query,
        is: () => query,
        limit: async () => ({ data: table === 'support_messages' ? mock.messages : [], error: null }),
        maybeSingle: async () => ({ data: table === 'crm_contacts' || table === 'crm_organizations' ? null : { id: 'conversation-1' }, error: null }),
        update: (patch: Record<string, unknown>) => {
          mock.updates.push(patch);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  },
}));

import { SupportPage } from './SupportPage';

describe('Support queue', () => {
  it('shows unassigned requests in one queue with customer/account details and a claim action', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<SupportPage />));
      expect(container.textContent).toContain('Unassigned');
      expect(container.textContent).toContain('Help with my account');
      expect(container.textContent).toContain('Avery Customer');

      const request = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Help with my account'));
      expect(request).toBeDefined();
      await act(async () => request?.click());
      expect(container.textContent).toContain('Claim request');
      expect(container.textContent).toContain('avery@example.org');
      expect(container.textContent).toContain('Example Co');

      const claim = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Claim request'));
      await act(async () => claim?.click());
      expect(mock.updates).toContainEqual({ assignee_id: 'staff-1' });
      expect(container.textContent).toContain('Staff One');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('honors the CRM conversation query parameter', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.history.replaceState(null, '', '/customers/support?conversation=conversation-1');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<SupportPage />));
      expect(container.textContent).toContain('I need help signing in.');
      expect(container.querySelector('[aria-label="Request status"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState(null, '', '/');
    }
  });

  it('resolves old ticket deep links to the bridged conversation', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mock.conversations[0].ticket_id = 'legacy-ticket-1';
    window.history.replaceState(null, '', '/help?ticket=legacy-ticket-1');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<SupportPage />));
      expect(container.textContent).toContain('Imported from a legacy support ticket');
      expect(container.textContent).toContain('I need help signing in.');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      mock.conversations[0].ticket_id = null;
      window.history.replaceState(null, '', '/');
    }
  });
});
