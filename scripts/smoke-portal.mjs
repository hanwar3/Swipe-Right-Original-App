import { readFileSync } from "node:fs";
// End-to-end check for portal sync: paste a portal page, see it in Insights.
// Start the backend (scripts/run-backend.cmd), then: node scripts/smoke-portal.mjs
// It registers a throwaway user and uses card 1 (Chase Sapphire Reserve).
// The fixtures below are real Chase pages, as a user's copy produces them.
// Text as it comes off the portal pages in the screen recording, pasted by a user.
const CHASE_OFFERS = `Chase Offers
Home
Offers wallet
Chase Shopping
More
Choose account
Sapphire Reserve (...0771)
Add deals to your card, shop and get cash back. It's that easy.
$8.34
Total amount saved
1
Added offers
0
Expiring offers
All offers
Shopping
Groceries
Home & pet
Entertainment
Health & beauty
Travel
Food & drink
Gas & auto
Other
Sapphire Reserve offers
See more offers
Hyatt: Miraval & Alila
Exclusive
$250 cash back
Goop
Exclusive
$50 cash back
Vitamix
15% cash back
Home Chef
$15 cash back
Cozy Earth
15% cash back
All offers
Food Lion
5% cash back
Expiring soon
YouTube TV
New
$20 cash back
Expiring soon
HP.com - Tech for Work, Home
8% cash back
Tory Burch
5% cash back
Blue Apron
15% cash back
Emirates
New
5% cash back
AG1 - Foundational Nutrition
25% cash back
Sam's Club
40% cash back
Added
Kuishi Reston
New
5% cash back
La Roche-Posay
15% cash back
Primark
15% cash back
Therabody
12% cash back
`;

const CHASE_BENEFIT = `Back
Benefits (...0771)
$300 Annual Travel Credit*
Benefit overview
Get up to $300 in statement credits for travel purchases charged to your card each anniversary year.
You've received $290 in statement credits so far this year.
$290/$300
In use
Good through 6/15/2027
Explore travel
How it works
No activation required. Just use your card for travel purchases to receive a statement credit.
Purchases that qualify for the $300 Annual Travel Credit will not earn points.
`;

const AMEX_OFFERS = `American Express
Amex Offers & Benefits
Platinum Card (ending in 3004)
Gopuff
Spend $30 or more, get $10 back
Expires in 12 days
Add to Card
Sunglass Hut
20% back, up to $40
Added to Card
Expires 11/30/26
Saks Fifth Avenue
Spend $150, get $50 back
Add to Card
`;

const BASE = 'http://127.0.0.1:4000';
const SAPPHIRE_RESERVE = 1;
let failures = 0;

let session = null;
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: text }; }
};

const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ->  ${detail}` : ''}`);
};

const reg = await call('POST', '/auth/register', {
  email: `portal-${Date.now()}@example.test`,
  password: 'Portal-Test-2026!',
  firstName: 'Portal',
});
const userId = reg.json.user?.userId;
session = reg.json.token;
check('register test user', !!userId && !!session, userId);
if (!userId) process.exit(1);

await call('POST', '/cards/portfolio/add', { cardId: SAPPHIRE_RESERVE });

// --- the offers page -------------------------------------------------------
const offersPaste = await call('POST', '/portal/paste', { cardId: SAPPHIRE_RESERVE, text: CHASE_OFFERS });
check('paste the Chase offers page', offersPaste.status === 200 && offersPaste.json.offersWritten >= 15,
  `${offersPaste.status} kind=${offersPaste.json.kind} parser=${offersPaste.json.parser} written=${offersPaste.json.offersWritten} "${offersPaste.json.message}"`);

// --- the benefit page ------------------------------------------------------
const benefitPaste = await call('POST', '/portal/paste', { cardId: SAPPHIRE_RESERVE, text: CHASE_BENEFIT });
check('paste the $300 travel credit page', benefitPaste.status === 200 && benefitPaste.json.benefitsWritten === 1,
  `${benefitPaste.status} kind=${benefitPaste.json.kind} benefits=${benefitPaste.json.benefitsWritten} retired=${benefitPaste.json.offersRetired} "${benefitPaste.json.message}"`);

check('a benefit page does not retire the offers', benefitPaste.json.offersRetired === 0, `retired=${benefitPaste.json.offersRetired}`);

// --- what Insights will render --------------------------------------------
const profile = await call('GET', `/cards/profile?cardId=${SAPPHIRE_RESERVE}`);
const offers = profile.json.offers ?? [];
const credits = (profile.json.benefits ?? []).filter((b) => b.fromPortal);
const added = offers.filter((o) => o.isActivated);
check('profile lists the offers, unactivated first', profile.status === 200 && offers.length >= 15 && !offers[0].isActivated,
  `${offers.length} offers, ${added.length} already added, first="${offers[0]?.merchantName}" activated=${offers[0]?.isActivated}`);
check('Sam\'s Club came through as already added', added.some((o) => o.merchantName.includes("Sam's Club")),
  added.map((o) => o.merchantName).join(', ') || 'none');
check('the travel credit shows real usage', credits.length === 1 && credits[0].usedCents === 29000 && credits[0].valueCents === 30000,
  credits.map((c) => `${c.name}: ${c.usedCents / 100}/${c.valueCents / 100} resets ${c.resetsOn} checked ${c.checkedAt?.slice(0, 10)}`).join(' | '));

// --- status, for the "checked" line and the activate count ------------------
const status = await call('GET', `/portal/status?cardId=${SAPPHIRE_RESERVE}`);
check('status counts what still needs adding', status.status === 200 && status.json.offersToActivate >= 14,
  `${status.status} live=${status.json.liveOffers} toActivate=${status.json.offersToActivate} portal=${status.json.portalUrl ? 'linked' : 'none'}`);

// --- a second sync retires what the portal stopped showing ------------------
const shorter = CHASE_OFFERS.split('All offers')[0] + 'All offers\nFood Lion\n5% cash back\nExpiring soon\n';
const resync = await call('POST', '/portal/paste', { cardId: SAPPHIRE_RESERVE, text: shorter });
check('a later sync retires offers the portal dropped', resync.json.offersRetired > 0,
  `written=${resync.json.offersWritten} retired=${resync.json.offersRetired}`);

const after = await call('GET', `/cards/profile?cardId=${SAPPHIRE_RESERVE}`);
check('retired offers leave the card', (after.json.offers ?? []).length < offers.length,
  `${offers.length} before, ${(after.json.offers ?? []).length} after`);

// --- pasting another card's page must not write here ------------------------
const wrongCard = await call('POST', '/portal/paste', {
  cardId: SAPPHIRE_RESERVE,
  text: CHASE_OFFERS.replace('(...0771)', '(...9999)'),
});
check('a page for a different card is refused', wrongCard.json.kind === 'none' && !!wrongCard.json.cardMismatch,
  `"${wrongCard.json.message}"`);

await call('POST', '/auth/account/delete', { password: 'Portal-Test-2026!' });

// --- the catalogue follows cardholders' portals ---------------------------
// Three cardholders' Amex portals show a different Dunkin' credit. Each sees
// their own portal's figure at once; after the third, everyone does. The value
// alternates between $12 and $13 so the check repeats cleanly run after run.
const AMEX_GOLD = 4;
session = null;
const catBefore = await call('GET', '/benefits/catalogue');
const dunkin = (catBefore.json.benefits ?? []).find((b) => b.slug === '102_dunkin' && b.cardId === AMEX_GOLD);
const target = dunkin?.valueCents === 1200 ? 1300 : 1200;
const dunkinPage = `Dunkin' Credit
Benefit overview
Get up to $${target / 100} in statement credits each month at U.S. Dunkin' locations.
$4/$${target / 100}
How it works
Enroll, then pay with your card at Dunkin'.`;
const crowd = [];
for (let i = 1; i <= 3; i++) {
  session = null;
  const r = await call('POST', '/auth/register', { email: `crowd-${i}-${Date.now()}@example.test`, password: 'Portal-Test-2026!' });
  session = r.json.token;
  crowd.push(session);
  await call('POST', '/cards/portfolio/add', { cardId: AMEX_GOLD });
  const pasted = await call('POST', '/portal/paste', { cardId: AMEX_GOLD, text: dunkinPage });
  const own = await call('GET', `/cards/profile?cardId=${AMEX_GOLD}`);
  const mineRow = (own.json.benefits ?? []).find((b) => b.benefitId === dunkin?.id);
  check(`cardholder ${i} sees their own portal's figure at once`, pasted.json.benefitsWritten === 1 && mineRow?.valueCents === target,
    `${mineRow?.name}: ${mineRow?.usedCents}/${mineRow?.valueCents}`);
  if (i === 2) {
    const mid = (await call('GET', '/benefits/catalogue')).json.benefits.find((b) => b.id === dunkin?.id);
    check('two portals are not enough to change it for everyone', mid?.valueCents === dunkin?.valueCents, `${mid?.valueCents}`);
  }
}
const catAfter = (await call('GET', '/benefits/catalogue')).json.benefits.find((b) => b.id === dunkin?.id);
check('three agreeing portals update the catalogue, with a note', catAfter?.valueCents === target && /3 cardholders/.test(catAfter?.changeNote ?? ''),
  `${dunkin?.valueCents} -> ${catAfter?.valueCents} v${catAfter?.version} "${catAfter?.changeNote}"`);
for (const token of crowd) {
  session = token;
  await call('POST', '/auth/account/delete', { password: 'Portal-Test-2026!' });
}

// --- the browser extension's sync --------------------------------------------
const CHASE_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offerHub';
const FLEX = 3;
session = null;
const extUser = await call('POST', '/auth/register', { email: `ext-${Date.now()}@example.test`, password: 'Portal-Test-2026!' });
const extSession = extUser.json.token;
session = extSession;
await call('POST', '/cards/portfolio/add', { cardId: SAPPHIRE_RESERVE });
await call('POST', '/cards/portfolio/add', { cardId: FLEX });
const code = await call('POST', '/auth/extension/pairing-code');
session = null;
const paired = await call('POST', '/auth/extension/pair', { code: code.json.code, label: 'Smoke Chrome' });
session = paired.json.token;
const offPortal = await call('POST', '/portal/sync', { text: CHASE_OFFERS, url: 'https://example.com/offers' });
check('the extension only reads known bank portals', offPortal.status === 400, `${offPortal.status}`);
const askCard = await call('POST', '/portal/sync', { text: CHASE_OFFERS, url: CHASE_URL });
check('two Chase cards and a page it cannot place: it asks which card', askCard.status === 200 && askCard.json.needsCard && askCard.json.candidates?.length === 2,
  `${askCard.status} "${askCard.json.message}"`);
const picked = await call('POST', '/portal/sync', { text: CHASE_OFFERS, url: CHASE_URL, cardId: SAPPHIRE_RESERVE });
check('after picking, the page lands on that card and names the other Chase card',
  picked.json.result?.offersWritten === 17 && /Sapphire Reserve/.test(picked.json.cardName ?? '') && picked.json.otherCards?.some((c) => c.cardId === FLEX),
  `${picked.status} written=${picked.json.result?.offersWritten} others=${(picked.json.otherCards ?? []).map((c) => c.name).join(', ')}`);
const again = await call('POST', '/portal/sync', { text: CHASE_OFFERS, url: CHASE_URL });
check('next time, the account ending on the page places it automatically', again.json.cardId === SAPPHIRE_RESERVE && !again.json.needsCard,
  `${again.status} card=${again.json.cardName} "${again.json.message}"`);
session = extSession;
const seen = await call('GET', `/portal/status?cardId=${SAPPHIRE_RESERVE}`);
check('the app sees what the extension synced', seen.json.liveOffers === 17, `live=${seen.json.liveOffers}`);

// --- a phone screenshot: the model transcribes, the parsers decide ---------
const png = readFileSync(new URL('./fixtures/chase-offers-screenshot.png', import.meta.url)).toString('base64');
const badType = await call('POST', '/portal/screenshot', { cardId: SAPPHIRE_RESERVE, image: png, mimeType: 'text/plain' });
const notImage = await call('POST', '/portal/screenshot', { cardId: SAPPHIRE_RESERVE, image: '<<not an image>>', mimeType: 'image/png' });
check('screenshot input is checked before any model call', badType.status === 400 && notImage.status === 400, `${badType.status}/${notImage.status}`);
const shot = await call('POST', '/portal/screenshot', { cardId: SAPPHIRE_RESERVE, image: png, mimeType: 'image/png' });
const afterShot = await call('GET', `/cards/profile?cardId=${SAPPHIRE_RESERVE}`);
const shotOffers = afterShot.json.offers ?? [];
const harbor = shotOffers.find((o) => /Harbor Tea/i.test(o.merchantName));
check('a screenshot becomes offers, "Added" included', shot.status === 200 && shot.json.offersWritten === 3 && !!harbor?.isActivated,
  `${shot.status} parser=${shot.json.parser} written=${shot.json.offersWritten} "${shot.json.message}" harborAdded=${harbor?.isActivated}`);
check('a screenshot is partial, so it retires nothing', shot.json.offersRetired === 0 && shotOffers.length === 20, `retired=${shot.json.offersRetired} offers=${shotOffers.length}`);
await call('POST', '/auth/account/delete', { password: 'Portal-Test-2026!' });

// --- crowd hints: named only once 5 other cardholders have the offer ---------
const tag = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 5) || 'zq';
const crowdPage = `Chase Offers
Choose account
Sapphire Reserve (...0771)
All offers
Lumina Candles ${tag}
12% cash back
Orbit Books ${tag}
$10 cash back
`;
const holders = [];
const hintFor = async () => {
  session = null;
  const r = await call('POST', '/auth/register', { email: `hint-${tag}-${holders.length}-${Date.now()}@example.test`, password: 'Portal-Test-2026!' });
  session = r.json.token;
  holders.push(session);
  await call('POST', '/cards/portfolio/add', { cardId: FLEX });
  return (await call('GET', `/offers/hints?cardId=${FLEX}`)).json;
};
for (let i = 0; i < 4; i++) {
  session = null;
  const r = await call('POST', '/auth/register', { email: `crowdoffer-${tag}-${i}-${Date.now()}@example.test`, password: 'Portal-Test-2026!' });
  session = r.json.token;
  holders.push(session);
  await call('POST', '/cards/portfolio/add', { cardId: SAPPHIRE_RESERVE });
  await call('POST', '/portal/paste', { cardId: SAPPHIRE_RESERVE, text: crowdPage });
}
const four = await hintFor();
check('four cardholders are too few to name a merchant', !(four.hints ?? []).some((h) => h.merchantName.includes(tag)), JSON.stringify(four.hints ?? []).slice(0, 160));
session = null;
const fifth = await call('POST', '/auth/register', { email: `crowdoffer-${tag}-5-${Date.now()}@example.test`, password: 'Portal-Test-2026!' });
session = fifth.json.token;
holders.push(session);
await call('POST', '/cards/portfolio/add', { cardId: SAPPHIRE_RESERVE });
await call('POST', '/portal/paste', { cardId: SAPPHIRE_RESERVE, text: crowdPage });
const five = await hintFor();
const named = (five.hints ?? []).filter((h) => h.merchantName.includes(tag));
check('at five, other Chase cardholders get the merchant as a hint', named.length === 2 && named.every((h) => h.cardholders >= 5), JSON.stringify(named));
for (const token of holders) {
  session = token;
  await call('POST', '/auth/account/delete', { password: 'Portal-Test-2026!' });
}
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}  (user ${userId})`);
process.exit(failures === 0 ? 0 : 1);
