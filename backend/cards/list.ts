import { api } from "encore.dev/api";
import { cardsDB } from "./db";

export interface Card {
  id: number;
  name: string;
  issuer: string;
  imageUrl: string;
  annualFee: number;
  network: string;
  type: string; // 'credit' | 'debit'
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

// Retrieves all available credit cards with their cashback categories.
export const list = api<void, ListCardsResponse>(
  { expose: true, method: "GET", path: "/cards" },
  async () => {
    const cards: Card[] = [];
    
    const cardRows = await cardsDB.queryAll`
      SELECT id, name, issuer, image_url, annual_fee, network, type
      FROM cards 
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
