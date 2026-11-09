import { describe, expect, it } from 'vitest';
import {
  canCountersign,
  createContractField,
  isValidContractField,
  nextContractSigningStatus,
  validateContractFields,
} from './contractSigning';

describe('contract field placement', () => {
  it('stores click positions in normalized PDF page coordinates and keeps fields on-page', () => {
    const signature = createContractField('recipient', 'signature', 2, 0.8, 0.95);
    expect(signature.pageIndex).toBe(2);
    expect(signature.x).toBeCloseTo(0.7);
    expect(signature.y).toBeCloseTo(0.925);
    expect(isValidContractField(signature, 3)).toBe(true);
    expect(isValidContractField({ ...signature, pageIndex: 3 }, 3)).toBe(false);
  });

  it('requires name, date, and signature fields for both signers before sending', () => {
    const recipient = createContractField('recipient', 'signature', 0, 0.1, 0.7);
    const counter = createContractField('countersigner', 'signature', 0, 0.5, 0.7);
    expect(validateContractFields([recipient], 1)).toMatch(/recipient name/);
    expect(validateContractFields([
      recipient,
      createContractField('recipient', 'name', 0, 0.1, 0.5),
      createContractField('recipient', 'date', 0, 0.1, 0.6),
      counter,
      createContractField('countersigner', 'name', 0, 0.5, 0.5),
      createContractField('countersigner', 'date', 0, 0.5, 0.6),
    ], 1)).toBe('');
  });
});

describe('contract countersigning state', () => {
  it('allows only the selected staff member to countersign after the recipient', () => {
    expect(canCountersign('recipient_signed', 'staff-a', 'staff-a')).toBe(true);
    expect(canCountersign('recipient_signed', 'staff-a', 'staff-b')).toBe(false);
    expect(canCountersign('pending', 'staff-a', 'staff-a')).toBe(false);
  });

  it('enforces recipient-first state transitions', () => {
    expect(nextContractSigningStatus('draft', 'send')).toBe('pending');
    expect(nextContractSigningStatus('pending', 'recipient-sign')).toBe('recipient_signed');
    expect(nextContractSigningStatus('recipient_signed', 'countersign')).toBe('completed');
    expect(nextContractSigningStatus('pending', 'countersign')).toBeNull();
  });
});
