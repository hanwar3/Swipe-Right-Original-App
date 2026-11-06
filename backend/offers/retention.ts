import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { cardsDB } from "../cards/db";

/*
 * Data minimisation, daily. Keep what the app needs to answer questions and
 * nothing older:
 *   - raw text of forwarded offer emails: blanked once its purge date passes
 *   - offers the portal stopped showing, or that ended, 180+ days ago
 *   - the portal sync log after 400 days (a year of support history)
 *   - anonymous credit observations after a year (consensus uses 90 days)
 */
export const runRetention = api({ expose: false }, async (): Promise<{ removed: Record<string, number> }> => {
  const count = async (rows: Promise<{ id: unknown }[]>) => (await rows).length;
  const removed = {
    emailExcerpts: await count(cardsDB.queryAll<{ id: unknown }>`
      UPDATE offer_ingests SET raw_excerpt = NULL
      WHERE raw_excerpt IS NOT NULL AND purge_after < CURRENT_DATE
      RETURNING id
    `),
    offers: await count(cardsDB.queryAll<{ id: unknown }>`
      DELETE FROM merchant_offers
      WHERE disappeared_at < NOW() - INTERVAL '180 days'
         OR end_date < CURRENT_DATE - INTERVAL '180 days'
      RETURNING id
    `),
    portalSyncs: await count(cardsDB.queryAll<{ id: unknown }>`
      DELETE FROM portal_syncs WHERE created_at < NOW() - INTERVAL '400 days' RETURNING id
    `),
    observations: await count(cardsDB.queryAll<{ id: unknown }>`
      DELETE FROM benefit_observations WHERE observed_at < NOW() - INTERVAL '365 days'
      RETURNING benefit_id AS id
    `),
  };
  log.info("retention pass", removed);
  return { removed };
});

const _ = new CronJob("offers-retention", {
  title: "Purge old offer email text, retired offers, old sync logs and observations",
  every: "24h",
  endpoint: runRetention,
});
