import { api } from "encore.dev/api";
import { cardsDB } from "./db";
import { cached } from "../lib/cache";

export interface Card {
  id: number;
  name: string;
  issuer: string;
  imageUrl: string;
  annualFee: number;
  network: string;
  type: string; // 'credit' | 'debit'
  applyUrl?: string;
  categories: CardCategory[];
}

export interface CardCategory {
  id: number;
  category: string;
  cashbackRate: number;
  isRotating: boolean;
  validUntil?: string;
}

export interface ListCardsResponse {
  cards: Card[];
}

/** Every card with its categories, in two queries however many cards there are. */
export async function loadCatalogue(): Promise<Card[]> {
  const cardRows = await cardsDB.queryAll`
    SELECT id, name, issuer, image_url, annual_fee, network, type
    FROM cards
    ORDER BY name
  `;
  const categoryRows = await cardsDB.queryAll`
    SELECT id, card_id, category, cashback_rate, is_rotating, valid_until
    FROM card_categories
    ORDER BY card_id, cashback_rate DESC
  `;
  return attachCategories(cardRows, categoryRows);
}

/** Categories for many cards in one query, keyed by card id. */
export async function categoriesFor(cardIds: number[]): Promise<Map<number, CardCategory[]>> {
  if (!cardIds.length) return new Map();
  const rows = await cardsDB.queryAll`
    SELECT id, card_id, category, cashback_rate, is_rotating, valid_until
    FROM card_categories
    WHERE card_id = ANY(${cardIds}::bigint[])
    ORDER BY card_id, cashback_rate DESC
  `;
  const byCard = new Map<number, CardCategory[]>();
  for (const card of attachCategories(cardIds.map((id) => ({ id })), rows)) byCard.set(Number(card.id), card.categories);
  return byCard;
}

/** Groups category rows onto their cards (rows must carry card_id). */
export function attachCategories(cardRows: Record<string, any>[], categoryRows: Record<string, any>[]): Card[] {
  const byCard = new Map<number, CardCategory[]>();
  for (const cat of categoryRows) {
    const list = byCard.get(Number(cat.card_id)) ?? [];
    list.push({
      id: cat.id,
      category: cat.category,
      cashbackRate: cat.cashback_rate,
      isRotating: cat.is_rotating,
      validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split("T")[0] : undefined,
    });
    byCard.set(Number(cat.card_id), list);
  }
  return cardRows.map((row) => ({
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    imageUrl: row.image_url,
    annualFee: row.annual_fee,
    network: row.network || "Visa",
    type: row.type || "credit",
    categories: byCard.get(Number(row.id)) ?? [],
  }));
}

// The public card catalogue. Every app open asks for it, so each instance
// serves it from memory for a minute.
export const list = api<void, ListCardsResponse>(
  { expose: true, method: "GET", path: "/cards" },
  async () => ({ cards: await cached("cards:catalogue", 60_000, loadCatalogue) })
);
