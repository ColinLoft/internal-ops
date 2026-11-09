import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDocument, Util, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const helper = new URL('../functions/_shared/contract-signing.ts', import.meta.url).href;
const fixture = `
  import { PDFDocument, StandardFonts, degrees } from 'npm:pdf-lib@1.17.1';
  import { applyPlacedContractSignature } from '${helper}';
  const fields = ['recipient', 'countersigner'].flatMap((signer, signerIndex) =>
    ['name','date','signature'].map((kind, kindIndex) => ({
      id: signer+'-'+kind, signer, kind, pageIndex: 0, x: 0.1,
      y: 0.15 + signerIndex*0.4 + kindIndex*0.08, width: 0.6, height: 0.06,
    }))
  );
  const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oqsAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
  const output = [];
  for (const cropped of [false,true]) for (const angle of [0,90,180,270]) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612,792]);
    if(cropped) page.setCropBox(40,60,510,660);
    page.setRotation(degrees(angle));
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Original agreement', {x:80,y:680,font,size:12});
    const original = await pdf.save();
    const recipient = await applyPlacedContractSignature(original,fields,'recipient','Alex Recipient',{'recipient-signature':image},'2026-11-09T12:00:00Z');
    const signed = await applyPlacedContractSignature(recipient,fields,'countersigner','Flown Signer',{'countersigner-signature':image},'2026-11-10T12:00:00Z');
    if((await PDFDocument.load(signed)).getPageCount()!==1) throw Error('Signing appended a page');
    output.push({cropped,angle,fields,data:btoa(String.fromCharCode(...signed))});
  }
  let rejected=false;
  try {await applyPlacedContractSignature(Uint8Array.from(atob(output[0].data),c=>c.charCodeAt(0)),fields,'recipient','Alex Recipient',{},'2026-11-09T12:00:00Z');}
  catch(error){rejected=error.message.includes('no signature image')}
  if(!rejected) throw Error('Missing signature image was accepted');
  console.log(JSON.stringify(output));
`;
const fixtures = JSON.parse(execFileSync(process.env.DENO_BINARY || 'deno', ['eval', '--no-config', fixture], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
for (const fixture of fixtures) {
  const task = getDocument({
    data: Uint8Array.from(Buffer.from(fixture.data, 'base64')),
    standardFontDataUrl: fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    const document = await task.promise;
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter(item => 'str' in item);
    assert(items.some(item => item.str === 'Original agreement'));
    for (const [signer, name, date] of [
      ['recipient', 'Alex Recipient', '2026-11-09'],
      ['countersigner', 'Flown Signer', '2026-11-10'],
    ]) {
      for (const [kind, value] of [['name', name], ['date', date]]) {
        const field = fixture.fields.find(field => field.signer === signer && field.kind === kind);
        const item = items.find(item => item.str === value);
        assert(item, `Missing ${value} on rotation ${fixture.angle}, cropped=${fixture.cropped}`);
        const [advanceX, advanceY, , , x, y] = Util.transform(viewport.transform, item.transform);
        assert(advanceX > 0 && Math.abs(advanceY) < 0.001, 'Text does not face the viewer horizontally');
        assert(x >= field.x * viewport.width - 0.01 && x <= (field.x + field.width) * viewport.width + 0.01, 'Text x is outside its placed field');
        assert(y >= field.y * viewport.height - 0.01 && y <= (field.y + field.height) * viewport.height + 0.01, 'Text y is outside its placed field');
        assert(item.width <= field.width * viewport.width, 'Name wraps beyond its placed field');
      }
    }
    const operators = await page.getOperatorList();
    assert.equal(operators.fnArray.filter(operator => operator === OPS.paintImageXObject).length, 2, 'Both signatures must remain embedded on the original page');
  } finally { await task.destroy(); }
}
console.log('Contract PDF passed: original page/content, both embedded signatures, name/date bounds and orientation at all four rotations with/without cropping.');
