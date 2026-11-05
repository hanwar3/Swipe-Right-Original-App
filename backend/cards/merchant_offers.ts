import { api, APIError } from "encore.dev/api";
import { cardsDB } from "./db";
import { currentUserId } from "../lib/session";

export interface MerchantOffer {
  id: number;
  cardId: number;
  cardName: string;
  merchantName: string;
  offerDescription: string;
  cashbackRate?: number;
  cashbackAmount?: number;
  minimumSpend?: number;
  maximumCashback?: number;
  offerType: string;
  startDate?: string;
  endDate?: string;
  isActivated: boolean;
  isUsed: boolean;
  usageCount: number;
  maxUsage: number;
}

export interface UserMerchantOffersResponse {
  offers: MerchantOffer[];
}

// Retrieves user's merchant offers.
export const getUserMerchantOffers = api(
  { expose: true, auth: true, method: "GET", path: "/cards/merchant-offers" },
  async (): Promise<UserMerchantOffersResponse> => {
    const userId = currentUserId();
    const offers: MerchantOffer[] = [];
    
    const offerRows = await cardsDB.queryAll`
      SELECT mo.id, mo.card_id, mo.merchant_name, mo.offer_description,
             mo.cashback_rate, mo.cashback_amount, mo.minimum_spend, mo.maximum_cashback,
             mo.offer_type, mo.start_date, mo.end_date, mo.is_activated, mo.is_used,
             mo.usage_count, mo.max_usage,
             c.name as card_name
      FROM merchant_offers mo
      JOIN cards c ON mo.card_id = c.id
      WHERE mo.user_id = ${userId}
        AND mo.disappeared_at IS NULL
        AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
        AND mo.is_used = FALSE
      ORDER BY mo.is_activated DESC, mo.end_date ASC, mo.cashback_rate DESC
    `;
    
    for (const row of offerRows) {
      offers.push({
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
        startDate: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : undefined,
        endDate: row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : undefined,
        isActivated: row.is_activated,
        isUsed: row.is_used,
        usageCount: row.usage_count,
        maxUsage: row.max_usage
      });
    }
    
    return { offers };
  }
);

// Activates a merchant offer.
// Records that the user added the offer in their issuer's portal.
export const activateMerchantOffer = api<{ offerId: number }, { success: boolean }>(
  { expose: true, auth: true, method: "POST", path: "/cards/merchant-offers/:offerId/activate" },
  async ({ offerId }) => {
    const userId = currentUserId();
    
    const result = await cardsDB.queryRow`
      UPDATE merchant_offers
      SET is_activated = TRUE, updated_at = NOW()
      WHERE id = ${offerId} AND user_id = ${userId} AND is_used = FALSE
      RETURNING id
    `;
    
    if (!result) {
      throw APIError.notFound("Merchant offer not found or already used");
    }
    
    return { success: true };
  }
);

// Marks a merchant offer as used.
export const markOfferAsUsed = api<{ offerId: number }, { success: boolean }>(
  { expose: true, auth: true, method: "POST", path: "/cards/merchant-offers/:offerId/use" },
  async ({ offerId }) => {
    const userId = currentUserId();
    
    const result = await cardsDB.queryRow`
      UPDATE merchant_offers
      SET is_used = TRUE, usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = ${offerId} AND user_id = ${userId}
      RETURNING id
    `;
    
    if (!result) {
      throw APIError.notFound("Merchant offer not found");
    }
    
    return { success: true };
  }
);

// Gets relevant merchant offers for a category.
export const getRelevantOffers = api<{ category: string }, UserMerchantOffersResponse>(
  { expose: true, auth: true, method: "GET", path: "/cards/merchant-offers/category/:category" },
  async ({ category }) => {
    const userId = currentUserId();
    const offers: MerchantOffer[] = [];
    
    const offerRows = await cardsDB.queryAll`
      SELECT mo.id, mo.card_id, mo.merchant_name, mo.offer_description,
             mo.cashback_rate, mo.cashback_amount, mo.minimum_spend, mo.maximum_cashback,
             mo.offer_type, mo.start_date, mo.end_date, mo.is_activated, mo.is_used,
             mo.usage_count, mo.max_usage,
             c.name as card_name
      FROM merchant_offers mo
      JOIN cards c ON mo.card_id = c.id
      WHERE mo.user_id = ${userId}
        AND mo.disappeared_at IS NULL
        AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
        AND mo.is_used = FALSE
        AND (
          LOWER(mo.merchant_name) LIKE ${'%' + category.toLowerCase() + '%'}
          OR LOWER(mo.offer_description) LIKE ${'%' + category.toLowerCase() + '%'}
        )
      ORDER BY mo.is_activated DESC, mo.cashback_rate DESC, mo.end_date ASC
    `;
    
    for (const row of offerRows) {
      offers.push({
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
        startDate: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : undefined,
        endDate: row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : undefined,
        isActivated: row.is_activated,
        isUsed: row.is_used,
        usageCount: row.usage_count,
        maxUsage: row.max_usage
      });
    }
    
    return { offers };
  }
);
