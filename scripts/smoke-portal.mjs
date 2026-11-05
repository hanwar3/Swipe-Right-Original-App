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
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}  (user ${userId})`);
process.exit(failures === 0 ? 0 : 1);
