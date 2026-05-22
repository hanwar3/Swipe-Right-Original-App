import { api } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { cardsDB } from "./db";
import type { Card, CardCategory } from "./list";
import type { UserCard } from "./portfolio";
import type { MerchantOffer } from "./merchant_offers";

export interface RecommendCardsParams {
  category: Query<string>;
  userId?: Query<string>;
}

export interface CardRecommendation {
  card: Card;
  relevantCategory: CardCategory;
  isInPortfolio: boolean;
  portfolioNickname?: string;
  relevantOffers: MerchantOffer[];
}

export interface RecommendCardsResponse {
  cards: CardRecommendation[];
  portfolioRecommendations: CardRecommendation[];
  category: string;
}

// Recommends the best credit cards for a specific spending category.
export const recommend = api<RecommendCardsParams, RecommendCardsResponse>(
  { expose: true, method: "GET", path: "/cards/recommend" },
  async (params) => {
    const category = params.category.toLowerCase();
    const userId = params.userId;
    
    const allRecommendations: CardRecommendation[] = [];
    const portfolioRecommendations: CardRecommendation[] = [];
    
    // Get user's portfolio if userId is provided
    let userPortfolioCards: Set<number> = new Set();
    let portfolioCardDetails: Map<number, { nickname?: string }> = new Map();
    
    if (userId) {
      const portfolioRows = await cardsDB.queryAll`
        SELECT card_id, nickname FROM user_portfolios 
        WHERE user_id = ${userId} AND is_active = TRUE
      `;
      
      portfolioRows.forEach(row => {
        userPortfolioCards.add(row.card_id);
        portfolioCardDetails.set(row.card_id, { nickname: row.nickname });
      });
    }
    
    // Get all cards with relevant categories
    const cardRows = await cardsDB.queryAll`
      SELECT DISTINCT c.id, c.name, c.issuer, c.image_url, c.annual_fee, c.network, c.type,
             cc.id as category_id, cc.category, cc.cashback_rate, cc.is_rotating, cc.valid_until
      FROM cards c
      JOIN card_categories cc ON c.id = cc.card_id
      WHERE LOWER(cc.category) LIKE ${'%' + category + '%'} 
         OR LOWER(cc.category) = 'all purchases'
      ORDER BY cc.cashback_rate DESC, c.name
    `;
    
    // Group by card and get all categories for each
    const cardMap: Map<number, any> = new Map();
    
    for (const row of cardRows) {
      if (!cardMap.has(row.id)) {
        cardMap.set(row.id, {
          id: row.id,
          name: row.name,
          issuer: row.issuer,
          imageUrl: row.image_url,
          annualFee: row.annual_fee,
          network: row.network || 'Visa',
          type: row.type || 'credit',
          categories: [],
          relevantCategory: null
        });
      }
      
      const categoryData = {
        id: row.category_id,
        category: row.category,
        cashbackRate: row.cashback_rate,
        isRotating: row.is_rotating,
        validUntil: row.valid_until ? new Date(row.valid_until).toISOString().split('T')[0] : undefined
      };
      
      cardMap.get(row.id)!.categories.push(categoryData);
      
      // Set as relevant category if it matches the search or is the best rate
      if (row.category.toLowerCase().includes(category) || 
          row.category.toLowerCase() === 'all purchases') {
        if (!cardMap.get(row.id)!.relevantCategory || 
            categoryData.cashbackRate > cardMap.get(row.id)!.relevantCategory.cashbackRate) {
          cardMap.get(row.id)!.relevantCategory = categoryData;
        }
      }
    }
    
    // Get merchant offers for the category if user is provided
    let merchantOffers: MerchantOffer[] = [];
    if (userId) {
      const offerRows = await cardsDB.queryAll`
        SELECT mo.id, mo.card_id, mo.merchant_name, mo.offer_description,
               mo.cashback_rate, mo.cashback_amount, mo.minimum_spend, mo.maximum_cashback,
               mo.offer_type, mo.start_date, mo.end_date, mo.is_activated, mo.is_used,
               mo.usage_count, mo.max_usage,
               c.name as card_name
        FROM merchant_offers mo
        JOIN cards c ON mo.card_id = c.id
        WHERE mo.user_id = ${userId}
          AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
          AND mo.is_used = FALSE
          AND (
            LOWER(mo.merchant_name) LIKE ${'%' + category + '%'}
            OR LOWER(mo.offer_description) LIKE ${'%' + category + '%'}
          )
        ORDER BY mo.is_activated DESC, mo.cashback_rate DESC
      `;
      
      merchantOffers = offerRows.map(row => ({
        id: row.id,
        cardId: row.card_id,
        cardName: row.card_name,
        merchantName: row.merchant_name,
        offerDescription: row.offer_description,
        cashbackRate: row.cashback_rate,
        cashbackAmount: row.cashback_amount,
        minimumSpend: row.minimum_spend,
        maximumCashback: row.maximum_cashback,
        offerType: row.offer_type,
        startDate: row.start_date?.toISOString().split('T')[0],
        endDate: row.end_date?.toISOString().split('T')[0],
        isActivated: row.is_activated,
        isUsed: row.is_used,
        usageCount: row.usage_count,
        maxUsage: row.max_usage
      }));
    }
    
    // Build recommendations
    for (const [cardId, cardData] of cardMap) {
      if (!cardData.relevantCategory) continue;
      
      const card: Card = {
        id: cardData.id,
        name: cardData.name,
        issuer: cardData.issuer,
        imageUrl: cardData.imageUrl,
        annualFee: cardData.annualFee,
        network: cardData.network,
        type: cardData.type || 'credit',
        categories: cardData.categories
      };
      
      const isInPortfolio = userPortfolioCards.has(cardId);
      const portfolioDetails = portfolioCardDetails.get(cardId);
      const relevantOffers = merchantOffers.filter(offer => offer.cardId === cardId);
      
      const recommendation: CardRecommendation = {
        card,
        relevantCategory: cardData.relevantCategory,
        isInPortfolio,
        portfolioNickname: portfolioDetails?.nickname,
        relevantOffers
      };
      
      allRecommendations.push(recommendation);
      
      if (isInPortfolio) {
        portfolioRecommendations.push(recommendation);
      }
    }
    
    // Sort recommendations by cashback rate
    allRecommendations.sort((a, b) => b.relevantCategory.cashbackRate - a.relevantCategory.cashbackRate);
    portfolioRecommendations.sort((a, b) => b.relevantCategory.cashbackRate - a.relevantCategory.cashbackRate);
    
    return { 
      cards: allRecommendations, 
      portfolioRecommendations,
      category: params.category 
    };
  }
);
