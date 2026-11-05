// End-to-end smoke test for the SwipeRight backend: auth and its security
// guarantees, portfolio, decision engine, profile, offer inbox, extension pairing.
// Start the backend first (scripts/run-backend.cmd --namespace smoke), then run:
//   node scripts/smoke-backend.mjs
// Needs OfferInboxSecret and SessionSecret set locally (backend/.secrets.local.cue);
// OFFER_INBOX_SECRET here must match the former.
// Each run registers throwaway users and deletes them again at the end.
const BASE = process.env.API_URL ?? "http://127.0.0.1:4000";
const SECRET = process.env.OFFER_INBOX_SECRET ?? "local-smoke-test-secret";
const PASSWORD = "Smoke-Test-2026!";
// Offer dates in the fixtures are always next year, so they never expire under the test.
const NEXT = new Date().getFullYear() + 1;
let failures = 0;

/** `as`: a bearer token, or null to send none. Defaults to the main test user. */
async function call(method, path, body, { as, headers = {} } = {}) {
  const token = as === undefined ? session : as;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ->  ${detail}` : ""}`);
}

const short = (j) => JSON.stringify(j).slice(0, 200);
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const brief = (c) => c ? `${c.displayName || c.cardName} @ ${c.effectiveRate}%${c.valueCents !== undefined ? ` = ${c.valueCents}c` : ""}${c.offerApplied ? ` [offer: ${c.offerApplied}]` : ""}${c.capExhausted ? " [cap exhausted]" : ""}` : "none";

let session = null;

// --- auth ---------------------------------------------------------------------
const stamp = Date.now();
const email = `smoke-${stamp}@example.test`;
const reg = await call("POST", "/auth/register", { email, password: PASSWORD, firstName: "Smoke" });
check("register test user", reg.status === 200 && reg.json.user?.userId && reg.json.token, `${reg.status} ${reg.json.user?.userId ?? short(reg.json)}`);
const userId = reg.json.user?.userId;
session = reg.json.token;
if (!userId || !session) { console.log("cannot continue without a user"); process.exit(1); }

const dupe = await call("POST", "/auth/register", { email, password: PASSWORD }, { as: null });
check("second signup with the same email is refused", dupe.status === 409, `${dupe.status} ${dupe.json.message}`);
const weak = await call("POST", "/auth/register", { email: `weak-${stamp}@example.test`, password: "password123" }, { as: null });
check("common password is refused", weak.status === 400, `${weak.status} ${weak.json.message}`);

const wrongPw = await call("POST", "/auth/login", { email, password: "not-the-password" }, { as: null });
const noUser = await call("POST", "/auth/login", { email: `nobody-${stamp}@example.test`, password: PASSWORD }, { as: null });
check("wrong password and unknown email get the same answer", wrongPw.status === 401 && noUser.status === 401 && wrongPw.json.message === noUser.json.message, `${wrongPw.status}/${noUser.status} "${wrongPw.json.message}"`);
const login = await call("POST", "/auth/login", { email: email.toUpperCase(), password: PASSWORD }, { as: null });
check("login (email is case-insensitive) returns a token", login.status === 200 && typeof login.json.token === "string", `${login.status}`);
const verify = await call("POST", "/auth/verify", { token: login.json.token }, { as: null });
check("verify accepts a real token", verify.status === 200 && verify.json.user?.userId === userId, `${verify.status}`);

let throttled = 0;
for (let i = 0; i < 9; i++) {
  const r = await call("POST", "/auth/login", { email: `throttle-${stamp}@example.test`, password: "guess" + i }, { as: null });
  if (r.status === 429) throttled++;
}
check("ninth guess at one account inside 15 minutes is throttled", throttled === 1, `429s=${throttled}`);

const oauth = await call("POST", "/auth/oauth", { provider: "google", accessToken: "x", email, providerId: "1" }, { as: null });
check("unverified social sign-in is switched off", oauth.status === 501, `${oauth.status}`);
const users = await call("GET", "/auth/users", undefined, { as: null });
check("user list is not reachable from outside", !Array.isArray(users.json?.users), `${users.status} ${typeof users.json === "string" ? "web app page" : short(users.json)}`);

// Forgeries: the old unsigned format, a payload swapped under a real signature, alg "none".
const now = Math.floor(Date.now() / 1000);
const [h, , sig] = session.split(".");
const second = await call("POST", "/auth/register", { email: `smoke-b-${stamp}@example.test`, password: PASSWORD, firstName: "Other" }, { as: null });
const otherId = second.json.user?.userId;
const otherToken = second.json.token;
const forgeries = {
  "old base64 token": Buffer.from(JSON.stringify({ userId, exp: Date.now() + 1e9 })).toString("base64"),
  "swapped payload": `${h}.${b64url({ sub: otherId, sv: 1, iat: now, exp: now + 3600, typ: "session" })}.${sig}`,
  "alg none": `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: userId, sv: 1, iat: now, exp: now + 3600, typ: "session" })}.`,
};
for (const [label, token] of Object.entries(forgeries)) {
  const r = await call("GET", "/cards/portfolio", undefined, { as: token });
  check(`forged token rejected: ${label}`, r.status === 401, `${r.status}`);
}
const anon = await call("GET", "/cards/portfolio", undefined, { as: null });
check("no token, no wallet", anon.status === 401, `${anon.status}`);

// --- portfolio: two Chase cards on purpose, so issuer alone is ambiguous ----
const CARDS = { flex: 3, reserve: 1, bcp: 15, custom: 64 };
for (const [k, cardId] of Object.entries(CARDS)) {
  const r = await call("POST", "/cards/portfolio/add", { cardId });
  check(`add card ${cardId} (${k}) to portfolio`, r.status === 200, `${r.status} ${r.json.card?.name ?? short(r.json)}`);
}
const pf = await call("GET", "/cards/portfolio");
check("portfolio lists 4 cards", pf.status === 200 && pf.json.cards?.length === 4, `${pf.status} ${pf.json.cards?.length ?? short(pf.json)}`);

// Another account sees none of it and cannot touch it.
const theirs = await call("GET", "/cards/portfolio", undefined, { as: otherToken });
check("another user's wallet is empty, not ours", theirs.status === 200 && theirs.json.cards?.length === 0, `${theirs.status} ${theirs.json.cards?.length}`);
const steal = await call("DELETE", `/cards/portfolio/${pf.json.cards?.[0]?.id}`, undefined, { as: otherToken });
const still = await call("GET", "/cards/portfolio");
check("another user cannot remove our card", steal.status === 404 && still.json.cards?.length === 4, `${steal.status}, still ${still.json.cards?.length}`);

// --- decision engine --------------------------------------------------------
const decideAt = async (category, amountCents, as) =>
  (await call("GET", `/cards/decide?${new URLSearchParams({ category, amountCents: String(amountCents) })}`, undefined, { as })).json;

for (const [category, amountCents] of [["gas", 6000], ["groceries", 12000], ["dining", 8000], ["flights", 50000]]) {
  const d = await call("GET", `/cards/decide?${new URLSearchParams({ category, amountCents: String(amountCents) })}`);
  check(`decide "${category}" $${amountCents / 100}`, d.status === 200 && typeof d.json.spoken === "string",
    d.status === 200
      ? `key=${d.json.categoryKey} winner=${brief(d.json.winner)} | runnerUp=${brief(d.json.runnerUp)} | nudge=${d.json.nudge?.headline ?? "-"} | spoken="${d.json.spoken}"`
      : `${d.status} ${JSON.stringify(d.json).slice(0, 300)}`);
}
for (const category of ["I'm at Costco", "something unheard of"]) {
  const d = await decideAt(category, 2000);
  check(`"${category}" falls back to base rates instead of "no cards"`, d.winner && !/don't have any cards/.test(d.spoken),
    `winner=${brief(d.winner)} reason="${d.winner?.reasons?.[0]}" spoken="${d.spoken}"`);
}
const empty = await decideAt("gas", 1000, otherToken);
check("user with no cards gets the empty-wallet sentence", /don't have any cards/.test(empty.spoken ?? ""), `"${empty.spoken}"`);

const gas = await decideAt("gas", 6000);
check("gas: Flex's 5% rotation ended in 2024, so Blue Cash Preferred's 3% wins", gas.winner?.cardId === CARDS.bcp, `winner=${brief(gas.winner)} runnerUp=${brief(gas.runnerUp)}`);

// Merchant credits steer only at their merchant (the 45-day window always covers a monthly credit).
const restaurant = await decideAt("dining", 8000);
check("Blue Cash's Equinox credit does not steer a restaurant bill", !/Equinox/.test(`${restaurant.nudge?.headline ?? ""} ${restaurant.spoken}`), `nudge=${restaurant.nudge?.headline ?? "-"} spoken="${restaurant.spoken}"`);
const gym = await decideAt("Equinox", 3000);
check("at Equinox, the expiring Equinox credit is brought up", /Equinox/.test(`${gym.nudge?.headline ?? ""} ${gym.spoken}`), `nudge=${gym.nudge?.headline ?? "-"} spoken="${gym.spoken}"`);

// --- profile ------------------------------------------------------------------
const flexRates = await call("GET", `/cards/profile?${new URLSearchParams({ cardId: String(CARDS.flex) })}`);
check("Flex profile hides expired rotating rates", flexRates.status === 200 && !flexRates.json.rates.some((r) => r.isRotating && r.rate === 5), `rates=[${(flexRates.json.rates ?? []).map((r) => `${r.categoryKey} ${r.rate}${r.isRotating ? " (rotating)" : ""}`).join(", ")}]`);
for (const cardId of [CARDS.reserve, CARDS.flex]) {
  const p = await call("GET", `/cards/profile?${new URLSearchParams({ cardId: String(cardId) })}`);
  check(`profile card ${cardId}`, p.status === 200 && p.json.cardId === cardId,
    p.status === 200
      ? `${p.json.displayName} fee=${p.json.annualFeeCents}c inPortfolio=${p.json.inPortfolio} rates=[${p.json.rates.slice(0, 3).map((r) => `${r.categoryKey} ${r.rate}`).join(", ")}] benefits=${p.json.benefits.length} unused=${p.json.unusedBenefitCents}c offers=${p.json.offers.length}`
      : `${p.status} ${JSON.stringify(p.json).slice(0, 300)}`);
}

// --- offers: inbox and card identity ------------------------------------------
const inbox = await call("GET", "/offers/inbox");
check("inbox address minted", inbox.status === 200 && /^offers\+[a-z2-9]+@/.test(inbox.json.address ?? ""), `${inbox.status} ${inbox.json.address ?? short(inbox.json)}`);
const address = inbox.json.address;

const idFlex = await call("POST", "/offers/card-identity", { cardId: CARDS.flex, lastFour: "4242" });
check("set last four on Freedom Flex", idFlex.status === 200 && idFlex.json.lastFour === "4242", `${idFlex.status} ${JSON.stringify(idFlex.json)}`);
const idReserve = await call("POST", "/offers/card-identity", { cardId: CARDS.reserve, wantOwnAddress: true });
check("per-card address for Sapphire Reserve", idReserve.status === 200 && /^offers\+[a-z2-9]+\.[a-z2-9]+@/.test(idReserve.json.address ?? ""), `${idReserve.status} ${JSON.stringify(idReserve.json)}`);

// --- offers: ingest -------------------------------------------------------------
const MAIL_LAST_FOUR = `Hello,

Here are new Chase Offers for your card ending in 4242.

Starbucks
Earn 10% cash back, up to $5
Expires Oct 31, ${NEXT}

Target
Spend $50, get $10 back
Expires 11/15/${NEXT}

Terms apply.`;

const mail = (to, subject, text, secret = SECRET) =>
  call("POST", "/offers/ingest", { to, from: "Chase <no-reply@chase.com>", subject, text }, { as: null, headers: { "X-Inbox-Secret": secret } });

const bad = await mail(address, "x", MAIL_LAST_FOUR, "wrong");
check("ingest rejects a wrong secret", bad.status === 401, `${bad.status} ${short(bad.json)}`);

const ing1 = await mail(address, "Your new Chase Offers", MAIL_LAST_FOUR);
check("ingest by last four -> Freedom Flex", ing1.status === 200 && ing1.json.status === "ok" && ing1.json.attributedBy === "last_four" && ing1.json.offersWritten === 2, `${ing1.status} ${JSON.stringify(ing1.json)}`);

const ing2 = await mail(idReserve.json.address, "Chase Offers", `Whole Foods Market\nEarn 5% back on groceries\nExpires Dec 31, ${NEXT}`);
check("ingest by per-card address -> Sapphire Reserve", ing2.status === 200 && ing2.json.status === "ok" && ing2.json.attributedBy === "card_address", `${ing2.status} ${JSON.stringify(ing2.json)}`);

const ing3 = await mail(address, "More Chase Offers", `Hi,\n\nChipotle\nEarn 15% cash back\nExpires Dec 1, ${NEXT}`);
check("ambiguous Chase mail is held as pending", ing3.status === 200 && ing3.json.status === "pending", `${ing3.status} ${JSON.stringify(ing3.json)}`);

const ing4 = await mail(address, "Your new Chase Offers", MAIL_LAST_FOUR);
check("re-forwarding the same mail does not error", ing4.status === 200 && ing4.json.status === "ok", `${ing4.status} ${JSON.stringify(ing4.json)}`);

const ing5 = await call("POST", "/offers/ingest", { to: address, from: "news@chase.com", subject: "Your statement is ready", text: "Your statement is ready to view online." }, { as: null, headers: { "X-Inbox-Secret": SECRET } });
check("mail with no offers is logged as unparsed", ing5.status === 200 && ing5.json.status === "unparsed", `${ing5.status} ${JSON.stringify(ing5.json)}`);

const pend = await call("GET", "/offers/pending");
check("pending lists the held Chipotle offer", pend.status === 200 && pend.json.offers?.length === 1 && pend.json.offers[0].merchantName === "Chipotle", `${pend.status} ${JSON.stringify(pend.json).slice(0, 300)}`);
const held = pend.json.offers?.[0];
if (held) {
  const hijack = await call("POST", "/offers/attribute", { offerId: held.id, cardId: CARDS.flex }, { as: otherToken });
  check("another user cannot claim our held offer", hijack.status === 404 || hijack.json.ok === false, `${hijack.status} ${short(hijack.json)}`);
  const attr = await call("POST", "/offers/attribute", { offerId: held.id, cardId: CARDS.flex });
  check("attribute held offer to Freedom Flex", attr.status === 200 && attr.json.ok === true, `${attr.status} ${JSON.stringify(attr.json)}`);
  const pend2 = await call("GET", "/offers/pending");
  check("pending is empty afterwards", pend2.status === 200 && pend2.json.offers?.length === 0, `${pend2.status} ${short(pend2.json)}`);
}

const flex = await call("GET", `/cards/profile?${new URLSearchParams({ cardId: String(CARDS.flex) })}`);
check("Freedom Flex profile: 3 offers, no duplicates, last four kept", flex.status === 200 && flex.json.offers.length === 3 && flex.json.lastFour === "4242",
  `${flex.status} offers=[${(flex.json.offers ?? []).map((o) => `${o.merchantName}: ${o.offerDescription}${o.cashbackRate ? ` ${o.cashbackRate}%` : ""}${o.cashbackAmountCents ? ` ${o.cashbackAmountCents}c` : ""}${o.minimumSpendCents ? ` min ${o.minimumSpendCents}c` : ""} ends ${o.endDate ?? "-"}`).join(" | ")}] lastFour=${flex.json.lastFour}`);

const inbox2 = await call("GET", "/offers/inbox");
check("inbox counts received mail", inbox2.status === 200 && inbox2.json.receivedCount === 5, `${inbox2.status} received=${inbox2.json.receivedCount} recent=[${(inbox2.json.recent ?? []).map((r) => r.status).join(",")}]`);

const target = flex.json.offers?.find((o) => o.merchantName === "Target");
check("Target offer description is clean", target && target.offerDescription === "Spend $50, get $10 back", `"${target?.offerDescription}"`);

const listed = await call("GET", "/cards/merchant-offers");
check("merchant offers list works with dated offers", listed.status === 200, `${listed.status} ${listed.status === 200 ? `${(listed.json.offers ?? []).length} offers` : short(listed.json)}`);

// --- offers move the decision ---------------------------------------------------
const sb = await decideAt("I'm at Starbucks", 1000);
check("Starbucks $10: Flex wins with 3% dining + 10% offer", sb.winner?.cardId === CARDS.flex && sb.winner.effectiveRate === 13 && !!sb.winner.offerApplied,
  `winner=${brief(sb.winner)} reason="${sb.winner?.reasons?.[0]}" | spoken="${sb.spoken}"`);

const sbBig = await decideAt("Starbucks", 20000);
check("Starbucks $200: the $5 cap limits the offer to 2.5%", sbBig.winner?.cardId === CARDS.flex && sbBig.winner.effectiveRate === 5.5, `winner=${brief(sbBig.winner)}`);

const tSmall = await decideAt("Target", 2000);
check("Target $20: below the $50 minimum, no offer applied", !tSmall.contenders?.some((c) => c.offerApplied), `winner=${brief(tSmall.winner)}`);

const tBig = await decideAt("Target", 6000);
check("Target $60: $10 credit on Flex counts", tBig.winner?.cardId === CARDS.flex && tBig.winner.offerApplied === "Spend $50, get $10 back", `winner=${brief(tBig.winner)} reason="${tBig.winner?.reasons?.[0]}"`);

// --- voice path: Gemini phrases the engine's decision when GeminiApiKey is set ---
const chat = await call("POST", "/ai/chat", { message: "I'm buying gas", amountCents: 6000 });
check(`ai/chat answers (${chat.json.fallback === false ? "phrased by Gemini" : "engine sentence, no model reply"})`,
  chat.status === 200 && typeof chat.json.response === "string" && /Blue Cash Preferred/.test(chat.json.response),
  `${chat.status} fallback=${chat.json.fallback} response="${chat.json.response ?? short(chat.json)}"`);
const chatAnon = await call("POST", "/ai/chat", { message: "I'm buying gas" }, { as: null });
check("ai/chat without a session asks you to sign in", chatAnon.status === 200 && /Sign in/.test(chatAnon.json.response ?? ""), `${chatAnon.status} "${chatAnon.json.response}"`);

// --- card credits: shared catalogue, usage that follows the account -----------
const cat = await call("GET", "/benefits/catalogue", undefined, { as: null });
const dd = cat.json.benefits?.find((b) => b.slug === "107_doordash_credit" && b.cardId === CARDS.reserve);
check("catalogue is public and has the updated DoorDash credit", cat.status === 200 && dd?.valueCents === 1500 && /\$15/.test(dd?.changeNote ?? ""), `${cat.status} ${dd ? `${dd.name} ${dd.valueCents}c v${dd.version} "${dd.changeNote}"` : "missing"}`);
const dash = cat.json.benefits?.find((b) => b.slug === "107_dashpass" && b.cardId === CARDS.reserve);
const delta = cat.json.benefits?.filter((b) => b.cardId === 36) ?? [];
check("Delta's Platinum card does not inherit Amex Platinum credits", delta.length === 0, `${delta.length} credits on card 36`);

if (dd && dash) {
  const logged = await call("POST", "/benefits/usage", { benefitId: dd.id, usedCents: 800 });
  const mineAfter = await call("GET", "/benefits/mine");
  const prof = await call("GET", `/cards/profile?cardId=${CARDS.reserve}`);
  const ddRow = prof.json.benefits?.find((b) => b.benefitId === dd.id);
  check("manual usage is saved for this period and shows in the profile",
    logged.status === 200 && mineAfter.json.usage?.some((u) => u.benefitId === dd.id && u.usedCents === 800) && ddRow?.remainingCents === 700,
    `${logged.status} period ends ${logged.json.periodEnd}; profile ${ddRow?.usedCents}/${ddRow?.valueCents}`);
  const over = await call("POST", "/benefits/usage", { benefitId: dd.id, usedCents: 99999 });
  check("usage cannot exceed the credit", over.json.usedCents === 1500, `${over.json.usedCents}`);
  const foreign = await call("POST", "/benefits/usage", { benefitId: dd.id, usedCents: 100 }, { as: otherToken });
  check("someone without the card cannot log against it", foreign.status === 404, `${foreign.status}`);

  const hid = await call("POST", `/benefits/${dash.id}/visibility`, { hidden: true });
  const profHidden = await call("GET", `/cards/profile?cardId=${CARDS.reserve}`);
  const unhid = await call("POST", `/benefits/${dash.id}/visibility`, { hidden: false });
  check("hiding a credit removes it for this user only", hid.status === 200 && unhid.status === 200 && !profHidden.json.benefits?.some((b) => b.benefitId === dash.id), `${hid.status}/${unhid.status}`);

  const added = await call("POST", "/benefits/custom", { cardId: CARDS.reserve, name: "Lounge guest passes", valueCents: 2, unit: "count", period: "year", category: "Travel" });
  const listedCustom = await call("GET", "/benefits/mine");
  const removed = await call("POST", `/benefits/custom/${added.json.id}/delete`);
  check("custom credit: add, list, remove", added.status === 200 && listedCustom.json.custom?.some((c) => c.id === added.json.id) && removed.status === 200, `${added.status} ${added.json.name}/${removed.status}`);
  const notMine = await call("POST", "/benefits/custom", { cardId: 36, name: "Nope", valueCents: 500, period: "year" });
  check("custom credits only go on cards you hold", notMine.status === 404, `${notMine.status}`);

  const travel = cat.json.benefits?.find((b) => b.slug === "107_travel" && b.cardId === CARDS.reserve);
  const imp1 = await call("POST", "/benefits/import", { credits: [{ slug: "107_travel", usedCents: 5000 }], subscriptions: [], hidden: [], custom: [] });
  const imp2 = await call("POST", "/benefits/import", { credits: [{ slug: "107_travel", usedCents: 9999 }], subscriptions: [], hidden: [], custom: [] });
  const afterImport = await call("GET", "/benefits/mine");
  const travelUse = afterImport.json.usage?.find((u) => u.benefitId === travel?.id);
  check("browser log import fills gaps and never overwrites", imp1.json.imported === 1 && travelUse?.usedCents === 5000, `imported ${imp1.json.imported}/${imp2.json.imported}, travel used ${travelUse?.usedCents}`);
}

// --- browser extension pairing ------------------------------------------------
const code = await call("POST", "/auth/extension/pairing-code");
check("pairing code issued", code.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code.json.code ?? ""), `${code.status} ${code.json.code}`);
const pair = await call("POST", "/auth/extension/pair", { code: (code.json.code ?? "").toLowerCase().replace("-", " "), label: "Smoke Chrome" }, { as: null });
const ext = pair.json.token;
check("extension trades the code for its own token", pair.status === 200 && /^srx_/.test(ext ?? ""), `${pair.status} ${short(pair.json)}`);
const reuse = await call("POST", "/auth/extension/pair", { code: code.json.code }, { as: null });
check("a pairing code works once", reuse.status === 400, `${reuse.status}`);
const extStatus = await call("GET", `/portal/status?${new URLSearchParams({ cardId: String(CARDS.flex) })}`, undefined, { as: ext });
const extWallet = await call("GET", "/cards/portfolio", undefined, { as: ext });
check("extension token can sync portal pages and read the card list", extStatus.status === 200 && extWallet.status === 200, `${extStatus.status}/${extWallet.status}`);
const extDecide = await call("GET", "/cards/decide?category=gas", undefined, { as: ext });
const extPair = await call("POST", "/auth/extension/pairing-code", {}, { as: ext });
check("extension token can do nothing else", extDecide.status === 403 && extPair.status === 403, `${extDecide.status}/${extPair.status}`);
const devices = await call("GET", "/auth/extension/devices");
check("app lists the connected browser", devices.status === 200 && devices.json.devices?.some((d) => d.label === "Smoke Chrome"), `${devices.status} ${short(devices.json)}`);
const unpair = await call("POST", "/auth/extension/unpair", {}, { as: ext });
const afterUnpair = await call("GET", "/cards/portfolio", undefined, { as: ext });
check("extension can disconnect itself, and its token dies", unpair.status === 200 && afterUnpair.status === 401, `${unpair.status}/${afterUnpair.status}`);

// --- sign out everywhere, then delete the test accounts ---------------------------
const out = await call("POST", "/auth/logout-all");
const stale = await call("GET", "/cards/portfolio");
check("sign out everywhere voids the old token", out.status === 200 && stale.status === 401, `${out.status}/${stale.status}`);
session = (await call("POST", "/auth/login", { email, password: PASSWORD }, { as: null })).json.token;

const keep = await call("POST", "/auth/account/delete", { password: "wrong-password" });
check("account deletion needs the password", keep.status === 403, `${keep.status}`);
const gone = await call("POST", "/auth/account/delete", { password: PASSWORD });
const ghost = await call("GET", "/cards/portfolio");
const relogin = await call("POST", "/auth/login", { email, password: PASSWORD }, { as: null });
check("deleted account: token dead, login refused", gone.status === 200 && ghost.status === 401 && relogin.status === 401, `${gone.status}/${ghost.status}/${relogin.status}`);
await call("POST", "/auth/account/delete", { password: PASSWORD }, { as: otherToken });

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}  (user ${userId})`);
process.exit(failures === 0 ? 0 : 1);
