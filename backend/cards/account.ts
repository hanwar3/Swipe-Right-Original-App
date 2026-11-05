import { Subscription } from "encore.dev/pubsub";
import { createHash } from "node:crypto";
import log from "encore.dev/log";
import { cardsDB } from "./db";
import { userDeleted } from "../auth/events";

// Erases every row tied to a deleted account, in one transaction. Delivery is
// at-least-once, so this must be safe to run twice (it is: deletes are idempotent).
const _ = new Subscription(userDeleted, "cards-erase-user", {
  handler: async ({ userId }) => {
    const tx = await cardsDB.begin();
    try {
      await tx.exec`DELETE FROM merchant_offers WHERE user_id::text = ${userId}`;
      await tx.exec`DELETE FROM merchant_offer_sync WHERE user_id::text = ${userId}`;
      await tx.exec`DELETE FROM user_portfolios WHERE user_id::text = ${userId}`;
      await tx.exec`DELETE FROM user_category_choices WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM user_benefit_usage WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM user_category_spend WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM card_benefits WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM portal_syncs WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM offer_ingests WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM offer_inboxes WHERE user_id = ${userId}`;
      await tx.exec`DELETE FROM user_benefit_prefs WHERE user_id = ${userId}`;
      // Portal observations are stored under a one-way hash of (user, credit);
      // recompute those hashes so a deleted account's readings go too.
      const listed = await tx.queryAll<{ id: number }>`SELECT id FROM card_benefits WHERE user_id IS NULL`;
      const reporters = listed.map((b) => createHash("sha256").update(`${userId}:${b.id}`).digest("hex"));
      if (reporters.length) {
        await tx.exec`DELETE FROM benefit_observations WHERE reporter = ANY(${reporters})`;
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    log.info("erased card data for a deleted account");
  },
});
