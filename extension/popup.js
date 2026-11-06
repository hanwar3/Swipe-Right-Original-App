import { addAllOffers, readPage } from './page.js';

/*
 * The popup is the whole extension: no background worker, no content script
 * running on bank pages. It reads the open tab only when a button is pressed,
 * sends that text to SwipeRight with this browser's own token, and that's it.
 */

// Where SwipeRight lives. Release builds set this to the deployed address;
// "Server" in the connect form overrides it (e.g. http://localhost:4000).
const DEFAULT_SERVER = 'http://localhost:4000';

const PORTALS = [
  [/(^|\.)chase\.com$/i, 'Chase'],
  [/(^|\.)americanexpress\.com$/i, 'American Express'],
  [/(^|\.)bankofamerica\.com$/i, 'Bank of America'],
  [/(^|\.)citi\.com$/i, 'Citi'],
  [/(^|\.)capitalone\.com$/i, 'Capital One'],
  [/(^|\.)discover\.com$/i, 'Discover'],
  [/(^|\.)wellsfargo\.com$/i, 'Wells Fargo'],
  [/(^|\.)usbank\.com$/i, 'U.S. Bank'],
];

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
let tab = null;

function say(message, tone = '') {
  const el = $('status');
  el.textContent = message;
  el.className = tone;
}

function show(section) {
  for (const id of ['pair', 'elsewhere', 'portal']) $(id).hidden = id !== section;
}

function issuerOf(url) {
  try {
    const host = new URL(url).hostname;
    return PORTALS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

async function session() {
  const { server, token, email } = await store.get(['server', 'token', 'email']);
  return { server: server || DEFAULT_SERVER, token, email };
}

/** Calls SwipeRight with this browser's token. A 401 means it was disconnected. */
async function api(path, body) {
  const { server, token } = await session();
  const res = await fetch(`${server}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    await store.remove(['token', 'email']);
    await render();
    throw new Error('This browser was disconnected. Connect it again from the app.');
  }
  if (!res.ok) throw new Error(data.message || `SwipeRight answered ${res.status}`);
  return data;
}

async function run(func) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func });
  return result?.result;
}

// --- connect --------------------------------------------------------------

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('pair-btn');
  button.disabled = true;
  try {
    const server = new URL($('server').value || DEFAULT_SERVER).origin;
    // Hosts beyond the built-in ones need the user's say-so, asked right here.
    const origins = [`${server}/*`];
    if (!(await chrome.permissions.contains({ origins }))) {
      const granted = await chrome.permissions.request({ origins });
      if (!granted) throw new Error('SwipeRight needs permission to reach that address.');
    }
    await store.set({ server });
    const platform = navigator.userAgentData?.platform || navigator.platform || 'this computer';
    const browser = /Edg\//.test(navigator.userAgent) ? 'Edge' : /Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent) ? 'Safari' : 'Chrome';
    const res = await api('/auth/extension/pair', { code: $('code').value, label: `${browser} on ${platform}` });
    await store.set({ token: res.token, email: res.email });
    say('Connected. Open a bank offers page to start.', 'ok');
    await render();
  } catch (err) {
    say(err.message, 'bad');
  } finally {
    button.disabled = false;
  }
});

$('disconnect').addEventListener('click', async () => {
  try {
    await api('/auth/extension/unpair');
  } catch {
    /* already gone on the server */
  }
  await store.remove(['token', 'email']);
  say('Disconnected.');
  await render();
});

// --- on a bank page ---------------------------------------------------------

async function sync(cardId) {
  $('sync').disabled = true;
  $('pick').hidden = true;
  say('Reading the page…');
  try {
    const page = await run(readPage);
    if (!page?.text) throw new Error('Could not read this page. Is it fully loaded?');
    const res = await api('/portal/sync', { text: page.text, url: page.url, cardId });
    if (res.needsCard) {
      const choices = $('choices');
      choices.replaceChildren(
        ...res.candidates.map((c) => {
          const b = document.createElement('button');
          b.textContent = c.lastFour ? `${c.name} ••${c.lastFour}` : c.name;
          b.addEventListener('click', () => sync(c.cardId));
          return b;
        })
      );
      $('pick').hidden = false;
      say(res.message);
      return;
    }
    const others = (res.otherCards || []).filter((c) => !c.lastSyncedAt).map((c) => c.name);
    const next = others.length ? `\nAlso yours: ${others.join(', ')}. Switch account on this page, then sync again.` : '';
    const failed = !res.result || res.result.kind === 'none' || res.result.cardMismatch;
    say(`${res.message}${next}`, failed ? 'bad' : 'ok');
  } catch (err) {
    say(err.message, 'bad');
  } finally {
    $('sync').disabled = false;
  }
}

$('sync').addEventListener('click', () => sync());

$('add-all').addEventListener('click', async () => {
  const button = $('add-all');
  button.disabled = true;
  say('Adding offers… keep this page open.');
  try {
    const result = await run(addAllOffers);
    if (!result?.found) {
      say('No "Add" buttons here. Scroll to load all offers, or they are already added.');
      return;
    }
    say(`Added ${result.clicked} offer${result.clicked === 1 ? '' : 's'}. Syncing…`, 'ok');
    // Give the bank a moment to show them as added, then send the new state.
    await new Promise((r) => setTimeout(r, 2500));
    await sync();
  } catch (err) {
    say(err.message, 'bad');
  } finally {
    button.disabled = false;
  }
});

// --- which view ---------------------------------------------------------------

async function render() {
  const { server, token, email } = await session();
  $('account').hidden = !token;
  $('who').textContent = email ? `Connected as ${email}` : '';
  if (!token) {
    $('server').value = server;
    show('pair');
    $('code').focus();
    return;
  }
  const issuer = tab?.url ? issuerOf(tab.url) : null;
  if (!issuer) {
    show('elsewhere');
    return;
  }
  $('issuer').textContent = issuer;
  $('amex-hint').hidden = issuer !== 'American Express';
  show('portal');
}

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
await render();
