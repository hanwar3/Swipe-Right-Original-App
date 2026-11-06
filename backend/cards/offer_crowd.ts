import { appMeta } from "encore.dev";
import { cardsDB } from "./db";
import { cached } from "../lib/cache";

/** Fewer cardholders than this and a merchant is never named, so nobody's offers can be singled out. */
const K_ANON = 5;

// The aggregate scans every live offer for an issuer, so in the cloud each
// instance keeps it for 5 minutes; locally it is always fresh, for testing.
const CROWD_TTL_MS = appMeta().environment.cloud === "local" ? 0 : 5 * 60_000;

/**
 * Every merchant that K_ANON+ cardholders of this issuer have a live offer at,
 * most-held first. Counts only; no user is identifiable from it.
 */
export function crowdMerchants(issuer: string): Promise<{ merchant: string; holders: number }[]> {
  const load = () =>
    cardsDB.queryAll<{ merchant: string; holders: number }>`
      SELECT MIN(mo.merchant_name) AS merchant, COUNT(DISTINCT mo.user_id)::int AS holders
      FROM merchant_offers mo
      JOIN cards c ON c.id = mo.card_id
      WHERE c.issuer = ${issuer}
        AND mo.source IN ('portal', 'email')
        AND mo.disappeared_at IS NULL
        AND mo.is_used = FALSE
        AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
      GROUP BY LOWER(mo.merchant_name)
      HAVING COUNT(DISTINCT mo.user_id) >= ${K_ANON}
      ORDER BY holders DESC
      LIMIT 500
    `;
  return CROWD_TTL_MS ? cached(`crowd:${issuer}`, CROWD_TTL_MS, load) : load();
}
