const SAFE_STYLE_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'text-transform',
  'line-height', 'letter-spacing', 'vertical-align', 'white-space', 'width', 'max-width', 'min-width', 'height', 'min-height', 'margin', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right', 'border-bottom',
  'border-left', 'border-color', 'border-style', 'border-width', 'border-radius', 'border-collapse', 'border-spacing', 'list-style', 'list-style-type', 'display', 'direction',
]);

const cleanStyle = (style: string) => style.split(';').map((rule) => {
  const index = rule.indexOf(':');
  if (index < 0) return '';
  const property = rule.slice(0, index).trim().toLowerCase();
  const value = rule.slice(index + 1).trim();
  if (!SAFE_STYLE_PROPERTIES.has(property) || /url\s*\(|expression|javascript:|@import|behavior|-moz-binding/i.test(value)) return '';
  if (property === 'display' && !/^(block|inline|inline-block|none|table|table-cell|table-row|list-item)$/i.test(value)) return '';
  return `${property}: ${value}`;
}).filter(Boolean).join('; ');

export const sanitizeEmailHtml = (html: string, options: { blockRemoteImages?: boolean } = {}) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = new Set([
    'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CENTER', 'CODE', 'COLGROUP', 'COL', 'FONT', 'H5', 'H6', 'DD', 'DIV', 'DL', 'DT', 'EM',
    'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN',
    'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
  ]);
  const unsafeTags = new Set(['IFRAME', 'OBJECT', 'EMBED', 'SCRIPT', 'STYLE', 'FORM', 'INPUT', 'BUTTON', 'VIDEO', 'AUDIO']);
  for (const element of [...document.body.querySelectorAll('*')]) {
    if (unsafeTags.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name === 'href' && element.tagName === 'A') {
        if (!/^(https?:|mailto:)/i.test(value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'src' && element.tagName === 'IMG') {
        const allowed = options.blockRemoteImages
          ? /^(cid:|data:image\/(?:png|gif|jpe?g|webp);base64,)/i
          : /^(https?:|cid:|data:image\/(?:png|gif|jpe?g|webp);base64,)/i;
        if (!allowed.test(value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'style') {
        const cleaned = cleanStyle(value);
        if (cleaned) element.setAttribute('style', cleaned); else element.removeAttribute('style');
        continue;
      }
      if (['alt', 'title', 'colspan', 'rowspan', 'dir'].includes(name)
        || (['width', 'height', 'border', 'cellpadding', 'cellspacing', 'size'].includes(name) && /^\d{1,4}%?(px)?$/.test(value))
        || (['align', 'valign'].includes(name) && /^[a-z]{3,8}$/i.test(value))
        || (['color', 'bgcolor'].includes(name) && /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(value))
        || (name === 'face' && /^[\w\s,'-]{1,80}$/.test(value))) continue;
      element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A' && element.hasAttribute('href')) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return document.body.innerHTML;
};
