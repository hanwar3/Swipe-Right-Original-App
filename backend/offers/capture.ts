import { api, APIError, Query } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { getAuthData } from "~encore/auth";
import { cardsDB } from "../cards/db";
import { currentUserId } from "../lib/session";
import { rateLimit } from "../lib/ratelimit";
import { generateText } from "../lib/gemini";
import { detectIssuer } from "./parsers";
import { findAccountLastFour } from "./portal_parsers";
import { ingestPortalText, type PasteResponse } from "./portal";

const geminiApiKey = secret("GeminiApiKey");

/*
 * Three ways a cardholder's targeted offers and credits reach the app, all
 * landing in the same reconcile (ingestPortalText):
 *   - the browser extension, which reads the portal page the user has open
 *   - a phone screenshot, read by the model, then parsed like a pasted page
 *   - pasting the page text (portal.ts)
 * None of them ever sees a bank password or calls a bank.
 */

// The portals the extension may read, by host. Anything else is refused.
const PORTALS: [RegExp, string][] = [
  [/(^|\.)chase\.com$/i, "Chase"],
  [/(^|\.)americanexpress\.com$/i, "American Express"],
  [/(^|\.)bankofamerica\.com$/i, "Bank of America"],
  [/(^|\.)citi\.com$/i, "Citi"],
  [/(^|\.)capitalone\.com$/i, "Capital One"],
  [/(^|\.)discover\.com$/i, "Discover"],
  [/(^|\.)wellsfargo\.com$/i, "Wells Fargo"],
  [/(^|\.)usbank\.com$/i, "U.S. Bank"],
];

function issuerFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    return PORTALS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const sameIssuer = (a: string, b: string) => {
  const x = squash(a);
  const y = squash(b);
  return x.includes(y) || y.includes(x);
};

interface WalletCard {
  card_id: number;
  name: string;
  issuer: string;
  last_four: string | null;
}

export interface SyncCandidate {
  cardId: number;
  name: string;
  lastFour?: string;
}

export interface OtherCard {
  cardId: number;
  name: string;
  lastSyncedAt?: string;
}

export interface SyncRequest {
  /** The page's visible text, as the extension read it. */
  text: string;
  /** The page it came from; decides the issuer and must be a known portal. */
  url: string;
  /** Set when the user picked the card for a page that doesn't say which. */
  cardId?: number;
}

export interface SyncResponse {
  /** What was written, once the card is known. */
  result?: PasteResponse;
  cardId?: number;
  cardName?: string;
  /** The page could belong to more than one card: ask once, then it's remembered. */
  needsCard?: boolean;
  candidates?: SyncCandidate[];
  /** The user's other cards from this issuer, to sync next (switch account on the page). */
  otherCards?: OtherCard[];
  message: string;
}

// The extension's one write: a portal page onto the card it belongs to.
export const sync = api<SyncRequest, SyncResponse>(
  { expose: true, auth: true, method: "POST", path: "/portal/sync", sensitive: true },
  async (req) => {
    const userId = currentUserId({ allowExtension: true });
    rateLimit(`portal-sync:${userId}`, 60, 60 * 60_000);
    const issuer = issuerFromUrl(req.url);
    if (!issuer) {
      throw APIError.invalidArgument("Open your card's offers or benefits page on your bank's site first");
    }
    const text = typeof req.text === "string" ? req.text : "";

    const wallet = await cardsDB.queryAll<WalletCard>`
      SELECT up.card_id, c.name, c.issuer, up.last_four
      FROM user_portfolios up JOIN cards c ON c.id = up.card_id
      WHERE up.user_id = ${userId} AND up.is_active = TRUE
    `;
    const fromIssuer = wallet.filter((c) => sameIssuer(c.issuer, issuer));
    if (!fromIssuer.length) {
      return { message: `None of the cards in your SwipeRight wallet are from ${issuer}. Add the card in the app first.` };
    }

    let card: WalletCard | undefined;
    if (req.cardId !== undefined) {
      card = fromIssuer.find((c) => c.card_id === req.cardId);
      if (!card) throw APIError.notFound(`That card isn't a ${issuer} card in your wallet`);
    } else {
      // The page usually prints the account it shows: "Sapphire Reserve (...0771)".
      const four = findAccountLastFour(text);
      card = four ? fromIssuer.find((c) => c.last_four === four) : undefined;
      if (!card) {
        const unknown = fromIssuer.filter((c) => !c.last_four);
        const only = fromIssuer.length === 1 ? fromIssuer[0] : four && unknown.length === 1 ? unknown[0] : undefined;
        card = only && (!four || !only.last_four) ? only : undefined;
      }
      if (!card) {
        return {
          needsCard: true,
          candidates: fromIssuer.map((c) => ({ cardId: c.card_id, name: c.name, lastFour: c.last_four ?? undefined })),
          message: "Which card is this page for? Pick it once and SwipeRight remembers.",
        };
      }
    }

    const method = getAuthData()?.kind === "extension" ? "extension" : "paste";
    const result = await ingestPortalText(userId, card.card_id, text, method);

    const others = fromIssuer.filter((c) => c.card_id !== card!.card_id);
    const synced = others.length
      ? await cardsDB.queryAll<{ card_id: number; at: Date }>`
          SELECT card_id, MAX(created_at) AS at FROM portal_syncs
          WHERE user_id = ${userId} AND status = 'ok' AND card_id = ANY(${others.map((c) => c.card_id)}::bigint[])
          GROUP BY card_id
        `
      : [];
    return {
      result,
      cardId: card.card_id,
      cardName: card.name,
      otherCards: others.map((c) => {
        const at = synced.find((s) => Number(s.card_id) === c.card_id)?.at;
        return { cardId: c.card_id, name: c.name, lastSyncedAt: at ? new Date(at).toISOString() : undefined };
      }),
      message: result.message,
    };
  }
);

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const TRANSCRIBE = `You are reading a screenshot of a credit card issuer's app or website: an offers page or a benefit/credit page.
Transcribe every piece of visible text exactly as shown, top to bottom, one line of text per line.
Keep amounts, percentages, dates, account endings like "(...0771)" and labels like "Added", "Add to card", "Expires in 5 days" exactly as written.
Do not summarize, explain, translate, reorder or add anything.
If the image is not an offers or benefits page from a card issuer, reply with exactly: NONE`;

export interface ScreenshotRequest {
  cardId: number;
  /** Base64 image data (a data: URL prefix is accepted and dropped). */
  image: string;
  mimeType: string;
}

// For phones: a screenshot of the issuer app's offers or credit screen. The
// model only transcribes; the same parsers as a pasted page decide what it means.
export const screenshot = api<ScreenshotRequest, PasteResponse>(
  {
    expose: true,
    auth: true,
    method: "POST",
    path: "/portal/screenshot",
    sensitive: true,
    bodyLimit: 12 * 1024 * 1024,
  },
  async (req) => {
    const userId = currentUserId();
    rateLimit(`screenshot:${userId}`, 20, 60 * 60_000, "That's a lot of screenshots for one hour. Try again later.");

    const mime = String(req.mimeType || "").toLowerCase();
    if (!IMAGE_TYPES.includes(mime)) throw APIError.invalidArgument("Use a PNG, JPEG, WebP or HEIC screenshot");
    const data = String(req.image || "").replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw APIError.invalidArgument("That file isn't an image");
    if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) throw APIError.invalidArgument("Use a screenshot under 8 MB");

    let key = "";
    try {
      key = geminiApiKey();
    } catch {
      key = "";
    }
    if (!key) throw APIError.unavailable("Reading screenshots isn't set up on this server yet");

    // The card must be in the wallet before we spend a model call on it.
    const holds = await cardsDB.queryRow`
      SELECT 1 AS ok FROM user_portfolios WHERE user_id = ${userId} AND card_id = ${req.cardId} AND is_active = TRUE
    `;
    if (!holds) throw APIError.notFound("that card is not in your wallet");

    const transcript = await generateText(
      key,
      [{ text: TRANSCRIBE }, { inline_data: { mime_type: mime, data } }],
      { temperature: 0, maxOutputTokens: 4096, thinkingLevel: "low" }
    );
    const none: PasteResponse = {
      kind: "none",
      parser: "none",
      offersFound: 0,
      offersWritten: 0,
      offersRetired: 0,
      benefitsFound: 0,
      benefitsWritten: 0,
      message: "Couldn't read offers or a credit in that screenshot. Try one that shows the whole offers list.",
    };
    if (!transcript || /^\s*NONE\s*$/.test(transcript)) return none;
    return ingestPortalText(userId, req.cardId, transcript, "screenshot");
  }
);

/** Fewer cardholders than this and a merchant is never named, so nobody's offers can be singled out. */
const K_ANON = 5;

export interface OfferHint {
  merchantName: string;
  /** How many cardholders of this issuer currently have it (always at least 5). */
  cardholders: number;
}

// Crowd hints: merchants other cardholders of the same issuer have offers at
// right now, that this user hasn't synced. Targeted offers differ by person,
// so this is a prompt to check the portal, never a promise.
export const hints = api<{ cardId: Query<number> }, { issuer?: string; hints: OfferHint[] }>(
  { expose: true, auth: true, method: "GET", path: "/offers/hints" },
  async ({ cardId }) => {
    const userId = currentUserId();
    const card = await cardsDB.queryRow<{ issuer: string }>`
      SELECT c.issuer FROM user_portfolios up JOIN cards c ON c.id = up.card_id
      WHERE up.user_id = ${userId} AND up.card_id = ${cardId}
    `;
    if (!card) throw APIError.notFound("that card is not in your wallet");

    const rows = await cardsDB.queryAll<{ merchant: string; holders: number }>`
      SELECT MIN(mo.merchant_name) AS merchant, COUNT(DISTINCT mo.user_id)::int AS holders
      FROM merchant_offers mo
      JOIN cards c ON c.id = mo.card_id
      WHERE c.issuer = ${card.issuer}
        AND mo.source IN ('portal', 'email')
        AND mo.disappeared_at IS NULL
        AND mo.is_used = FALSE
        AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
        AND mo.user_id <> ${userId}
      GROUP BY LOWER(mo.merchant_name)
      HAVING COUNT(DISTINCT mo.user_id) >= ${K_ANON}
      ORDER BY holders DESC
      LIMIT 20
    `;
    const mine = await cardsDB.queryAll<{ m: string }>`
      SELECT DISTINCT LOWER(merchant_name) AS m FROM merchant_offers
      WHERE user_id = ${userId} AND disappeared_at IS NULL
    `;
    const have = new Set(mine.map((r) => r.m));
    return {
      issuer: card.issuer,
      hints: rows
        .filter((r) => !have.has(r.merchant.toLowerCase()))
        .slice(0, 6)
        .map((r) => ({ merchantName: r.merchant, cardholders: r.holders })),
    };
  }
);
