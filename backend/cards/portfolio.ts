import { api, APIError } from "encore.dev/api";
import { cardsDB } from "./db";
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

// Retrieves user's card portfolio.
export const getUserPortfolio = api<{ userId: string }, UserPortfolioResponse>(
  { expose: true, method: "GET", path: "/cards/portfolio/:userId" },
  async (params) => {
    const userCards: UserCard[] = [];
    
    const portfolioRows = await cardsDB.queryAll`
      SELECT up.id, up.card_id, up.nickname, up.credit_limit, up.current_balance, 
             up.is_active, up.added_at,
             c.name, c.issuer, c.image_url, c.annual_fee, c.network
      FROM user_portfolios up
      JOIN cards c ON up.card_id = c.id
      WHERE up.user_id = ${params.userId}
      ORDER BY up.added_at DESC
    `;
    
    for (const row of portfolioRows) {
      const categoryRows = await cardsDB.queryAll`
        SELECT id, category, cashback_rate, is_rotating, valid_until
        FROM card_categories 
        WHERE card_id = ${row.card_id}
        ORDER BY cashback_rate DESC
      `;
      
      const categories: CardCategory[] = categoryRows.map(cat => ({
        id: cat.id,
        category: cat.category,
        cashbackRate: cat.cashback_rate,
        isRotating: cat.is_rotating,
        validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
      }));
      
      const card: Card = {
        id: row.card_id,
        name: row.name,
        issuer: row.issuer,
        imageUrl: row.image_url,
        annualFee: row.annual_fee,
        categories
      };
      
      userCards.push({
        id: row.id,
        card,
        nickname: row.nickname,
        creditLimit: row.credit_limit,
        currentBalance: row.current_balance,
        isActive: row.is_active,
        addedAt: row.added_at.toISOString()
      });
    }
    
    return { cards: userCards };
  }
);

// Adds a card to user's portfolio.
export const addToPortfolio = api<AddToPortfolioRequest & { userId: string }, UserCard>(
  { expose: true, method: "POST", path: "/cards/portfolio/:userId/add" },
  async (params) => {
    const { userId, cardId, nickname, creditLimit } = params;
    
    // Check if card exists
    const cardExists = await cardsDB.queryRow`
      SELECT id FROM cards WHERE id = ${cardId}
    `;
    
    if (!cardExists) {
      throw APIError.notFound("Card not found");
    }
    
    // Check if already in portfolio
    const existingPortfolioCard = await cardsDB.queryRow`
      SELECT id FROM user_portfolios WHERE user_id = ${userId} AND card_id = ${cardId}
    `;
    
    if (existingPortfolioCard) {
      throw APIError.alreadyExists("Card already in portfolio");
    }
    
    // Add to portfolio
    const portfolioCard = await cardsDB.queryRow`
      INSERT INTO user_portfolios (user_id, card_id, nickname, credit_limit)
      VALUES (${userId}, ${cardId}, ${nickname || null}, ${creditLimit || null})
      RETURNING id, nickname, credit_limit, current_balance, is_active, added_at
    `;
    
    if (!portfolioCard) {
      throw APIError.internal("Failed to add card to portfolio");
    }
    
    // Get full card details
    const cardDetails = await cardsDB.queryRow`
      SELECT name, issuer, image_url, annual_fee, network
      FROM cards WHERE id = ${cardId}
    `;
    
    const categoryRows = await cardsDB.queryAll`
      SELECT id, category, cashback_rate, is_rotating, valid_until
      FROM card_categories 
      WHERE card_id = ${cardId}
      ORDER BY cashback_rate DESC
    `;
    
    const categories: CardCategory[] = categoryRows.map(cat => ({
      id: cat.id,
      category: cat.category,
      cashbackRate: cat.cashback_rate,
      isRotating: cat.is_rotating,
      validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
    }));
    
    const card: Card = {
      id: cardId,
      name: cardDetails!.name,
      issuer: cardDetails!.issuer,
      imageUrl: cardDetails!.image_url,
      annualFee: cardDetails!.annual_fee,
      categories
    };
    
    return {
      id: portfolioCard.id,
      card,
      nickname: portfolioCard.nickname,
      creditLimit: portfolioCard.credit_limit,
      currentBalance: portfolioCard.current_balance,
      isActive: portfolioCard.is_active,
      addedAt: portfolioCard.added_at.toISOString()
    };
  }
);

// Removes a card from user's portfolio.
export const removeFromPortfolio = api<{ userId: string; portfolioId: number }, { success: boolean }>(
  { expose: true, method: "DELETE", path: "/cards/portfolio/:userId/:portfolioId" },
  async (params) => {
    const { userId, portfolioId } = params;
    
    const result = await cardsDB.queryRow`
      DELETE FROM user_portfolios 
      WHERE id = ${portfolioId} AND user_id = ${userId}
      RETURNING id
    `;
    
    if (!result) {
      throw APIError.notFound("Portfolio card not found");
    }
    
    return { success: true };
  }
);

// Updates a card in user's portfolio.
export const updatePortfolioCard = api<UpdatePortfolioCardRequest & { userId: string }, UserCard>(
  { expose: true, method: "PUT", path: "/cards/portfolio/:userId/update" },
  async (params) => {
    const { userId, portfolioId, nickname, creditLimit, currentBalance, isActive } = params;
    
    const updatedCard = await cardsDB.queryRow`
      UPDATE user_portfolios 
      SET nickname = COALESCE(${nickname}, nickname),
          credit_limit = COALESCE(${creditLimit}, credit_limit),
          current_balance = COALESCE(${currentBalance}, current_balance),
          is_active = COALESCE(${isActive}, is_active),
          updated_at = NOW()
      WHERE id = ${portfolioId} AND user_id = ${userId}
      RETURNING id, card_id, nickname, credit_limit, current_balance, is_active, added_at
    `;
    
    if (!updatedCard) {
      throw APIError.notFound("Portfolio card not found");
    }
    
    // Get full card details
    const cardDetails = await cardsDB.queryRow`
      SELECT name, issuer, image_url, annual_fee, network
      FROM cards WHERE id = ${updatedCard.card_id}
    `;
    
    const categoryRows = await cardsDB.queryAll`
      SELECT id, category, cashback_rate, is_rotating, valid_until
      FROM card_categories 
      WHERE card_id = ${updatedCard.card_id}
      ORDER BY cashback_rate DESC
    `;
    
    const categories: CardCategory[] = categoryRows.map(cat => ({
      id: cat.id,
      category: cat.category,
      cashbackRate: cat.cashback_rate,
      isRotating: cat.is_rotating,
      validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
    }));
    
    const card: Card = {
      id: updatedCard.card_id,
      name: cardDetails!.name,
      issuer: cardDetails!.issuer,
      imageUrl: cardDetails!.image_url,
      annualFee: cardDetails!.annual_fee,
      categories
    };
    
    return {
      id: updatedCard.id,
      card,
      nickname: updatedCard.nickname,
      creditLimit: updatedCard.credit_limit,
      currentBalance: updatedCard.current_balance,
      isActive: updatedCard.is_active,
      addedAt: updatedCard.added_at.toISOString()
    };
  }
);
