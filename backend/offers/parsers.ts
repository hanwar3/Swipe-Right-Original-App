/**
 * Issuer offer-email parsing.
 *
 * Two observations shape this:
 *
 *   1. Offer TERMS are highly regular. "Spend $50, get $10 back" and "Earn 10%
 *      back" vary little across issuers and barely at all within one. Regex
 *      handles them well and deterministically.
 *
 *   2. Merchant NAMES are not regular. They are whatever the brand is called,
 *      sitting in whatever markup that week's template used. Heuristics get
 *      most of them and quietly mangle the rest.
 *
 * So the deterministic pass owns the terms and reports its own confidence on
 * the name. Anything it cannot name is handed to the model, which is allowed
 * to extract but never to invent: every field it returns is re-validated
 * against the same regexes before it is written.
 */

export interface ParsedOffer {
  merchantName: string;
  offerDescription: string;
  cashbackRate?: number;
  cashbackAmountCents?: number;
  minimumSpendCents?: number;
  endDate?: string;
  /** 0..1. Below NAME_CONFIDENCE_FLOOR the row is written but flagged. */
  confidence: number;
}

export const NAME_CONFIDENCE_FLOOR = 0.45;

const ISSUER_DOMAINS: Record<string, string> = {
  "americanexpress.com": "American Express",
  "aexp.com": "American Express",
  "welcome.aexp.com": "American Express",
  "chase.com": "Chase",
  "jpmchase.com": "Chase",
  "bankofamerica.com": "Bank of America",
  "discover.com": "Discover",
  "citi.com": "Citi",
  "citibank.com": "Citi",
  "wellsfargo.com": "Wells Fargo",
  "capitalone.com": "Capital One",
};

/** The address the mail claims to come from is a hint, never an authority. */
export function detectIssuer(fromAddress: string, subject: string): string | null {
  const from = (fromAddress || "").toLowerCase();
  for (const [domain, issuer] of Object.entries(ISSUER_DOMAINS)) {
    if (from.includes(domain)) return issuer;
  }
  // Forwarded mail often loses the original sender, so fall back to the text.
  const s = `${subject || ""}`.toLowerCase();
  if (s.includes("amex") || s.includes("american express")) return "American Express";
  if (s.includes("chase")) return "Chase";
  if (s.includes("bankamerideals") || s.includes("bank of america")) return "Bank of America";
  if (s.includes("discover")) return "Discover";
  if (s.includes("citi")) return "Citi";
  if (s.includes("wells fargo")) return "Wells Fargo";
  if (s.includes("capital one")) return "Capital One";
  return null;
}

/** Crude but sufficient: issuer mail is layout-heavy, we only want the words. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function money(raw: string): number {
  return Math.round(parseFloat(raw.replace(/,/g, "")) * 100);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "expires December 31, 2026" / "valid through 12/31/26" / "by Dec 31" */
export function findExpiry(text: string, now = new Date()): string | undefined {
  const near = /(?:expires?|valid\s+through|valid\s+until|use\s+by|ends?|through)\s*:?\s*([^\n.;]{3,40})/i;
  const m = near.exec(text);
  const scope = m ? m[1] : text;

  const named = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i.exec(scope);
  if (named) {
    const mon = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) {
      const day = parseInt(named[2], 10);
      let year = named[3] ? parseInt(named[3], 10) : now.getUTCFullYear();
      const d = new Date(Date.UTC(year, mon, day));
      // A bare "Dec 31" in January means this year; in December it means next.
      if (!named[3] && d.getTime() < now.getTime() - 86400000 * 30) {
        d.setUTCFullYear(year + 1);
      }
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
  }

  const numeric = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(scope);
  if (numeric) {
    let year = parseInt(numeric[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, parseInt(numeric[1], 10) - 1, parseInt(numeric[2], 10)));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return undefined;
}

/**
 * "card ending in 1234", "•••• 1234", "account ending 1234", "(...1234)".
 *
 * This is the strongest attribution signal there is, and issuer offer mail
 * carries it far more often than not. Deliberately conservative: a wrong last
 * four attributes an offer to the wrong card, which is worse than holding it.
 */
export function findLastFour(text: string): string | undefined {
  const patterns = [
    /(?:card|account)\s+ending\s+(?:in\s+)?(\d{4})\b/i,
    /ending\s+in\s+(\d{4})\b/i,
    /[•*x·•]{2,}\s?[-\s]?(\d{4})\b/i,
    /\(\s*(?:\.{3}|…)\s*(\d{4})\s*\)/,
    /\bxxxx[-\s]?(\d{4})\b/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Forwarding usually rewrites From but leaves a trail of the original
 * recipient. That tells us which mailbox the card is registered to, which
 * tells us the card when the wallet holds two from one issuer.
 */
export function findOriginalRecipient(text: string): string | undefined {
  const m =
    /^(?:delivered-to|x-forwarded-to|original-to|to)\s*:\s*([^\s<>,;]+@[^\s<>,;]+)/im.exec(text) ||
    /\bto\s*:\s*[^\n<]*<([^>]+@[^>]+)>/i.exec(text);
  return m ? m[1].toLowerCase().replace(/[.,;]$/, "") : undefined;
}

/** Terms only. Returns undefined when the block carries no recognisable offer. */
export function parseTerms(block: string): Omit<ParsedOffer, "merchantName" | "confidence"> | undefined {
  const t = block.replace(/\s+/g, " ").trim();

  // "Spend $50, get $10 back" / "Spend $50 or more, earn $10 back"
  let m = /spend\s+\$?\s?(\d[\d,]*(?:\.\d{2})?)[^.$%]{0,40}?(?:get|earn|receive)\s+\$\s?(\d[\d,]*(?:\.\d{2})?)/i.exec(t);
  if (m) {
    return {
      offerDescription: `Spend $${m[1]}, get $${m[2]} back`,
      minimumSpendCents: money(m[1]),
      cashbackAmountCents: money(m[2]),
      endDate: findExpiry(t),
    };
  }

  // "Get $10 back on a purchase of $50 or more"
  m = /(?:get|earn|receive)\s+\$\s?(\d[\d,]*(?:\.\d{2})?)\s+back[^.$%]{0,40}?\$\s?(\d[\d,]*(?:\.\d{2})?)/i.exec(t);
  if (m) {
    return {
      offerDescription: `Get $${m[1]} back on $${m[2]} or more`,
      cashbackAmountCents: money(m[1]),
      minimumSpendCents: money(m[2]),
      endDate: findExpiry(t),
    };
  }

  // "Earn 10% back" / "10% cash back"
  m = /(\d{1,2}(?:\.\d)?)\s?%\s*(?:cash\s*)?back/i.exec(t);
  if (m) {
    const rate = parseFloat(m[1]);
    const cap = /up\s+to\s+\$\s?(\d[\d,]*(?:\.\d{2})?)/i.exec(t);
    return {
      offerDescription: cap ? `${rate}% back, up to $${cap[1]}` : `${rate}% back`,
      cashbackRate: rate,
      endDate: findExpiry(t),
    };
  }

  // "$25 statement credit"
  m = /\$\s?(\d[\d,]*(?:\.\d{2})?)\s+statement\s+credit/i.exec(t);
  if (m) {
    return {
      offerDescription: `$${m[1]} statement credit`,
      cashbackAmountCents: money(m[1]),
      endDate: findExpiry(t),
    };
  }

  return undefined;
}

const NOT_A_MERCHANT =
  /^(spend|get|earn|receive|save|up to|terms|offer|expires?|valid|add to card|shop now|learn more|see|view|your|new|this|the|click|activate|enroll|limited|exclusive|redeem|conditions|apply|back|cash|statement|credit|card|account|hello|hi|dear)\b/i;

/** The merchant is usually the shortest name-shaped line in the block. */
function guessMerchant(block: string): { name: string; confidence: number } | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 48);

  const candidates = lines.filter(
    (l) =>
      !NOT_A_MERCHANT.test(l) &&
      !/\d\s?%/.test(l) &&
      !/\$\s?\d/.test(l) &&
      /[A-Za-z]/.test(l) &&
      // Title Case, ALL CAPS, or a known brand shape like "7-Eleven"
      /^[A-Z0-9][\w'’&.\-]*(\s+[A-Z0-9][\w'’&.\-]*){0,4}$/.test(l)
  );

  if (candidates.length === 0) return null;
  // Earlier lines in a block are more likely to be the heading.
  const name = candidates[0];
  // One clean candidate is a good sign; many means we are probably guessing.
  const confidence = candidates.length === 1 ? 0.8 : candidates.length <= 3 ? 0.6 : 0.4;
  return { name, confidence };
}

/**
 * Deterministic pass over the whole mail. Blocks are separated by blank lines,
 * which survives the html-to-text conversion well enough for issuer templates.
 */
export function parseOffersDeterministic(text: string): ParsedOffer[] {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  const out: ParsedOffer[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const terms = parseTerms(block);
    if (!terms) continue;
    const merchant = guessMerchant(block);
    if (!merchant) continue;

    const key = `${merchant.name.toLowerCase()}|${terms.offerDescription.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ merchantName: merchant.name, ...terms, confidence: merchant.confidence });
  }
  return out;
}

/**
 * Re-validate anything the model returned. The model may find structure the
 * regexes missed, but it does not get to assert numbers that are not in the
 * source text, so every figure has to appear in the mail.
 */
export function validateAgainstSource(offers: ParsedOffer[], sourceText: string): ParsedOffer[] {
  const hay = sourceText.toLowerCase();
  return offers.filter((o) => {
    if (!o.merchantName || o.merchantName.length > 60) return false;
    if (!hay.includes(o.merchantName.toLowerCase())) return false;
    if (o.cashbackRate !== undefined) {
      if (o.cashbackRate <= 0 || o.cashbackRate > 100) return false;
      if (!hay.includes(String(o.cashbackRate))) return false;
    }
    if (o.cashbackAmountCents !== undefined) {
      const dollars = (o.cashbackAmountCents / 100).toString().replace(/\.00$/, "");
      if (!hay.includes(dollars)) return false;
    }
    if (o.minimumSpendCents !== undefined) {
      const dollars = (o.minimumSpendCents / 100).toString().replace(/\.00$/, "");
      if (!hay.includes(dollars)) return false;
    }
    return true;
  });
}
