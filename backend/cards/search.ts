import { api } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { cardsDB } from "./db";
import type { Card, CardCategory } from "./list";

export interface SearchCardsParams {
  query: Query<string>;
}

export interface SearchCardsResponse {
  cards: Card[];
}

// Searches for credit cards by name or issuer.
export const search = api<SearchCardsParams, SearchCardsResponse>(
  { expose: true, method: "GET", path: "/cards/search" },
  async (params) => {
    const searchTerm = `%${params.query.toLowerCase()}%`;
    const cards: Card[] = [];
    
    const cardRows = await cardsDB.queryAll`
      SELECT id, name, issuer, image_url, annual_fee, network, type
      FROM cards 
      WHERE LOWER(name) LIKE ${searchTerm} OR LOWER(issuer) LIKE ${searchTerm}
      ORDER BY name
    `;
    
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
        imageUrl: cardRow.image_url,
        annualFee: cardRow.annual_fee,
        network: cardRow.network || 'Visa',
        type: cardRow.type || 'credit',
        categories
      });
    }
    
    return { cards };
  }
);
