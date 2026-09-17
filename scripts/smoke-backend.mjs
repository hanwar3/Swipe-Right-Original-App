// End-to-end smoke test for the SwipeRight backend: auth, portfolio, decision engine, profile, offer inbox.
// Start the backend first (scripts/run-backend.cmd), then run: node scripts/smoke-backend.mjs
// Needs OfferInboxSecret set locally (backend/.secrets.local.cue) to the same value as OFFER_INBOX_SECRET here.
// Each run registers a throwaway user; use a separate namespace (encore run --namespace smoke) to keep test data apart.
const BASE = process.env.API_URL ?? "http://127.0.0.1:4000";
const SECRET = process.env.OFFER_INBOX_SECRET ?? "local-smoke-test-secret";
let failures = 0;

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
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

const brief = (c) => c ? `${c.displayName || c.cardName} @ ${c.effectiveRate}%${c.valueCents !== undefined ? ` = ${c.valueCents}c` : ""}${c.offerApplied ? ` [offer: ${c.offerApplied}]` : ""}${c.capExhausted ? " [cap exhausted]" : ""}` : "none";

// --- auth ---------------------------------------------------------------
const email = `smoke-${Date.now()}@example.test`;
const reg = await call("POST", "/auth/register", { email, password: "Smoke-Test-2026!", firstName: "Smoke" });
check("register test user", reg.status === 200 && reg.json.user?.userId, `${reg.status} ${reg.json.user?.userId ?? JSON.stringify(reg.json).slice(0, 200)}`);
const userId = reg.json.user?.userId;
if (!userId) { console.log("cannot continue without a user"); process.exit(1); }

// --- portfolio: two Chase cards on purpose, so issuer alone is ambiguous ----
const CARDS = { flex: 3, reserve: 1, bcp: 15, custom: 64 };
for (const [k, cardId] of Object.entries(CARDS)) {
  const r = await call("POST", `/cards/portfolio/${userId}/add`, { cardId });
  check(`add card ${cardId} (${k}) to portfolio`, r.status === 200, `${r.status} ${r.json.card?.name ?? JSON.stringify(r.json).slice(0, 200)}`);
}
const pf = await call("GET", `/cards/portfolio/${userId}`);
check("portfolio lists 4 cards", pf.status === 200 && pf.json.cards?.length === 4, `${pf.status} ${pf.json.cards?.length ?? JSON.stringify(pf.json).slice(0, 200)}`);

// --- decision engine --------------------------------------------------------
for (const [category, amountCents] of [["gas", 6000], ["groceries", 12000], ["dining", 8000], ["flights", 50000]]) {
  const q = new URLSearchParams({ userId, category, amountCents: String(amountCents) });
  const d = await call("GET", `/cards/decide?${q}`);
  check(`decide "${category}" $${amountCents / 100}`, d.status === 200 && typeof d.json.spoken === "string",
    d.status === 200
      ? `key=${d.json.categoryKey} winner=${brief(d.json.winner)} | runnerUp=${brief(d.json.runnerUp)} | nudge=${d.json.nudge?.headline ?? "-"} | spoken="${d.json.spoken}"`
      : `${d.status} ${JSON.stringify(d.json).slice(0, 300)}`);
}
for (const category of ["I'm at Costco", "something unheard of"]) {
  const d = await call("GET", `/cards/decide?${new URLSearchParams({ userId, category, amountCents: "2000" })}`);
  check(`"${category}" falls back to base rates instead of "no cards"`, d.status === 200 && d.json.winner && !/don't have any cards/.test(d.json.spoken),
    `winner=${brief(d.json.winner)} reason="${d.json.winner?.reasons?.[0]}" spoken="${d.json.spoken}"`);
}
const nobody = await call("GET", `/cards/decide?${new URLSearchParams({ userId: "00000000-0000-0000-0000-000000000000", category: "gas" })}`);
check("user with no cards gets the empty-wallet sentence", nobody.status === 200 && /don't have any cards/.test(nobody.json.spoken), `${nobody.status} "${nobody.json.spoken}"`);
const notUuid = await call("GET", `/cards/decide?${new URLSearchParams({ userId: "no-such-user", category: "gas" })}`);
console.log(`KNOWN non-UUID userId -> ${notUuid.status} (goes away with the auth fix: userId will come from the token)`);

const gas = await call("GET", `/cards/decide?${new URLSearchParams({ userId, category: "gas", amountCents: "6000" })}`);
check("gas: Flex's 5% rotation ended in 2024, so Blue Cash Preferred's 3% wins", gas.json.winner?.cardId === CARDS.bcp, `winner=${brief(gas.json.winner)} runnerUp=${brief(gas.json.runnerUp)}`);

// --- profile ------------------------------------------------------------------
const flexRates = await call("GET", `/cards/profile?${new URLSearchParams({ userId, cardId: String(CARDS.flex) })}`);
check("Flex profile hides expired rotating rates", flexRates.status === 200 && !flexRates.json.rates.some((r) => r.isRotating && r.rate === 5), `rates=[${(flexRates.json.rates ?? []).map((r) => `${r.categoryKey} ${r.rate}${r.isRotating ? " (rotating)" : ""}`).join(", ")}]`);
for (const cardId of [CARDS.reserve, CARDS.flex]) {
  const p = await call("GET", `/cards/profile?${new URLSearchParams({ userId, cardId: String(cardId) })}`);
  check(`profile card ${cardId}`, p.status === 200 && p.json.cardId === cardId,
    p.status === 200
      ? `${p.json.displayName} fee=${p.json.annualFeeCents}c inPortfolio=${p.json.inPortfolio} rates=[${p.json.rates.slice(0, 3).map((r) => `${r.categoryKey} ${r.rate}`).join(", ")}] benefits=${p.json.benefits.length} unused=${p.json.unusedBenefitCents}c offers=${p.json.offers.length}`
      : `${p.status} ${JSON.stringify(p.json).slice(0, 300)}`);
}

// --- offers: inbox and card identity ------------------------------------------
const inbox = await call("GET", `/offers/inbox?${new URLSearchParams({ userId })}`);
check("inbox address minted", inbox.status === 200 && /^offers\+[a-z2-9]+@/.test(inbox.json.address ?? ""), `${inbox.status} ${inbox.json.address ?? JSON.stringify(inbox.json).slice(0, 200)}`);
const address = inbox.json.address;

const idFlex = await call("POST", "/offers/card-identity", { userId, cardId: CARDS.flex, lastFour: "4242" });
check("set last four on Freedom Flex", idFlex.status === 200 && idFlex.json.lastFour === "4242", `${idFlex.status} ${JSON.stringify(idFlex.json)}`);
const idReserve = await call("POST", "/offers/card-identity", { userId, cardId: CARDS.reserve, wantOwnAddress: true });
check("per-card address for Sapphire Reserve", idReserve.status === 200 && /^offers\+[a-z2-9]+\.[a-z2-9]+@/.test(idReserve.json.address ?? ""), `${idReserve.status} ${JSON.stringify(idReserve.json)}`);

// --- offers: ingest -------------------------------------------------------------
const MAIL_LAST_FOUR = `Hello,

Here are new Chase Offers for your card ending in 4242.

Starbucks
Earn 10% cash back, up to $5
Expires Oct 31, 2026

Target
Spend $50, get $10 back
Expires 11/15/2026

Terms apply.`;

const bad = await call("POST", "/offers/ingest", { to: address, from: "Chase <no-reply@chase.com>", subject: "x", text: MAIL_LAST_FOUR }, { "X-Inbox-Secret": "wrong" });
check("ingest rejects a wrong secret", bad.status === 401, `${bad.status} ${JSON.stringify(bad.json).slice(0, 150)}`);

const ing1 = await call("POST", "/offers/ingest", { to: address, from: "Chase <no-reply@chase.com>", subject: "Your new Chase Offers", text: MAIL_LAST_FOUR }, { "X-Inbox-Secret": SECRET });
check("ingest by last four -> Freedom Flex", ing1.status === 200 && ing1.json.status === "ok" && ing1.json.attributedBy === "last_four" && ing1.json.offersWritten === 2, `${ing1.status} ${JSON.stringify(ing1.json)}`);

const ing2 = await call("POST", "/offers/ingest", { to: idReserve.json.address, from: "Chase <no-reply@chase.com>", subject: "Chase Offers", text: `Whole Foods Market\nEarn 5% back on groceries\nExpires Dec 31, 2026` }, { "X-Inbox-Secret": SECRET });
check("ingest by per-card address -> Sapphire Reserve", ing2.status === 200 && ing2.json.status === "ok" && ing2.json.attributedBy === "card_address", `${ing2.status} ${JSON.stringify(ing2.json)}`);

const ing3 = await call("POST", "/offers/ingest", { to: address, from: "Chase <no-reply@chase.com>", subject: "More Chase Offers", text: `Hi,\n\nChipotle\nEarn 15% cash back\nExpires Dec 1, 2026` }, { "X-Inbox-Secret": SECRET });
check("ambiguous Chase mail is held as pending", ing3.status === 200 && ing3.json.status === "pending", `${ing3.status} ${JSON.stringify(ing3.json)}`);

const ing4 = await call("POST", "/offers/ingest", { to: address, from: "Chase <no-reply@chase.com>", subject: "Your new Chase Offers", text: MAIL_LAST_FOUR }, { "X-Inbox-Secret": SECRET });
check("re-forwarding the same mail does not error", ing4.status === 200 && ing4.json.status === "ok", `${ing4.status} ${JSON.stringify(ing4.json)}`);

const ing5 = await call("POST", "/offers/ingest", { to: address, from: "news@chase.com", subject: "Your statement is ready", text: "Your statement is ready to view online." }, { "X-Inbox-Secret": SECRET });
check("mail with no offers is logged as unparsed", ing5.status === 200 && ing5.json.status === "unparsed", `${ing5.status} ${JSON.stringify(ing5.json)}`);

// --- offers: pending and attribution ----------------------------------------------
const pend = await call("GET", `/offers/pending?${new URLSearchParams({ userId })}`);
check("pending lists the held Chipotle offer", pend.status === 200 && pend.json.offers?.length === 1 && pend.json.offers[0].merchantName === "Chipotle", `${pend.status} ${JSON.stringify(pend.json).slice(0, 300)}`);
const held = pend.json.offers?.[0];
if (held) {
  const attr = await call("POST", "/offers/attribute", { userId, offerId: held.id, cardId: CARDS.flex });
  check("attribute held offer to Freedom Flex", attr.status === 200 && attr.json.ok === true, `${attr.status} ${JSON.stringify(attr.json)}`);
  const pend2 = await call("GET", `/offers/pending?${new URLSearchParams({ userId })}`);
  check("pending is empty afterwards", pend2.status === 200 && pend2.json.offers?.length === 0, `${pend2.status} ${JSON.stringify(pend2.json).slice(0, 200)}`);
}

const flex = await call("GET", `/cards/profile?${new URLSearchParams({ userId, cardId: String(CARDS.flex) })}`);
check("Freedom Flex profile: 3 offers, no duplicates, last four kept", flex.status === 200 && flex.json.offers.length === 3 && flex.json.lastFour === "4242",
  `${flex.status} offers=[${(flex.json.offers ?? []).map((o) => `${o.merchantName}: ${o.offerDescription}${o.cashbackRate ? ` ${o.cashbackRate}%` : ""}${o.cashbackAmountCents ? ` ${o.cashbackAmountCents}c` : ""}${o.minimumSpendCents ? ` min ${o.minimumSpendCents}c` : ""} ends ${o.endDate ?? "-"}`).join(" | ")}] lastFour=${flex.json.lastFour}`);

const inbox2 = await call("GET", `/offers/inbox?${new URLSearchParams({ userId })}`);
check("inbox counts received mail", inbox2.status === 200 && inbox2.json.receivedCount === 5, `${inbox2.status} received=${inbox2.json.receivedCount} recent=[${(inbox2.json.recent ?? []).map((r) => r.status).join(",")}]`);

const target = flex.json.offers?.find((o) => o.merchantName === "Target");
check("Target offer description is clean", target && target.offerDescription === "Spend $50, get $10 back", `"${target?.offerDescription}"`);

const listed = await call("GET", `/cards/merchant-offers/${userId}`);
check("merchant offers list works with dated offers", listed.status === 200, `${listed.status} ${listed.status === 200 ? `${(listed.json.offers ?? []).length} offers` : JSON.stringify(listed.json).slice(0, 200)}`);

// --- the engine should use the offers it now knows about -----------------------------
const decideAt = async (category, amountCents) =>
  (await call("GET", `/cards/decide?${new URLSearchParams({ userId, category, amountCents: String(amountCents) })}`)).json;

const sb = await decideAt("I'm at Starbucks", 1000);
check("Starbucks $10: Flex wins with 3% dining + 10% offer", sb.winner?.cardId === CARDS.flex && sb.winner.effectiveRate === 13 && !!sb.winner.offerApplied,
  `winner=${brief(sb.winner)} reason="${sb.winner?.reasons?.[0]}" | spoken="${sb.spoken}"`);

const sbBig = await decideAt("Starbucks", 20000);
check("Starbucks $200: the $5 cap limits the offer to 2.5%", sbBig.winner?.cardId === CARDS.flex && sbBig.winner.effectiveRate === 5.5, `winner=${brief(sbBig.winner)}`);

const tSmall = await decideAt("Target", 2000);
check("Target $20: below the $50 minimum, no offer applied", !tSmall.contenders?.some((c) => c.offerApplied), `winner=${brief(tSmall.winner)}`);

const tBig = await decideAt("Target", 6000);
check("Target $60: $10 credit on Flex counts", tBig.winner?.cardId === CARDS.flex && tBig.winner.offerApplied === "Spend $50, get $10 back", `winner=${brief(tBig.winner)} reason="${tBig.winner?.reasons?.[0]}"`);

// --- voice path: Gemini phrases the engine's decision when GeminiApiKey is set, else the engine's own sentence ---
const chat = await call("POST", "/ai/chat", { message: "I'm buying gas", userId, amountCents: 6000 });
check(`ai/chat answers (${chat.json.fallback === false ? "phrased by Gemini" : "engine sentence, no model reply"})`,
  chat.status === 200 && typeof chat.json.response === "string" && /Blue Cash Preferred/.test(chat.json.response),
  `${chat.status} fallback=${chat.json.fallback} response="${chat.json.response ?? JSON.stringify(chat.json).slice(0, 200)}"`);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}  (user ${userId})`);
