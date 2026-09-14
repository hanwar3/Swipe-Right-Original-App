import { api, APIError } from "encore.dev/api";
import { cardsDB } from "./db";

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

export interface SyncMerchantOffersRequest {
  userId: string;
  offers: {
    cardId: number;
    merchantName: string;
    offerDescription: string;
    cashbackRate?: number;
    cashbackAmount?: number;
    minimumSpend?: number;
    maximumCashback?: number;
    offerType?: string;
    startDate?: string;
    endDate?: string;
    isActivated?: boolean;
  }[];
}

export interface UserMerchantOffersResponse {
  offers: MerchantOffer[];
}

// Retrieves user's merchant offers.
export const getUserMerchantOffers = api<{ userId: string }, UserMerchantOffersResponse>(
  { expose: true, method: "GET", path: "/cards/merchant-offers/:userId" },
  async (params) => {
    const offers: MerchantOffer[] = [];
    
    const offerRows = await cardsDB.queryAll`
      SELECT mo.id, mo.card_id, mo.merchant_name, mo.offer_description,
             mo.cashback_rate, mo.cashback_amount, mo.minimum_spend, mo.maximum_cashback,
             mo.offer_type, mo.start_date, mo.end_date, mo.is_activated, mo.is_used,
             mo.usage_count, mo.max_usage,
             c.name as card_name
      FROM merchant_offers mo
      JOIN cards c ON mo.card_id = c.id
      WHERE mo.user_id = ${params.userId}
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

// Syncs merchant offers from browser extension.
export const syncMerchantOffers = api<SyncMerchantOffersRequest, { synced: number; updated: number }>(
  { expose: true, method: "POST", path: "/cards/merchant-offers/sync" },
  async (req) => {
    const { userId, offers } = req;
    
    let syncedCount = 0;
    let updatedCount = 0;
    
    // Store sync data for audit
    await cardsDB.exec`
      INSERT INTO merchant_offer_sync (user_id, sync_data)
      VALUES (${userId}, ${JSON.stringify(offers)})
    `;
    
    for (const offer of offers) {
      // Check if offer already exists
      const existingOffer = await cardsDB.queryRow`
        SELECT id, is_activated, is_used FROM merchant_offers
        WHERE user_id = ${userId} 
          AND card_id = ${offer.cardId}
          AND merchant_name = ${offer.merchantName}
          AND offer_description = ${offer.offerDescription}
      `;
      
      if (existingOffer) {
        // Update existing offer
        await cardsDB.exec`
          UPDATE merchant_offers
          SET cashback_rate = COALESCE(${offer.cashbackRate}, cashback_rate),
              cashback_amount = COALESCE(${offer.cashbackAmount}, cashback_amount),
              minimum_spend = COALESCE(${offer.minimumSpend}, minimum_spend),
              maximum_cashback = COALESCE(${offer.maximumCashback}, maximum_cashback),
              offer_type = COALESCE(${offer.offerType}, offer_type),
              start_date = COALESCE(${offer.startDate ? new Date(offer.startDate) : null}, start_date),
              end_date = COALESCE(${offer.endDate ? new Date(offer.endDate) : null}, end_date),
              is_activated = COALESCE(${offer.isActivated}, is_activated),
              updated_at = NOW()
          WHERE id = ${existingOffer.id}
        `;
        updatedCount++;
      } else {
        // Insert new offer
        await cardsDB.exec`
          INSERT INTO merchant_offers (
            user_id, card_id, merchant_name, offer_description,
            cashback_rate, cashback_amount, minimum_spend, maximum_cashback,
            offer_type, start_date, end_date, is_activated
          ) VALUES (
            ${userId}, ${offer.cardId}, ${offer.merchantName}, ${offer.offerDescription},
            ${offer.cashbackRate || null}, ${offer.cashbackAmount || null}, 
            ${offer.minimumSpend || null}, ${offer.maximumCashback || null},
            ${offer.offerType || 'cashback'}, 
            ${offer.startDate ? new Date(offer.startDate) : null},
            ${offer.endDate ? new Date(offer.endDate) : null},
            ${offer.isActivated || false}
          )
        `;
        syncedCount++;
      }
    }
    
    return { synced: syncedCount, updated: updatedCount };
  }
);

// Activates a merchant offer.
export const activateMerchantOffer = api<{ userId: string; offerId: number }, { success: boolean }>(
  { expose: true, method: "POST", path: "/cards/merchant-offers/:userId/:offerId/activate" },
  async (params) => {
    const { userId, offerId } = params;
    
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
export const markOfferAsUsed = api<{ userId: string; offerId: number }, { success: boolean }>(
  { expose: true, method: "POST", path: "/cards/merchant-offers/:userId/:offerId/use" },
  async (params) => {
    const { userId, offerId } = params;
    
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
export const getRelevantOffers = api<{ userId: string; category: string }, UserMerchantOffersResponse>(
  { expose: true, method: "GET", path: "/cards/merchant-offers/:userId/category/:category" },
  async (params) => {
    const { userId, category } = params;
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
