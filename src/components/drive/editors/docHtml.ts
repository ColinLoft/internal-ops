const ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE',
  'S', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
]);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'VIDEO', 'AUDIO', 'SVG', 'MATH', 'LINK', 'META']);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;

const safeStyle = (style: string) => style
  .split(';')
  .map((rule) => rule.split(':').map((part) => part.trim()))
  .filter(([name, value]) => {
    if (!name || !value) return false;
    if (name === 'text-align') return /^(left|center|right|justify)$/.test(value);
    if (name === 'color' || name === 'background-color') return SAFE_COLOR.test(value);
    return false;
  })
  .map(([name, value]) => `${name}: ${value}`)
  .join('; ');

export const sanitizeDocHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const element of [...doc.body.querySelectorAll('*')]) {
    if (DROP_TAGS.has(element.tagName.toUpperCase())) { element.remove(); continue; }
    if (!ALLOWED_TAGS.has(element.tagName)) { element.replaceWith(...element.childNodes); continue; }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name === 'href' && element.tagName === 'A' && /^(https?:|mailto:)/i.test(value)) continue;
      if (name === 'src' && element.tagName === 'IMG' && /^(https:|data:image\/(png|gif|jpe?g|webp);base64,)/i.test(value)) continue;
      if (name === 'style') {
        const cleaned = safeStyle(value);
        if (cleaned) element.setAttribute('style', cleaned); else element.removeAttribute('style');
        continue;
      }
      if (['alt', 'colspan', 'rowspan'].includes(name)) continue;
      if (name === 'color' && element.tagName === 'FONT' && SAFE_COLOR.test(value)) continue;
      element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return doc.body.innerHTML;
};

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const textToHtml = (text: string) => text
  .split(/\n{2,}|\n/)
  .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
  .join('') || '<p><br></p>';

export const countWords = (text: string) => (text.trim().match(/\S+/g) ?? []).length;
