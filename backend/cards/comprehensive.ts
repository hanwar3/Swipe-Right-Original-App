import { api, APIError } from "encore.dev/api";
import { cardsDB } from "./db";
import type { Card, CardCategory } from "./list";

export interface ComprehensiveCard {
  id: number;
  name: string;
  issuer: string;
  network: string;
  imageUrl: string;
  annualFee: number;
  type: string; // 'credit' | 'debit'
  categories: CardCategory[];
  features: string[];
  welcomeBonus?: string;
  creditRange: string;
  applyUrl?: string;
  isPopular: boolean;
  rating: number;
  reviewCount: number;
}

export interface ComprehensiveCardsResponse {
  cards: ComprehensiveCard[];
  totalCount: number;
  popularCards: ComprehensiveCard[];
}

export interface SearchComprehensiveCardsParams {
  query?: string;
  issuer?: string;
  network?: string;
  category?: string;
  minCashback?: number;
  maxAnnualFee?: number;
  limit?: number;
  offset?: number;
}

// Retrieves comprehensive credit card database with advanced filtering.
export const getComprehensiveCards = api<SearchComprehensiveCardsParams, ComprehensiveCardsResponse>(
  { expose: true, method: "GET", path: "/cards/comprehensive" },
  async (params) => {
    const {
      query,
      issuer,
      network,
      category,
      minCashback,
      maxAnnualFee,
      limit = 20,
      offset = 0
    } = params;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Build dynamic WHERE clause
    if (query) {
      whereConditions.push(`(LOWER(c.name) LIKE $${paramIndex} OR LOWER(c.issuer) LIKE $${paramIndex})`);
      queryParams.push(`%${query.toLowerCase()}%`);
      paramIndex++;
    }

    if (issuer) {
      whereConditions.push(`c.issuer = $${paramIndex}`);
      queryParams.push(issuer);
      paramIndex++;
    }

    if (network) {
      whereConditions.push(`c.network = $${paramIndex}`);
      queryParams.push(network);
      paramIndex++;
    }

    if (maxAnnualFee !== undefined) {
      whereConditions.push(`c.annual_fee <= $${paramIndex}`);
      queryParams.push(maxAnnualFee);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM card_categories cc 
        WHERE cc.card_id = c.id 
        AND LOWER(cc.category) LIKE $${paramIndex}
      )`);
      queryParams.push(`%${category.toLowerCase()}%`);
      paramIndex++;
    }

    if (minCashback !== undefined) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM card_categories cc 
        WHERE cc.card_id = c.id 
        AND cc.cashback_rate >= $${paramIndex}
      )`);
      queryParams.push(minCashback);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM cards c
      ${whereClause}
    `;
    
    const countResult = await cardsDB.rawQueryRow(countQuery, ...queryParams);
    const totalCount = countResult?.total || 0;

    // Get cards with pagination
    const cardsQuery = `
      SELECT DISTINCT c.id, c.name, c.issuer, c.network, c.image_url, c.annual_fee, c.type,
             c.features, c.welcome_bonus, c.credit_range, c.apply_url, c.is_popular,
             COALESCE(c.rating, 4.0) as rating, COALESCE(c.review_count, 0) as review_count
      FROM cards c
      ${whereClause}
      ORDER BY c.is_popular DESC, COALESCE(c.rating, 4.0) DESC, c.name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const cardRows = await cardsDB.rawQueryAll(cardsQuery, ...queryParams);

    const cards: ComprehensiveCard[] = [];
    
    for (const cardRow of cardRows) {
      const categoryRows = await cardsDB.queryAll`
        SELECT id, category, cashback_rate, is_rotating, valid_until
        FROM card_categories 
        WHERE card_id = ${cardRow.id}
        ORDER BY cashback_rate DESC
      `;
      
      const categories: CardCategory[] = categoryRows.map(cat => ({
        id: cat.id,
        category: cat.category,
        cashbackRate: cat.cashback_rate,
        isRotating: cat.is_rotating,
        validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
      }));
      
      cards.push({
        id: cardRow.id,
        name: cardRow.name,
        issuer: cardRow.issuer,
        network: cardRow.network || 'Visa',
        imageUrl: cardRow.image_url,
        annualFee: cardRow.annual_fee,
        type: cardRow.type || 'credit',
        categories,
        features: cardRow.features ? JSON.parse(cardRow.features) : [],
        welcomeBonus: cardRow.welcome_bonus,
        creditRange: cardRow.credit_range || 'Good to Excellent',
        applyUrl: cardRow.apply_url,
        isPopular: cardRow.is_popular || false,
        rating: parseFloat(cardRow.rating) || 4.0,
        reviewCount: cardRow.review_count || 0
      });
    }

    // Get popular cards separately
    const popularCardsRows = await cardsDB.queryAll`
      SELECT id, name, issuer, network, image_url, annual_fee, type,
             features, welcome_bonus, credit_range, apply_url, is_popular,
             COALESCE(rating, 4.0) as rating, COALESCE(review_count, 0) as review_count
      FROM cards 
      WHERE is_popular = true
      ORDER BY COALESCE(rating, 4.0) DESC, COALESCE(review_count, 0) DESC
      LIMIT 6
    `;

    const popularCards: ComprehensiveCard[] = [];
    
    for (const cardRow of popularCardsRows) {
      const categoryRows = await cardsDB.queryAll`
        SELECT id, category, cashback_rate, is_rotating, valid_until
        FROM card_categories 
        WHERE card_id = ${cardRow.id}
        ORDER BY cashback_rate DESC
      `;
      
      const categories: CardCategory[] = categoryRows.map(cat => ({
        id: cat.id,
        category: cat.category,
        cashbackRate: cat.cashback_rate,
        isRotating: cat.is_rotating,
        validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
      }));
      
      popularCards.push({
        id: cardRow.id,
        name: cardRow.name,
        issuer: cardRow.issuer,
        network: cardRow.network || 'Visa',
        imageUrl: cardRow.image_url,
        annualFee: cardRow.annual_fee,
        type: cardRow.type || 'credit',
        categories,
        features: cardRow.features ? JSON.parse(cardRow.features) : [],
        welcomeBonus: cardRow.welcome_bonus,
        creditRange: cardRow.credit_range || 'Good to Excellent',
        applyUrl: cardRow.apply_url,
        isPopular: cardRow.is_popular || false,
        rating: parseFloat(cardRow.rating) || 4.0,
        reviewCount: cardRow.review_count || 0
      });
    }

    return { cards, totalCount, popularCards };
  }
);

export interface GetCardDetailsParams {
  cardId: number;
}

export interface CardDetailsResponse {
  card: ComprehensiveCard;
}

// Retrieves detailed information for a specific card.
export const getCardDetails = api<GetCardDetailsParams, CardDetailsResponse>(
  { expose: true, method: "GET", path: "/cards/comprehensive/:cardId" },
  async (params) => {
    const { cardId } = params;
    
    const cardRow = await cardsDB.queryRow`
      SELECT id, name, issuer, network, image_url, annual_fee, type,
             features, welcome_bonus, credit_range, apply_url, is_popular,
             COALESCE(rating, 4.0) as rating, COALESCE(review_count, 0) as review_count
      FROM cards 
      WHERE id = ${cardId}
    `;

    if (!cardRow) {
      throw APIError.notFound("Card not found");
    }

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
    
    const card: ComprehensiveCard = {
      id: cardRow.id,
      name: cardRow.name,
      issuer: cardRow.issuer,
      network: cardRow.network || 'Visa',
      imageUrl: cardRow.image_url,
      annualFee: cardRow.annual_fee,
      type: cardRow.type || 'credit',
      categories,
      features: cardRow.features ? JSON.parse(cardRow.features) : [],
      welcomeBonus: cardRow.welcome_bonus,
      creditRange: cardRow.credit_range || 'Good to Excellent',
      applyUrl: cardRow.apply_url,
      isPopular: cardRow.is_popular || false,
      rating: parseFloat(cardRow.rating) || 4.0,
      reviewCount: cardRow.review_count || 0
    };

    return { card };
  }
);
