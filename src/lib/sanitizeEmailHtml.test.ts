// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from './sanitizeEmailHtml';

describe('sanitizeEmailHtml', () => {
  it('removes scripts, iframes and event handlers', () => {
    const out = sanitizeEmailHtml('<p onclick="x()">hi</p><script>alert(1)</script><iframe src="https://e.com"></iframe>');
    expect(out).toBe('<p>hi</p>');
  });

  it('drops javascript: links and hardens safe links', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">bad</a><a href="https://ok.com">ok</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('removes inline styles and unknown attributes', () => {
    expect(sanitizeEmailHtml('<div style="position:fixed" id="a">x</div>')).toBe('<div>x</div>');
  });

  it('keeps remote images by default and blocks them on request', () => {
    const html = '<img src="https://t.example/pixel.gif"><img src="data:image/png;base64,AAAA">';
    expect(sanitizeEmailHtml(html)).toContain('https://t.example/pixel.gif');
    const blocked = sanitizeEmailHtml(html, { blockRemoteImages: true });
    expect(blocked).not.toContain('t.example');
    expect(blocked).toContain('data:image/png;base64,AAAA');
  });

  it('rejects non-image data URIs', () => {
    expect(sanitizeEmailHtml('<img src="data:text/html;base64,AAAA">')).not.toContain('data:text');
  });
});
