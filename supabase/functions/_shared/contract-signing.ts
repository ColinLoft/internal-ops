import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from 'npm:pdf-lib@1.17.1';

export type PlacedContractField = {
  id: string;
  signer: 'recipient' | 'countersigner';
  kind: 'name' | 'date' | 'signature';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const ownedBuffer = (value: Uint8Array) => {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
};

const fieldBounds = (
  page: PDFPage,
  field: PlacedContractField,
) => {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  const view = right > left && top > bottom
    ? { x: left, y: bottom, width: right - left, height: top - bottom }
    : media;
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const rotated = angle === 90 || angle === 270;
  const width = (rotated ? view.height : view.width) * field.width;
  const height = (rotated ? view.width : view.height) * field.height;
  const x = field.x * (rotated ? view.height : view.width);
  const y = (field.y + field.height) * (rotated ? view.width : view.height);
  const origin = angle === 90 ? { x: view.x + y, y: view.y + x }
    : angle === 180 ? { x: view.x + view.width - x, y: view.y + y }
      : angle === 270 ? { x: view.x + view.width - y, y: view.y + view.height - x }
        : { x: view.x + x, y: view.y + view.height - y };
  const radians = angle * Math.PI / 180;
  // PDF.js placements follow the cropped, rotated view, not the underlying media box.
  return {
    width, height, angle,
    position: (localX: number, localY: number) => ({
      x: origin.x + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: origin.y + localX * Math.sin(radians) + localY * Math.cos(radians),
    }),
  };
};

export const validatePlacedContractFields = (fields: PlacedContractField[], pageCount: number) => {
  if (!Array.isArray(fields) || fields.length < 6 || fields.length > 30) {
    throw new Error('Signature field placement is invalid.');
  }
  const ids = new Set<string>();
  for (const field of fields) {
    if (
      !field || typeof field.id !== 'string' || field.id.length > 80 || ids.has(field.id)
      || !['recipient', 'countersigner'].includes(field.signer)
      || !['name', 'date', 'signature'].includes(field.kind)
      || !Number.isInteger(field.pageIndex) || field.pageIndex < 0 || field.pageIndex >= pageCount
      || ![field.x, field.y, field.width, field.height].every(Number.isFinite)
      || field.x < 0 || field.y < 0 || field.width <= 0 || field.height <= 0
      || field.x + field.width > 1 || field.y + field.height > 1
    ) throw new Error('A signature field is outside the current PDF version.');
    ids.add(field.id);
  }
  for (const signer of ['recipient', 'countersigner'] as const) {
    for (const kind of ['name', 'date', 'signature'] as const) {
      if (!fields.some((field) => field.signer === signer && field.kind === kind)) {
        throw new Error(`The PDF must include a ${signer === 'recipient' ? 'recipient' : 'Flown countersigner'} ${kind} field.`);
      }
    }
    if (fields.filter((field) => field.signer === signer && field.kind === 'signature').length > 4) {
      throw new Error('The PDF has too many signature fields for one signer.');
    }
  }
};

export const applyPlacedContractSignature = async (
  pdfBytes: Uint8Array,
  fields: PlacedContractField[],
  signer: PlacedContractField['signer'],
  signerName: string,
  signatures: Record<string, Uint8Array>,
  signedAt: string,
) => {
  const pdf = await PDFDocument.load(ownedBuffer(pdfBytes));
  if (!pdf.getPageCount() || pdf.getPageCount() > 500) throw new Error('The PDF page count is not supported.');
  validatePlacedContractFields(fields, pdf.getPageCount());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const date = signedAt.slice(0, 10);

  for (const field of fields.filter((item) => item.signer === signer)) {
    const page = pages[field.pageIndex];
    const bounds = fieldBounds(page, field);
    if (field.kind === 'signature') {
      const signatureBytes = signatures[field.id];
      if (!signatureBytes) throw new Error('A placed signature field has no signature image.');
      const signature = await pdf.embedPng(ownedBuffer(signatureBytes));
      const scale = Math.min(bounds.width / signature.width, bounds.height / signature.height);
      const imageWidth = signature.width * scale;
      const imageHeight = signature.height * scale;
      page.drawImage(signature, {
        ...bounds.position((bounds.width - imageWidth) / 2, (bounds.height - imageHeight) / 2),
        width: imageWidth,
        height: imageHeight,
        rotate: degrees(bounds.angle),
      });
    } else {
      const text = field.kind === 'name' ? signerName : date;
      const fontSize = Math.min(12, bounds.height * 0.62, Math.max(1, bounds.width - 4) / font.widthOfTextAtSize(text, 1));
      page.drawText(text, {
        ...bounds.position(2, Math.max(1, (bounds.height - fontSize) / 2)),
        size: fontSize,
        rotate: degrees(bounds.angle),
        font,
        color: rgb(0.06, 0.09, 0.15),
      });
    }
  }

  return new Uint8Array(await pdf.save());
};

export const getContractPdfPageCount = async (pdfBytes: Uint8Array) =>
  (await PDFDocument.load(ownedBuffer(pdfBytes))).getPageCount();
