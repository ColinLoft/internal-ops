export type ContractSigner = 'recipient' | 'countersigner';
export type ContractFieldKind = 'name' | 'date' | 'signature';

export type ContractField = {
  id: string;
  signer: ContractSigner;
  kind: ContractFieldKind;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContractSigningStatus = 'draft' | 'pending' | 'recipient_signed' | 'completed' | 'revoked';

export const contractFieldLabel = (field: Pick<ContractField, 'signer' | 'kind'>) =>
  `${field.signer === 'recipient' ? 'Recipient' : 'Flown'} ${field.kind}`;

export const createContractField = (
  signer: ContractSigner,
  kind: ContractFieldKind,
  pageIndex: number,
  x: number,
  y: number,
): ContractField => {
  const width = kind === 'signature' ? 0.3 : 0.24;
  const height = kind === 'signature' ? 0.075 : 0.045;
  return {
    id: crypto.randomUUID(),
    signer,
    kind,
    pageIndex,
    x: Math.max(0, Math.min(1 - width, x)),
    y: Math.max(0, Math.min(1 - height, y)),
    width,
    height,
  };
};

export const isValidContractField = (field: ContractField, pageCount: number) =>
  typeof field.id === 'string'
  && field.id.length <= 80
  && Number.isInteger(field.pageIndex)
  && field.pageIndex >= 0
  && field.pageIndex < pageCount
  && [field.x, field.y, field.width, field.height].every(Number.isFinite)
  && field.x >= 0 && field.y >= 0
  && field.width > 0 && field.height > 0
  && field.x + field.width <= 1
  && field.y + field.height <= 1;

export const validateContractFields = (fields: ContractField[], pageCount: number) => {
  if (!fields.length) return 'Place name, date, and signature fields for both signers on the PDF.';
  if (fields.some((field) => !isValidContractField(field, pageCount))) return 'A signature field is outside the PDF page.';
  for (const signer of ['recipient', 'countersigner'] as const) {
    for (const kind of ['name', 'date', 'signature'] as const) {
      if (!fields.some((field) => field.signer === signer && field.kind === kind)) {
        return `Place a ${signer === 'recipient' ? 'recipient' : 'Flown countersigner'} ${kind} field on the PDF.`;
      }
    }
  }
  return '';
};

export const canCountersign = (status: ContractSigningStatus, selectedUserId: string | null, currentUserId: string) =>
  status === 'recipient_signed' && !!selectedUserId && selectedUserId === currentUserId;

export const nextContractSigningStatus = (status: ContractSigningStatus, action: 'send' | 'recipient-sign' | 'countersign') => {
  if (action === 'send' && status === 'draft') return 'pending';
  if (action === 'recipient-sign' && status === 'pending') return 'recipient_signed';
  if (action === 'countersign' && status === 'recipient_signed') return 'completed';
  return null;
};
