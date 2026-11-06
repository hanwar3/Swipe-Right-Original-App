/*
 * Functions the popup runs inside the bank's page, only when the user clicks
 * a button (the activeTab permission). Each must be self-contained: Chrome
 * serialises the function body into the page, so no outside variables.
 */

/** The page's visible text, including text inside web components. */
export function readPage() {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME']);
  const lines = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP.has(node.tagName)) return;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (node.shadowRoot) walk(node.shadowRoot);
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(document.body);
  const deep = lines.join('\n');
  const plain = document.body.innerText || '';
  // innerText is closest to what a copy produces; use the deep walk only when
  // the page hides its content in shadow roots.
  const text = deep.length > plain.length * 1.2 ? deep : plain;
  return { text: text.slice(0, 200000), url: location.href };
}

/**
 * Clicks every "Add to card" / "Add offer" button on the page, at a person's
 * pace. It only presses buttons the bank already shows the user; it never
 * submits anything else.
 */
export async function addAllOffers() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const all = [];
  const collect = (root) => {
    root.querySelectorAll('button, [role="button"]').forEach((el) => all.push(el));
    root.querySelectorAll('*').forEach((el) => el.shadowRoot && collect(el.shadowRoot));
  };
  collect(document);

  const words = (el) =>
    `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const isAdd = (el) => {
    const w = words(el);
    if (!/\badd\b/.test(w) || /\b(added|remove|undo|activated|enrolled|user|payee|account|address)\b/.test(w)) return false;
    return /\b(offer|offers|deal|deals|card|to card)\b/.test(w) || w === 'add' || w === '+ add';
  };
  const usable = (el) =>
    !el.disabled &&
    el.getAttribute('aria-disabled') !== 'true' &&
    (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

  const buttons = [...new Set(all)].filter((el) => usable(el) && isAdd(el)).slice(0, 150);
  let clicked = 0;
  for (const button of buttons) {
    button.scrollIntoView({ block: 'center', behavior: 'instant' });
    button.click();
    clicked++;
    await sleep(400 + Math.floor(Math.random() * 300));
  }
  return { found: buttons.length, clicked };
}
