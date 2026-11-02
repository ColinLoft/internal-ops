export const sanitizeEmailHtml = (html: string, options: { blockRemoteImages?: boolean } = {}) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = new Set([
    'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DD', 'DIV', 'DL', 'DT', 'EM',
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
      if (['alt', 'title', 'colspan', 'rowspan'].includes(name)
        || (['width', 'height'].includes(name) && /^\d{1,4}$/.test(value))) continue;
      element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A' && element.hasAttribute('href')) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return document.body.innerHTML;
};
