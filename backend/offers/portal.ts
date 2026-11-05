import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { cardsDB } from "../cards/db";
import { currentUserId } from "../lib/session";
import { generateText } from "../lib/gemini";
import { detectIssuer, validateAgainstSource } from "./parsers";
import {
  classifyPaste,
  findAccountLastFour,
  parsePortalBenefits,
  parsePortalOffers,
  type PortalBenefit,
  type PortalOffer,
} from "./portal_parsers";

const geminiApiKey = secret("GeminiApiKey");

/**
 * The portal, pasted.
 *
 * Targeted offers and benefit usage live behind the cardholder's login and are
 * sold by nobody, so the app cannot fetch them. What it can do is read the page
 * the cardholder is already looking at. They copy it, paste it here, and this
 * writes the same rows the browser extension will write later: same tables,
 * same provenance, same reconciliation. Nothing here touches a bank.
 */

const MAX_PASTE = 200_000;

interface PortfolioCard {
  card_id: number;
  name: string;
  issuer: string;
  last_four: string | null;
}

/** How a portal page reached us. Recorded per sync for support and trust. */
export type SyncMethod = "paste" | "extension" | "screenshot";

export interface PasteRequest {
  /** The card open in Insights. A paste always lands on a card the user chose. */
  cardId: number;
  text: string;
}

export interface PasteResponse {
  kind: "offers" | "benefit" | "mixed" | "none";
  parser: "deterministic" | "model" | "none";
  offersFound: number;
  offersWritten: number;
  offersRetired: number;
  benefitsFound: number;
  benefitsWritten: number;
  /** Set when the pasted page belongs to a different card than the one open. */
  cardMismatch?: string;
  /** Plain sentence for the UI to show as-is. */
  message: string;
}

function periodBounds(period: PortalBenefit["period"], endsOn: string | undefined, now: Date) {
  if (endsOn) {
    const end = new Date(`${endsOn}T00:00:00Z`);
    const start = new Date(end);
    if (period === "month") start.setUTCMonth(start.getUTCMonth() - 1);
    else if (period === "quarter") start.setUTCMonth(start.getUTCMonth() - 3);
    else start.setUTCFullYear(start.getUTCFullYear() - 1);
    return { start, end };
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (period === "month") {
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)) };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3) * 3;
    return { start: new Date(Date.UTC(y, q, 1)), end: new Date(Date.UTC(y, q + 3, 0)) };
  }
  return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
}

/** Only for text the regexes could not read. It extracts; it never invents. */
async function modelRead(
  text: string
): Promise<{ offers: PortalOffer[]; benefits: PortalBenefit[] }> {
  let key: string;
  try {
    key = geminiApiKey();
    if (!key) return { offers: [], benefits: [] };
  } catch {
    return { offers: [], benefits: [] };
  }

  const instruction = `This is a credit card portal page, pasted as text. Extract two things.

Return ONLY this JSON object:
{"offers": [{"merchantName": string, "offerDescription": string, "cashbackRate": number|null, "cashbackAmountCents": number|null, "minimumSpendCents": number|null, "endDate": "YYYY-MM-DD"|null, "activated": boolean}],
 "benefits": [{"name": string, "valueCents": number, "usedCents": number, "endsOn": "YYYY-MM-DD"|null, "period": "month"|"quarter"|"year"}]}

Rules:
- Copy merchant and benefit names exactly as they appear.
- cashbackRate is a percent as written: "5% cash back" is 5, never 0.05.
- Money in cents. $10 is 1000.
- activated is true only if the page says the offer was added or activated.
- valueCents is the whole allowance, usedCents how much is already spent.
- Include nothing the page does not state. If there is nothing, return empty arrays.
- No prose, no code fences.`;

  const raw = await generateText(key, [{ text: instruction }, { text: text.slice(0, 24000) }], {
    temperature: 0,
    maxOutputTokens: 2048,
    thinkingLevel: "low",
  });
  if (!raw) return { offers: [], benefits: [] };

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const offers = validateAgainstSource(
      (Array.isArray(parsed.offers) ? parsed.offers : []).map((o: any) => ({
        merchantName: String(o.merchantName ?? "").trim(),
        offerDescription: String(o.offerDescription ?? "").trim() || "Offer",
        cashbackRate: typeof o.cashbackRate === "number" ? o.cashbackRate : undefined,
        cashbackAmountCents: typeof o.cashbackAmountCents === "number" ? o.cashbackAmountCents : undefined,
        minimumSpendCents: typeof o.minimumSpendCents === "number" ? o.minimumSpendCents : undefined,
        endDate: typeof o.endDate === "string" ? o.endDate : undefined,
        confidence: 0.55,
      })),
      text
    ).map((o, i) => ({
      ...o,
      activated: Boolean((parsed.offers ?? [])[i]?.activated),
      expiringSoon: false,
    })) as PortalOffer[];

    const hay = text.toLowerCase();
    const benefits = (Array.isArray(parsed.benefits) ? parsed.benefits : [])
      .filter((b: any) => b && typeof b.name === "string" && typeof b.valueCents === "number")
      // The allowance has to be printed on the page, or we are being told a story.
      .filter((b: any) => hay.includes(String(Math.round(b.valueCents / 100))))
      .map((b: any) => ({
        name: String(b.name).trim(),
        valueCents: Math.round(b.valueCents),
        usedCents: Math.max(0, Math.min(Math.round(b.usedCents ?? 0), Math.round(b.valueCents))),
        endsOn: typeof b.endsOn === "string" ? b.endsOn : undefined,
        period: ["month", "quarter", "year"].includes(b.period) ? b.period : "year",
      })) as PortalBenefit[];

    return { offers, benefits };
  } catch {
    return { offers: [], benefits: [] };
  }
}

export const paste = api<PasteRequest, PasteResponse>(
  { expose: true, auth: true, method: "POST", path: "/portal/paste", sensitive: true },
  async (req) => {
    const userId = currentUserId({ allowExtension: true });
    const method: SyncMethod = getAuthData()?.kind === "extension" ? "extension" : "paste";
    return ingestPortalText(userId, req.cardId, req.text, method);
  }
);

/**
 * Reads one portal page onto one card the user holds. The paste box, the
 * browser extension and screenshots all land here, so they reconcile the
 * same way: same parsers, same retirement of vanished offers, same guards.
 */
export async function ingestPortalText(
  userId: string,
  cardId: number,
  rawText: string,
  method: SyncMethod
): Promise<PasteResponse> {
  {
    const req = { userId, cardId, text: typeof rawText === "string" ? rawText : "" };
    const text = req.text.slice(0, MAX_PASTE);
    if (text.trim().length < 20) {
      throw APIError.invalidArgument("nothing to read in that paste");
    }

    const card = await cardsDB.queryRow<PortfolioCard>`
      SELECT up.card_id, c.name, c.issuer, up.last_four
      FROM user_portfolios up
      JOIN cards c ON c.id = up.card_id
      WHERE up.user_id = ${req.userId} AND up.card_id = ${req.cardId} AND up.is_active = TRUE
    `;
    if (!card) throw APIError.notFound("that card is not in your wallet");

    // Guard against pasting one card's page onto another card. The portal
    // prints the account it is showing, so when it disagrees, stop and say so
    // rather than writing another card's offers here.
    const pastedLastFour = findAccountLastFour(text);
    if (pastedLastFour && card.last_four && pastedLastFour !== card.last_four) {
      return {
        kind: "none",
        parser: "none",
        offersFound: 0,
        offersWritten: 0,
        offersRetired: 0,
        benefitsFound: 0,
        benefitsWritten: 0,
        cardMismatch: pastedLastFour,
        message: `That page is for the card ending ${pastedLastFour}, and this one ends ${card.last_four}. Nothing was saved.`,
      };
    }

    const now = new Date();
    let offers = parsePortalOffers(text, now);
    let benefits = parsePortalBenefits(text);
    let parser: PasteResponse["parser"] = offers.length || benefits.length ? "deterministic" : "none";

    if (parser === "none") {
      const guessed = await modelRead(text);
      offers = guessed.offers;
      benefits = guessed.benefits;
      parser = offers.length || benefits.length ? "model" : "none";
    }

    const kind = offers.length && benefits.length ? "mixed" : offers.length ? "offers" : benefits.length ? "benefit" : "none";
    const issuer = detectIssuer("", text) ?? card.issuer;

    // The page knows the last four before we do; remember it for mail attribution.
    if (pastedLastFour && !card.last_four) {
      await cardsDB.exec`
        UPDATE user_portfolios SET last_four = ${pastedLastFour}, updated_at = NOW()
        WHERE user_id = ${req.userId} AND card_id = ${req.cardId}
      `;
    }

    // --- offers ---------------------------------------------------------
    const writtenIds: number[] = [];
    for (const o of offers) {
      const row = await cardsDB.queryRow<{ id: number }>`
        INSERT INTO merchant_offers
          (user_id, card_id, merchant_name, offer_description, cashback_rate,
           cashback_amount, minimum_spend, maximum_cashback, offer_type, end_date,
           is_activated, activated_at, source, confidence, last_seen_at)
        VALUES
          (${req.userId}, ${req.cardId}, ${o.merchantName}, ${o.offerDescription},
           ${o.cashbackRate ?? null}, ${o.cashbackAmountCents ?? null},
           ${o.minimumSpendCents ?? null}, ${o.maximumCashbackCents ?? null},
           'cashback', ${o.endDate ?? null}, ${o.activated},
           ${o.activated ? now : null}, 'portal', ${o.confidence}, ${now})
        ON CONFLICT (user_id, COALESCE(card_id, -1), LOWER(merchant_name), COALESCE(end_date, DATE '2099-12-31'))
        DO UPDATE SET
          offer_description = EXCLUDED.offer_description,
          cashback_rate     = EXCLUDED.cashback_rate,
          cashback_amount   = EXCLUDED.cashback_amount,
          minimum_spend     = EXCLUDED.minimum_spend,
          maximum_cashback  = EXCLUDED.maximum_cashback,
          is_activated      = EXCLUDED.is_activated,
          activated_at      = COALESCE(merchant_offers.activated_at, EXCLUDED.activated_at),
          last_seen_at      = EXCLUDED.last_seen_at,
          disappeared_at    = NULL,
          source            = 'portal',
          confidence        = EXCLUDED.confidence,
          updated_at        = NOW()
        WHERE merchant_offers.source IN ('email', 'portal')
        RETURNING id
      `;
      if (row) writtenIds.push(row.id);
    }

    // A full offers page is the whole truth for that card: anything it stopped
    // showing is gone. A single benefit page says nothing about offers.
    let offersRetired = 0;
    if (kind === "offers" || kind === "mixed") {
      const retired = await cardsDB.queryAll<{ id: number }>`
        UPDATE merchant_offers
        SET disappeared_at = ${now}, updated_at = NOW()
        WHERE user_id = ${req.userId}
          AND card_id = ${req.cardId}
          AND source = 'portal'
          AND disappeared_at IS NULL
          AND NOT (id = ANY(${writtenIds}))
        RETURNING id
      `;
      offersRetired = retired.length;
    }

    // --- benefits -------------------------------------------------------
    let benefitsWritten = 0;
    for (const b of benefits) {
      // Catalogue first: if this card already lists the benefit for everyone,
      // attach the usage to that row instead of making a private duplicate.
      const existing = await cardsDB.queryRow<{ id: number }>`
        SELECT id FROM card_benefits
        WHERE card_id = ${req.cardId}
          AND LOWER(name) = ${b.name.toLowerCase()}
          AND (user_id IS NULL OR user_id = ${req.userId})
        ORDER BY user_id NULLS LAST
        LIMIT 1
      `;

      let benefitId = existing?.id;
      if (!benefitId) {
        const created = await cardsDB.queryRow<{ id: number }>`
          INSERT INTO card_benefits (card_id, user_id, name, description, value_amount, period, source)
          VALUES (${req.cardId}, ${req.userId}, ${b.name}, ${`Read from your ${issuer} portal`},
                  ${b.valueCents}, ${b.period}, 'portal')
          ON CONFLICT (card_id, COALESCE(user_id, ''), LOWER(name)) DO UPDATE
            SET value_amount = EXCLUDED.value_amount, period = EXCLUDED.period
          RETURNING id
        `;
        benefitId = created?.id;
      } else {
        await cardsDB.exec`
          UPDATE card_benefits SET value_amount = ${b.valueCents}, period = ${b.period}
          WHERE id = ${benefitId} AND (user_id = ${req.userId} OR source = 'portal')
        `;
      }
      if (!benefitId) continue;

      const { start, end } = periodBounds(b.period, b.endsOn, now);
      await cardsDB.exec`
        INSERT INTO user_benefit_usage
          (user_id, benefit_id, period_start, period_end, used_amount, source, as_of, ends_on, updated_at)
        VALUES
          (${req.userId}, ${benefitId}, ${start}, ${end}, ${b.usedCents}, 'portal', ${now},
           ${b.endsOn ?? null}, NOW())
        ON CONFLICT (user_id, benefit_id, period_start) DO UPDATE SET
          used_amount = EXCLUDED.used_amount,
          period_end  = EXCLUDED.period_end,
          source      = 'portal',
          as_of       = EXCLUDED.as_of,
          ends_on     = EXCLUDED.ends_on,
          updated_at  = NOW()
      `;
      benefitsWritten++;
    }

    await cardsDB.exec`
      INSERT INTO portal_syncs
        (user_id, card_id, issuer, kind, method, parser, offers_found, offers_written,
         offers_retired, benefits_found, benefits_written, status)
      VALUES
        (${req.userId}, ${req.cardId}, ${issuer}, ${kind}, ${method}, ${parser},
         ${offers.length}, ${writtenIds.length}, ${offersRetired}, ${benefits.length},
         ${benefitsWritten}, ${kind === "none" ? "unparsed" : "ok"})
    `;

    if (kind === "none") {
      log.warn("portal page unparsed", { method, cardId: req.cardId, chars: text.length });
    }

    const parts: string[] = [];
    if (writtenIds.length) parts.push(`${writtenIds.length} offer${writtenIds.length === 1 ? "" : "s"}`);
    if (benefitsWritten) parts.push(`${benefitsWritten} benefit${benefitsWritten === 1 ? "" : "s"}`);
    const message =
      kind === "none"
        ? "Could not find offers or a credit in that text. Copy the whole offers page, or a single benefit page."
        : `Updated ${parts.join(" and ")} on ${card.name}${offersRetired ? `, and retired ${offersRetired} the portal no longer shows` : ""}.`;

    return {
      kind,
      parser,
      offersFound: offers.length,
      offersWritten: writtenIds.length,
      offersRetired,
      benefitsFound: benefits.length,
      benefitsWritten,
      message,
    };
  }
}

export interface StatusParams {
  cardId: Query<number>;
}

export interface StatusResponse {
  /** When this card last told us anything, whoever asked it. */
  lastSyncedAt?: string;
  lastKind?: string;
  liveOffers: number;
  offersToActivate: number;
  portalUrl?: string;
}

/** Where to go to activate an offer, per issuer. */
export function portalUrlFor(issuer: string): string | undefined {
  const i = (issuer || "").toLowerCase();
  if (i.includes("chase")) return "https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offerHub";
  if (i.includes("american express") || i.includes("amex")) return "https://global.americanexpress.com/offers/eligible";
  if (i.includes("bank of america")) return "https://secure.bankofamerica.com/customer-deals/entry/";
  if (i.includes("citi")) return "https://www.citi.com/AGNC/CBOL/Login";
  return undefined;
}

export const status = api<StatusParams, StatusResponse>(
  { expose: true, auth: true, method: "GET", path: "/portal/status" },
  async (params) => {
    const userId = currentUserId({ allowExtension: true });
    const last = await cardsDB.queryRow<{ created_at: Date; kind: string }>`
      SELECT created_at, kind FROM portal_syncs
      WHERE user_id = ${userId} AND card_id = ${params.cardId} AND status = 'ok'
      ORDER BY created_at DESC LIMIT 1
    `;

    const counts = await cardsDB.queryRow<{ live: number; to_activate: number }>`
      SELECT COUNT(*)::int AS live,
             COUNT(*) FILTER (WHERE is_activated = FALSE)::int AS to_activate
      FROM merchant_offers
      WHERE user_id = ${userId}
        AND card_id = ${params.cardId}
        AND is_used = FALSE
        AND disappeared_at IS NULL
        AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    `;

    const card = await cardsDB.queryRow<{ issuer: string }>`
      SELECT issuer FROM cards WHERE id = ${params.cardId}
    `;

    return {
      lastSyncedAt: last?.created_at.toISOString(),
      lastKind: last?.kind,
      liveOffers: counts?.live ?? 0,
      offersToActivate: counts?.to_activate ?? 0,
      portalUrl: card ? portalUrlFor(card.issuer) : undefined,
    };
  }
);
