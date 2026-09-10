import { api, APIError, Header } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { cardsDB } from "../cards/db";
import {
  detectIssuer,
  findLastFour,
  findOriginalRecipient,
  htmlToText,
  parseOffersDeterministic,
  validateAgainstSource,
  NAME_CONFIDENCE_FLOOR,
  type ParsedOffer,
} from "./parsers";

/**
 * Inbound webhook for forwarded issuer offer mail.
 *
 * Provider-neutral on purpose: Mailgun Routes, Postmark inbound, SendGrid
 * Inbound Parse and CloudMailin all POST roughly this shape, so the adapter is
 * whatever thin mapping your provider needs, not a rewrite of this file.
 *
 * Nothing here trusts the sender. Identity comes from the token in the
 * recipient address, and the endpoint itself is behind a shared secret so the
 * public path cannot be used to write rows into someone's account.
 */

const inboxSecret = secret("OfferInboxSecret");
const geminiApiKey = secret("GeminiApiKey");

/** Keep failed mail long enough to fix the parser, not long enough to be a liability. */
const RAW_RETENTION_DAYS = 14;
const RAW_EXCERPT_CHARS = 4000;

export interface InboundEmail {
  /** The address the mail was delivered to, e.g. offers+abc123@... */
  to: string;
  from: string;
  subject?: string;
  /** Plain text body, when the provider supplies one. */
  text?: string;
  /** HTML body. Preferred, because issuer offer mail is almost always HTML. */
  html?: string;
  secretHeader?: Header<"X-Inbox-Secret">;
}

export interface IngestResponse {
  /** "pending" means the offers were kept but need the user to say which card. */
  status: "ok" | "unparsed" | "pending" | "rejected";
  issuer?: string;
  offersFound: number;
  offersWritten: number;
  /** Offers written with a shaky merchant name, worth a user glance. */
  lowConfidence: number;
  /** Which signal placed the card. Useful when attribution looks wrong. */
  attributedBy?: string;
}

/**
 * offers+<userToken>@domain            one address for the whole wallet
 * offers+<userToken>.<cardToken>@domain one address per card
 *
 * The second form exists because a wallet can hold two cards from the same
 * issuer, and issuer mail does not always say which. Someone who wants
 * attribution to be exact rather than inferred can forward each card's mail to
 * its own address and skip the guessing entirely.
 */
function tokensFromAddress(to: string): { userToken: string; cardToken?: string } | null {
  const addr = (to || "").toLowerCase().trim().replace(/^.*</, "").replace(/>.*$/, "");
  const local = addr.split("@")[0];
  if (!local) return null;
  const plus = local.indexOf("+");
  const tail = plus >= 0 ? local.slice(plus + 1) : local;
  const [userToken, cardToken] = tail.split(".");
  if (!/^[a-z2-9]{8,64}$/.test(userToken || "")) return null;
  return {
    userToken,
    cardToken: cardToken && /^[a-z2-9]{6,64}$/.test(cardToken) ? cardToken : undefined,
  };
}

/** Ask the model only when the regexes found nothing. It extracts, never invents. */
async function modelExtract(text: string, issuer: string | null): Promise<ParsedOffer[]> {
  let key: string;
  try {
    key = geminiApiKey();
    if (!key) return [];
  } catch {
    return [];
  }

  const instruction = `Extract credit card merchant offers from this ${issuer || "issuer"} email.

Return ONLY a JSON array. Each element:
{"merchantName": string, "offerDescription": string, "cashbackRate": number|null, "cashbackAmountCents": number|null, "minimumSpendCents": number|null, "endDate": "YYYY-MM-DD"|null}

Rules:
- Copy merchant names exactly as they appear. Do not expand, correct or guess them.
- Money in cents. $10 is 1000.
- Only include an offer if the email actually states its terms.
- If there are no offers, return [].
- No prose, no code fences, just the array.`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }, { text: text.slice(0, 24000) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        }),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const json = raw.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];

    return arr
      .filter((o: any) => o && typeof o.merchantName === "string")
      .map((o: any) => ({
        merchantName: String(o.merchantName).trim(),
        offerDescription: String(o.offerDescription ?? "").trim() || "Offer",
        cashbackRate: typeof o.cashbackRate === "number" ? o.cashbackRate : undefined,
        cashbackAmountCents: typeof o.cashbackAmountCents === "number" ? o.cashbackAmountCents : undefined,
        minimumSpendCents: typeof o.minimumSpendCents === "number" ? o.minimumSpendCents : undefined,
        endDate: typeof o.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.endDate) ? o.endDate : undefined,
        confidence: 0.55,
      }));
  } catch {
    return [];
  }
}

export const ingest = api<InboundEmail, IngestResponse>(
  { expose: true, method: "POST", path: "/offers/ingest" },
  async (mail) => {
    // 1. Only our mail provider may call this.
    let expected = "";
    try { expected = inboxSecret(); } catch { expected = ""; }
    if (!expected || mail.secretHeader !== expected) {
      throw APIError.unauthenticated("bad inbox secret");
    }

    // 2. Identity is the address it arrived at, never the From header.
    const tokens = tokensFromAddress(mail.to);
    if (!tokens) throw APIError.invalidArgument("no token in recipient address");

    const owner = await cardsDB.queryRow<{ user_id: string }>`
      SELECT user_id FROM offer_inboxes WHERE token = ${tokens.userToken}
    `;
    if (!owner) throw APIError.notFound("unknown inbox");
    const userId = owner.user_id;

    const subject = (mail.subject || "").slice(0, 300);
    const issuer = detectIssuer(mail.from, subject);
    const text = mail.html ? htmlToText(mail.html) : (mail.text || "");

    // 3. Regexes first. The model only sees mail they could not read.
    let offers = parseOffersDeterministic(text);
    let parser = "deterministic";
    if (offers.length === 0) {
      const guessed = await modelExtract(text, issuer);
      offers = validateAgainstSource(guessed, text);
      parser = offers.length > 0 ? "model" : "none";
    }

    // 4. Which card do these belong to?
    //
    // One SwipeRight account can sit over cards registered to several
    // different mailboxes, and a wallet can hold two cards from one issuer.
    // So issuer alone is not an answer. Signals, strongest first, and an
    // offer we cannot place is held rather than guessed at.
    const portfolio = await cardsDB.queryAll<{
      card_id: number; name: string; issuer: string;
      last_four: string | null; card_email: string | null; inbox_token: string | null;
    }>`
      SELECT up.card_id, c.name, c.issuer, up.last_four, up.card_email, up.inbox_token
      FROM user_portfolios up
      JOIN cards c ON c.id = up.card_id
      WHERE up.user_id = ${userId} AND up.is_active = TRUE
    `;

    const lowerText = text.toLowerCase();
    const lastFour = findLastFour(text);
    const originalTo = findOriginalRecipient(mail.text || mail.html || "") ?? undefined;

    const sameIssuer = issuer
      ? portfolio.filter((p) =>
          p.issuer.toLowerCase().includes(issuer.toLowerCase().split(" ")[0])
        )
      : portfolio;

    let cardId: number | null = null;
    let how = "none";

    // a. a per-card forwarding address: unambiguous by construction
    if (tokens.cardToken) {
      const byToken = portfolio.find((p) => p.inbox_token === tokens.cardToken);
      if (byToken) { cardId = byToken.card_id; how = "card_address"; }
    }
    // b. the last four digits printed in the mail
    if (cardId === null && lastFour) {
      const byDigits = portfolio.filter((p) => p.last_four === lastFour);
      if (byDigits.length === 1) { cardId = byDigits[0].card_id; how = "last_four"; }
    }
    // c. the mailbox the card is registered to, if the forward preserved it
    if (cardId === null && originalTo) {
      const byEmail = sameIssuer.filter(
        (p) => p.card_email && p.card_email.toLowerCase() === originalTo
      );
      if (byEmail.length === 1) { cardId = byEmail[0].card_id; how = "card_email"; }
    }
    // d. the card named in the body
    if (cardId === null) {
      const named = sameIssuer.filter((p) => lowerText.includes(p.name.toLowerCase()));
      if (named.length === 1) { cardId = named[0].card_id; how = "card_name"; }
    }
    // e. only one card from that issuer, so there is nothing to confuse
    if (cardId === null && sameIssuer.length === 1) {
      cardId = sameIssuer[0].card_id;
      how = "sole_issuer_card";
    }

    const purgeAfter = new Date(Date.now() + RAW_RETENTION_DAYS * 86400000)
      .toISOString().split("T")[0];

    let status: IngestResponse["status"] = "ok";
    if (offers.length === 0) status = "unparsed";
    else if (cardId === null) status = "pending";

    const logged = await cardsDB.queryRow<{ id: number }>`
      INSERT INTO offer_ingests
        (user_id, issuer, from_address, subject, parser, offers_found, offers_written,
         status, raw_excerpt, purge_after)
      VALUES
        (${userId}, ${issuer}, ${(mail.from || "").slice(0, 200)}, ${subject}, ${parser},
         ${offers.length}, 0, ${status},
         ${status === "ok" ? null : text.slice(0, RAW_EXCERPT_CHARS)},
         ${status === "ok" ? null : purgeAfter})
      RETURNING id
    `;
    const ingestId = logged!.id;

    if (status === "unparsed") {
      await cardsDB.exec`
        UPDATE offer_inboxes
        SET received_count = received_count + 1, last_received_at = NOW()
        WHERE user_id = ${userId}
      `;
      return {
        status,
        issuer: issuer ?? undefined,
        offersFound: 0,
        offersWritten: 0,
        lowConfidence: 0,
      };
    }

    // 5. Write. An offer we could not attribute is stored with a null card and
    //    whatever we do know about it, so the user can place it with one tap
    //    instead of losing it. The unique index makes a re-forward an update
    //    rather than a duplicate, and rows the user entered by hand are never
    //    overwritten by a parse.
    let written = 0;
    let low = 0;
    for (const o of offers) {
      if (o.confidence < NAME_CONFIDENCE_FLOOR) low++;
      const res = await cardsDB.queryAll<{ id: number }>`
        INSERT INTO merchant_offers
          (user_id, card_id, merchant_name, offer_description, cashback_rate,
           cashback_amount, minimum_spend, offer_type, end_date, is_activated,
           source, source_ingest_id, confidence, pending_issuer, pending_last_four)
        VALUES
          (${userId}, ${cardId}, ${o.merchantName}, ${o.offerDescription},
           ${o.cashbackRate ?? null}, ${o.cashbackAmountCents ?? null},
           ${o.minimumSpendCents ?? null}, 'cashback', ${o.endDate ?? null}, FALSE,
           'email', ${ingestId}, ${o.confidence},
           ${cardId === null ? issuer : null}, ${cardId === null ? (lastFour ?? null) : null})
        ON CONFLICT (user_id, COALESCE(card_id, -1), LOWER(merchant_name), COALESCE(end_date, DATE '2099-12-31'))
        DO UPDATE SET
          offer_description = EXCLUDED.offer_description,
          cashback_rate     = EXCLUDED.cashback_rate,
          cashback_amount   = EXCLUDED.cashback_amount,
          minimum_spend     = EXCLUDED.minimum_spend,
          confidence        = EXCLUDED.confidence,
          source_ingest_id  = EXCLUDED.source_ingest_id,
          updated_at        = NOW()
        WHERE merchant_offers.source = 'email'
        RETURNING id
      `;
      written += res.length;
    }

    await cardsDB.exec`
      UPDATE offer_ingests SET offers_written = ${written} WHERE id = ${ingestId}
    `;
    await cardsDB.exec`
      UPDATE offer_inboxes
      SET received_count = received_count + 1, last_received_at = NOW()
      WHERE user_id = ${userId}
    `;

    return {
      status,
      issuer: issuer ?? undefined,
      offersFound: offers.length,
      offersWritten: written,
      lowConfidence: low,
      attributedBy: cardId === null ? undefined : how,
    };
  }
);

/**
 * Offers we held because we could not tell which card they belong to.
 * The user answers once and we remember the last four, so the same card
 * places itself automatically from then on.
 */
export const pendingOffers = api<{ userId: string }, {
  offers: { id: number; merchantName: string; offerDescription: string;
            issuer?: string; lastFour?: string; endDate?: string }[];
}>(
  { expose: true, method: "GET", path: "/offers/pending" },
  async (req) => {
    const rows = await cardsDB.queryAll<{
      id: number; merchant_name: string; offer_description: string;
      pending_issuer: string | null; pending_last_four: string | null; end_date: Date | null;
    }>`
      SELECT id, merchant_name, offer_description, pending_issuer, pending_last_four, end_date
      FROM merchant_offers
      WHERE user_id = ${req.userId} AND card_id IS NULL AND is_used = FALSE
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return {
      offers: rows.map((r) => ({
        id: r.id,
        merchantName: r.merchant_name,
        offerDescription: r.offer_description,
        issuer: r.pending_issuer ?? undefined,
        lastFour: r.pending_last_four ?? undefined,
        endDate: r.end_date ? r.end_date.toISOString().split("T")[0] : undefined,
      })),
    };
  }
);

/** Place a held offer on a card, and learn the card's last four while we are at it. */
export const attributeOffer = api<{ userId: string; offerId: number; cardId: number }, { ok: boolean }>(
  { expose: true, method: "POST", path: "/offers/attribute" },
  async (req) => {
    const row = await cardsDB.queryRow<{ pending_last_four: string | null }>`
      UPDATE merchant_offers
      SET card_id = ${req.cardId}, pending_issuer = NULL, pending_last_four = NULL, updated_at = NOW()
      WHERE id = ${req.offerId} AND user_id = ${req.userId} AND card_id IS NULL
      RETURNING pending_last_four
    `;
    if (!row) return { ok: false };

    // The answer teaches us the digits, so the next mail places itself.
    if (row.pending_last_four) {
      await cardsDB.exec`
        UPDATE user_portfolios
        SET last_four = ${row.pending_last_four}
        WHERE user_id = ${req.userId} AND card_id = ${req.cardId} AND last_four IS NULL
      `;
    }
    return { ok: true };
  }
);
