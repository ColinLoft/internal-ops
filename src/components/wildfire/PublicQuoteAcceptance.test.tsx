// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), celebrate: vi.fn() }));
vi.mock('../../lib/milestones', () => ({ celebrateMilestone: mock.celebrate }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: mock.invoke } } }));
import { PublicQuoteAcceptance } from './PublicQuoteAcceptance';
const snapshot = { quoteId: 'quote', version: 1, currency: 'USD', subtotal: 200, discount: 0, tax: 20, total: 220, terms: 'Delivery terms', proposal: 'Two cameras', lines: [{ description: 'Camera', quantity: 2, unit_price: 100, line_total: 200 }], prospect: { name: 'Prospect outside CRM' }, property: { label: 'Vineyard', address: 'Test address' } };
let root: Root;
let container: HTMLDivElement;
const fill = async (selector: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
describe('public quote acceptance', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mock.invoke.mockReset();
    mock.celebrate.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ fillStyle: '', fillRect: vi.fn(), strokeStyle: '', lineWidth: 0, lineCap: '', beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,testsignature');
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  const render = async (status = 'sent') => {
    mock.invoke.mockResolvedValue({ data: { snapshot, status, expiresAt: '2027-01-01T00:00:00Z' }, error: null });
    await act(async () => root.render(<PublicQuoteAcceptance token="capability-token" />));
  };
  it('renders the published customer snapshot rather than loading staff CRM data', async () => {
    await render();
    expect(mock.invoke).toHaveBeenCalledWith('wildfire-quotes', { body: { action: 'details', token: 'capability-token' } });
    expect(container.textContent).toContain('Prospect outside CRM');
    expect(container.textContent).toContain('Vineyard');
    expect(container.textContent).toContain('$220.00');
    expect(container.textContent).toContain('Delivery terms');
  });
  it('refuses acceptance without signature or explicit terms acknowledgement', async () => {
    await render();
    await fill('input[autocomplete=name]', 'Customer name');
    await fill('input[type=email]', 'customer@example.com');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('draw a signature');
  });
  it('shows previously accepted quotes without another acceptance form', async () => {
    await render('accepted');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Your signed acceptance is recorded.');
    expect(mock.celebrate).not.toHaveBeenCalled();
  });
  it('submits explicit consent and a drawn signature and requires a confirmed deployment', async () => {
    await render();
    await fill('input[autocomplete=name]', 'Customer name');
    await fill('input[type=email]', 'customer@example.com');
    await act(async () => {
      container.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    });
    mock.invoke.mockResolvedValue({ data: { status: 'accepted', deploymentId: 'deployment' }, error: null });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.invoke).toHaveBeenLastCalledWith('wildfire-quotes', { body: { action: 'accept', token: 'capability-token', name: 'Customer name', email: 'customer@example.com', signaturePng: 'data:image/png;base64,testsignature', acknowledged: true } });
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Your signed acceptance is recorded.');
    expect(mock.celebrate).toHaveBeenCalledExactlyOnceWith('quote', 'quote', 'sent', 'accepted');
  });
  it('test mode exercises the form without writing acceptance or creating a deployment', async () => {
    window.history.replaceState({}, '', '/?test=1');
    await render();
    await fill('input[autocomplete=name]', 'Customer name');
    await fill('input[type=email]', 'customer@example.com');
    await act(async () => {
      container.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.celebrate).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Nothing was saved and no deployment was created.');
  });
  it.each([
    { data: { status: 'accepted' }, error: null },
    { data: { error: 'Acceptance failed.' }, error: null },
    { data: null, error: { message: 'Network unavailable' } },
  ])('never celebrates incomplete or failed acceptance responses', async (response) => {
    await render();
    await fill('input[autocomplete=name]', 'Customer name');
    await fill('input[type=email]', 'customer@example.com');
    await act(async () => {
      container.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    });
    mock.invoke.mockResolvedValue(response);
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    expect(mock.celebrate).not.toHaveBeenCalled();
  });
  it('rejects error-shaped success responses and invalid snapshots', async () => {
    mock.invoke.mockResolvedValue({ data: { error: 'This quote expired.' }, error: null });
    await act(async () => root.render(<PublicQuoteAcceptance token="expired-token" />));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('expired');
    expect(container.querySelector('form')).toBeNull();
  });
  it('rejects malformed pricing instead of rendering a signable partial quote', async () => {
    mock.invoke.mockResolvedValue({ data: { snapshot: { ...snapshot, total: 'unknown' }, status: 'sent', expiresAt: '2027-01-01' }, error: null });
    await act(async () => root.render(<PublicQuoteAcceptance token="invalid-token" />));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('quote could not be loaded');
    expect(container.querySelector('form')).toBeNull();
  });
});
