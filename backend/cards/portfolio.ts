import { api, APIError } from "encore.dev/api";
import { cardsDB } from "./db";
import { currentUserId } from "../lib/session";
import type { Card, CardCategory } from "./list";

export interface UserCard {
  id: number;
  card: Card;
  nickname?: string;
  creditLimit?: number;
  currentBalance: number;
  isActive: boolean;
  addedAt: string;
}

export interface AddToPortfolioRequest {
  cardId: number;
  nickname?: string;
  creditLimit?: number;
}

export interface UpdatePortfolioCardRequest {
  portfolioId: number;
  nickname?: string;
  creditLimit?: number;
  currentBalance?: number;
  isActive?: boolean;
}

export interface UserPortfolioResponse {
  cards: UserCard[];
}

function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || null;
}

function cleanAmount(raw: unknown, label: string): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 10_000_000) {
    throw APIError.invalidArgument(`${label} must be a positive amount`);
  }
  return raw;
}

async function categoriesFor(cardIds: number[]): Promise<Map<number, CardCategory[]>> {
  const out = new Map<number, CardCategory[]>();
  if (cardIds.length === 0) return out;
  const rows = await cardsDB.queryAll`
    SELECT id, card_id, category, cashback_rate, is_rotating, valid_until
    FROM card_categories
    WHERE card_id = ANY(${cardIds}::bigint[])
    ORDER BY cashback_rate DESC
  `;
  for (const cat of rows) {
    const list = out.get(Number(cat.card_id)) ?? [];
    list.push({
      id: cat.id,
      category: cat.category,
      cashbackRate: cat.cashback_rate,
      isRotating: cat.is_rotating,
      validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split("T")[0] : undefined,
    });
    out.set(Number(cat.card_id), list);
  }
  return out;
}

function toUserCard(row: Record<string, any>, categories: CardCategory[]): UserCard {
  return {
    id: row.id,
    card: {
      id: Number(row.card_id),
      name: row.name,
      issuer: row.issuer,
      imageUrl: row.image_url,
      annualFee: row.annual_fee,
      network: row.network || "Visa",
      type: row.type || "credit",
      categories,
    },
    nickname: row.nickname ?? undefined,
    creditLimit: row.credit_limit ?? undefined,
    currentBalance: row.current_balance,
    isActive: row.is_active,
    addedAt: new Date(row.added_at).toISOString(),
  };
}

async function loadPortfolioCard(userId: string, portfolioId: number): Promise<UserCard> {
  const row = await cardsDB.queryRow`
    SELECT up.id, up.card_id, up.nickname, up.credit_limit, up.current_balance,
           up.is_active, up.added_at,
           c.name, c.issuer, c.image_url, c.annual_fee, c.network, c.type
    FROM user_portfolios up
    JOIN cards c ON up.card_id = c.id
    WHERE up.id = ${portfolioId} AND up.user_id = ${userId}
  `;
  if (!row) throw APIError.notFound("Portfolio card not found");
  const cats = await categoriesFor([Number(row.card_id)]);
  return toUserCard(row, cats.get(Number(row.card_id)) ?? []);
}

// The signed-in user's cards. The extension may read it to label synced cards.
export const getUserPortfolio = api(
  { expose: true, auth: true, method: "GET", path: "/cards/portfolio" },
  async (): Promise<UserPortfolioResponse> => {
    const userId = currentUserId({ allowExtension: true });
    const rows = await cardsDB.queryAll`
      SELECT up.id, up.card_id, up.nickname, up.credit_limit, up.current_balance,
             up.is_active, up.added_at,
             c.name, c.issuer, c.image_url, c.annual_fee, c.network, c.type
      FROM user_portfolios up
      JOIN cards c ON up.card_id = c.id
      WHERE up.user_id = ${userId}
      ORDER BY up.added_at DESC
    `;
    const cats = await categoriesFor(rows.map((r) => Number(r.card_id)));
    return { cards: rows.map((r) => toUserCard(r, cats.get(Number(r.card_id)) ?? [])) };
  }
);

// Adds a card to the signed-in user's portfolio.
export const addToPortfolio = api<AddToPortfolioRequest, UserCard>(
  { expose: true, auth: true, method: "POST", path: "/cards/portfolio/add" },
  async (req) => {
    const userId = currentUserId();
    const card = await cardsDB.queryRow`SELECT id FROM cards WHERE id = ${req.cardId}`;
    if (!card) throw APIError.notFound("Card not found");

    const count = await cardsDB.queryRow<{ n: number }>`
      SELECT COUNT(*)::int AS n FROM user_portfolios WHERE user_id = ${userId}
    `;
    if ((count?.n ?? 0) >= 50) throw APIError.resourceExhausted("A wallet holds up to 50 cards");

    const inserted = await cardsDB.queryRow`
      INSERT INTO user_portfolios (user_id, card_id, nickname, credit_limit)
      SELECT ${userId}, ${req.cardId}, ${cleanNickname(req.nickname)}, ${cleanAmount(req.creditLimit, "Credit limit")}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_portfolios WHERE user_id = ${userId} AND card_id = ${req.cardId}
      )
      RETURNING id
    `;
    if (!inserted) throw APIError.alreadyExists("Card already in portfolio");
    return loadPortfolioCard(userId, inserted.id);
  }
);

// Removes a card from the signed-in user's portfolio.
export const removeFromPortfolio = api<{ portfolioId: number }, { success: boolean }>(
  { expose: true, auth: true, method: "DELETE", path: "/cards/portfolio/:portfolioId" },
  async ({ portfolioId }) => {
    const userId = currentUserId();
    const removed = await cardsDB.queryRow`
      DELETE FROM user_portfolios
      WHERE id = ${portfolioId} AND user_id = ${userId}
      RETURNING id, card_id
    `;
    if (!removed) throw APIError.notFound("Portfolio card not found");
    // Offers and portal credits belong to the card in this wallet; drop them with it.
    await cardsDB.exec`
      DELETE FROM merchant_offers WHERE user_id = ${userId} AND card_id = ${removed.card_id}
    `;
    await cardsDB.exec`
      DELETE FROM card_benefits WHERE user_id = ${userId} AND card_id = ${removed.card_id}
    `;
    return { success: true };
  }
);

// Updates a card in the signed-in user's portfolio.
export const updatePortfolioCard = api<UpdatePortfolioCardRequest, UserCard>(
  { expose: true, auth: true, method: "PUT", path: "/cards/portfolio/update" },
  async (req) => {
    const userId = currentUserId();
    const updated = await cardsDB.queryRow`
      UPDATE user_portfolios
      SET nickname = COALESCE(${cleanNickname(req.nickname)}, nickname),
          credit_limit = COALESCE(${cleanAmount(req.creditLimit, "Credit limit")}, credit_limit),
          current_balance = COALESCE(${cleanAmount(req.currentBalance, "Balance")}, current_balance),
          is_active = COALESCE(${typeof req.isActive === "boolean" ? req.isActive : null}, is_active),
          updated_at = NOW()
      WHERE id = ${req.portfolioId} AND user_id = ${userId}
      RETURNING id
    `;
    if (!updated) throw APIError.notFound("Portfolio card not found");
    return loadPortfolioCard(userId, updated.id);
  }
);
