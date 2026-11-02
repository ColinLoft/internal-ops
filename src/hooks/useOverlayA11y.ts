import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const isOverlay = (el: Element): el is HTMLElement => {
  if (!(el instanceof HTMLElement) || !el.classList.contains('fixed') || !el.classList.contains('inset-0')) return false;
  const style = window.getComputedStyle(el);
  return style.position === 'fixed' && style.display !== 'none' && style.pointerEvents !== 'none';
};

const topOverlay = (): HTMLElement | null => {
  const found = Array.from(document.body.querySelectorAll('.fixed.inset-0')).filter(isOverlay);
  return found.length ? found[found.length - 1] : null;
};

const focusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);

const findCloseButton = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('button')).find((b) => /^(close|cancel|dismiss)\b/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));

/**
 * Gives every full-screen overlay dialog semantics, a focus trap, Escape-to-close
 * (when the overlay exposes a close/cancel button), and focus restoration.
 */
export function useOverlayA11y(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let active: HTMLElement | null = null;
    const returnStack: Array<{ overlay: HTMLElement; trigger: HTMLElement | null }> = [];

    const sync = () => {
      const top = topOverlay();
      if (top === active) return;
      const previous = active;
      active = top;
      if (top) {
        if (!top.getAttribute('role')) top.setAttribute('role', 'dialog');
        if (!top.hasAttribute('aria-modal') && top.getAttribute('role') === 'dialog') top.setAttribute('aria-modal', 'true');
        if (!top.hasAttribute('aria-label') && !top.hasAttribute('aria-labelledby')) {
          const heading = top.querySelector('h1,h2,h3');
          if (heading?.textContent) top.setAttribute('aria-label', heading.textContent.trim());
        }
        if (!returnStack.some((entry) => entry.overlay === top)) {
          const trigger = document.activeElement instanceof HTMLElement && !top.contains(document.activeElement) ? document.activeElement : null;
          returnStack.push({ overlay: top, trigger });
        }
        if (!top.contains(document.activeElement)) {
          const items = focusables(top);
          const target = items.find((el) => el.matches('input,textarea,select')) || items[0];
          (target || top).focus({ preventScroll: true });
        }
      }
      if (previous && !previous.isConnected) {
        const index = returnStack.findIndex((entry) => entry.overlay === previous);
        if (index >= 0) {
          const [{ trigger }] = returnStack.splice(index, 1);
          if (!top && trigger?.isConnected) trigger.focus({ preventScroll: true });
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const top = topOverlay();
      if (!top) return;
      if (event.key === 'Escape') {
        const close = findCloseButton(top);
        if (close) {
          event.preventDefault();
          close.click();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(top);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!top.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKeyDown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
