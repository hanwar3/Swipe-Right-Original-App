import { findExpiry, parseTerms, type ParsedOffer } from "./parsers";

/**
 * Reading a card portal page as text.
 *
 * The user copies their Chase Offers or Amex Offers page (or a single benefit
 * page) and pastes it in. That text is the rendered page, so it arrives as the
 * tiles read top to bottom:
 *
 *     Food Lion
 *     5% cash back
 *     Expiring soon
 *
 * which is a merchant line, a terms line, and optional flags. The same shape
 * covers Amex ("Spend $30, get $10 back" / "Added to Card"), so one scanner
 * handles both. Everything here is deterministic; the model only sees text
 * this file could not read, and never gets to invent a figure.
 */

export interface PortalOffer extends ParsedOffer {
  /** False means it pays nothing until the user adds it in the portal. */
  activated: boolean;
  /** The portal said it is about to expire but not when. */
  expiringSoon: boolean;
}

export interface PortalBenefit {
  name: string;
  /** The whole allowance, e.g. $300. */
  valueCents: number;
  /** How much of it is gone, straight from the portal. */
  usedCents: number;
  /** "Good through 6/15/2027", when the portal prints it. */
  endsOn?: string;
  period: "month" | "quarter" | "year";
}

const CASH_BACK = /^\$?\s?([\d,]+(?:\.\d{1,2})?)\s*(%?)\s*(?:cash\s*)?back\b/i;

/** Tile furniture: never a merchant name, never terms. */
const NOISE =
  /^(new|exclusive|added|add offer|add to card|added to card|offer added|expiring soon|expires?\b|ends?\b|see (more|all)|shop now|learn more|terms|details|all offers|offers?|back|\d+%?|\$[\d,.]+|[•·∙+✓✔]|)$/i;

const ACTIVATED = /\b(added to card|offer added|added|activated)\b/i;
const NOT_ACTIVATED = /\b(add to card|add offer|add deal)\b/i;

const money = (s: string) => Math.round(parseFloat(s.replace(/,/g, "")) * 100);

/** Portals label the account in the header: "Sapphire Reserve (...0771)". */
export function findAccountLastFour(text: string): string | undefined {
  const m =
    /\(\s*(?:\.{2,}|…|x+|\*+)\s*(\d{4})\s*\)/i.exec(text) ||
    /\b(?:ending|ending in|account ending)\s*(?:in\s*)?(\d{4})\b/i.exec(text);
  return m ? m[1] : undefined;
}

/** "Expires in 12 days" / "Expires 10/31/26", for tiles that print a deadline. */
function findTileExpiry(block: string, now = new Date()): string | undefined {
  const inDays = /expires?\s+in\s+(\d{1,3})\s+days?/i.exec(block);
  if (inDays) {
    const d = new Date(now.getTime() + parseInt(inDays[1], 10) * 86400000);
    return d.toISOString().split("T")[0];
  }
  const numeric = /(?:expires?|ends?|valid through)\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(block);
  if (numeric) {
    let y = parseInt(numeric[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, parseInt(numeric[1], 10) - 1, parseInt(numeric[2], 10)));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return findExpiry(block, now);
}

/**
 * Offers, as the grid renders them.
 *
 * A terms line is the anchor: the merchant is the nearest real line above it,
 * and the flags are in the two lines below. Anchoring on terms rather than on
 * merchant names means a portal can rename its badges without breaking this.
 */
export function parsePortalOffers(text: string, now = new Date()): PortalOffer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const out: PortalOffer[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // What are the terms? Either the grid's own "5% cash back" shorthand, or a
    // full sentence the mail parser already knows how to read.
    let terms: Omit<ParsedOffer, "merchantName" | "confidence"> | undefined;
    const short = CASH_BACK.exec(line);
    if (short) {
      const amount = short[1];
      const isPercent = short[2] === "%";
      terms = isPercent
        ? { offerDescription: `${amount}% back`, cashbackRate: parseFloat(amount), endDate: undefined }
        : { offerDescription: `$${amount} back`, cashbackAmountCents: money(amount), endDate: undefined };
    } else {
      terms = parseTerms(line);
    }
    if (!terms) continue;

    // The merchant is the closest line above that is not tile furniture.
    let merchantName: string | undefined;
    for (let b = i - 1; b >= 0 && b >= i - 4; b--) {
      const candidate = lines[b];
      if (NOISE.test(candidate) || CASH_BACK.test(candidate) || parseTerms(candidate)) continue;
      if (candidate.length > 60) continue;
      merchantName = candidate.replace(/[*†]+$/, "").trim();
      break;
    }
    if (!merchantName) continue;

    // Flags live just under the terms, and stop at the next tile: without that
    // stop, one tile's "Added" is read as the previous tile's activation.
    const tailLines: string[] = [];
    for (let f = i + 1; f < lines.length && f <= i + 3; f++) {
      if (CASH_BACK.test(lines[f]) || parseTerms(lines[f])) break;
      tailLines.push(lines[f]);
    }
    const tail = tailLines.join("\n");
    const block = `${merchantName}\n${line}\n${tail}`;
    const activated = ACTIVATED.test(tail) && !NOT_ACTIVATED.test(tail);
    const expiringSoon = /expiring soon/i.test(tail);

    const key = `${merchantName.toLowerCase()}|${terms.offerDescription.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      merchantName,
      ...terms,
      endDate: terms.endDate ?? findTileExpiry(block, now),
      confidence: 0.85,
      activated,
      expiringSoon,
    });
  }

  return out;
}

/**
 * A benefit page: one allowance, and how much of it is spent.
 *
 * The strongest signal is the progress pair the portal prints under the bar
 * ("$290/$300"). Failing that, "up to $300" is the allowance and "you've
 * received $290" is the spend. "Remaining" is handled by subtraction.
 */
export function parsePortalBenefits(text: string): PortalBenefit[] {
  const flat = text.replace(/\r?\n/g, "\n");
  const lines = flat.split("\n").map((l) => l.replace(/\s+/g, " ").trim());

  const pair = /\$\s?([\d,]+(?:\.\d{2})?)\s*\/\s*\$\s?([\d,]+(?:\.\d{2})?)/.exec(flat);
  const upTo = /up to \$\s?([\d,]+(?:\.\d{2})?)/i.exec(flat);
  const received = /(?:you've |you have )?received \$\s?([\d,]+(?:\.\d{2})?)/i.exec(flat);
  const used = /\$\s?([\d,]+(?:\.\d{2})?)\s+(?:used|spent|of your)/i.exec(flat);
  const remaining = /\$\s?([\d,]+(?:\.\d{2})?)\s+(?:remaining|left)/i.exec(flat);

  let valueCents: number | undefined;
  let usedCents: number | undefined;

  if (pair) {
    usedCents = money(pair[1]);
    valueCents = money(pair[2]);
  } else {
    if (upTo) valueCents = money(upTo[1]);
    if (received) usedCents = money(received[1]);
    else if (used) usedCents = money(used[1]);
    else if (remaining && valueCents !== undefined) usedCents = Math.max(0, valueCents - money(remaining[1]));
  }

  if (valueCents === undefined || valueCents <= 0) return [];
  if (usedCents === undefined) usedCents = 0;
  if (usedCents > valueCents) usedCents = valueCents;

  // The heading names the benefit: the first short line that says "credit".
  let name: string | undefined;
  for (const l of lines) {
    if (l.length < 4 || l.length > 64) continue;
    if (!/\b(credit|credits|membership|allowance|fee statement)\b/i.test(l)) continue;
    if (/^(benefit overview|how it works|terms)/i.test(l)) continue;
    name = l.replace(/[*†]+$/, "").trim();
    break;
  }
  if (!name) return [];

  const through =
    /good through\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(flat) ||
    /through\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(flat);
  let endsOn: string | undefined;
  if (through) {
    let y = parseInt(through[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, parseInt(through[1], 10) - 1, parseInt(through[2], 10)));
    if (!isNaN(d.getTime())) endsOn = d.toISOString().split("T")[0];
  }

  const period: PortalBenefit["period"] = /\bmonthly|each month|per month\b/i.test(flat)
    ? "month"
    : /\bquarterly|each quarter\b/i.test(flat)
      ? "quarter"
      : "year";

  return [{ name, valueCents, usedCents, endsOn, period }];
}

/** Which kind of page was pasted, so the writer knows what it may retire. */
export function classifyPaste(text: string): "offers" | "benefit" | "mixed" | "none" {
  const offers = parsePortalOffers(text).length;
  const benefits = parsePortalBenefits(text).length;
  if (offers && benefits) return "mixed";
  if (offers) return "offers";
  if (benefits) return "benefit";
  return "none";
}
