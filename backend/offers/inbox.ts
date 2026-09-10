import { api, Query } from "encore.dev/api";
import { randomBytes } from "node:crypto";
import { cardsDB } from "../cards/db";

/**
 * Each user gets one forwarding address. The token in the address is the
 * identity: we trust what the mail arrived AT, never the From header, which
 * anyone can forge.
 */

/** Set to your real inbound domain once the provider is configured. */
export const INBOX_DOMAIN = "offers.swiperight.app";

export interface InboxParams {
  userId: Query<string>;
}

export interface RecentIngest {
  id: number;
  issuer?: string;
  subject?: string;
  offersFound: number;
  offersWritten: number;
  status: string;
  createdAt: string;
}

export interface InboxResponse {
  address: string;
  receivedCount: number;
  lastReceivedAt?: string;
  recent: RecentIngest[];
}

function newToken(): string {
  // 16 bytes base32-ish, lowercase, no ambiguous characters: short enough to
  // be typed by hand into a mail rule, long enough not to be guessable.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const raw = randomBytes(16);
  let out = "";
  for (let i = 0; i < raw.length; i++) out += alphabet[raw[i] % alphabet.length];
  return out;
}

/** Get the user's forwarding address, creating it on first ask. */
export const inbox = api<InboxParams, InboxResponse>(
  { expose: true, method: "GET", path: "/offers/inbox" },
  async (params) => {
    const userId = params.userId;

    let row = await cardsDB.queryRow<{
      token: string; received_count: number; last_received_at: Date | null;
    }>`
      SELECT token, received_count, last_received_at
      FROM offer_inboxes WHERE user_id = ${userId}
    `;

    if (!row) {
      const token = newToken();
      await cardsDB.exec`
        INSERT INTO offer_inboxes (user_id, token)
        VALUES (${userId}, ${token})
        ON CONFLICT (user_id) DO NOTHING
      `;
      row = await cardsDB.queryRow<{
        token: string; received_count: number; last_received_at: Date | null;
      }>`
        SELECT token, received_count, last_received_at
        FROM offer_inboxes WHERE user_id = ${userId}
      `;
    }

    const recentRows = await cardsDB.queryAll<{
      id: number; issuer: string | null; subject: string | null;
      offers_found: number; offers_written: number; status: string; created_at: Date;
    }>`
      SELECT id, issuer, subject, offers_found, offers_written, status, created_at
      FROM offer_ingests
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return {
      address: `offers+${row!.token}@${INBOX_DOMAIN}`,
      receivedCount: row!.received_count,
      lastReceivedAt: row!.last_received_at?.toISOString(),
      recent: recentRows.map((r) => ({
        id: r.id,
        issuer: r.issuer ?? undefined,
        subject: r.subject ?? undefined,
        offersFound: r.offers_found,
        offersWritten: r.offers_written,
        status: r.status,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }
);

/** Rotate the address, for when a user has shared it somewhere they regret. */
export const rotateInbox = api<{ userId: string }, { address: string }>(
  { expose: true, method: "POST", path: "/offers/inbox/rotate" },
  async (req) => {
    const token = newToken();
    await cardsDB.exec`
      UPDATE offer_inboxes SET token = ${token} WHERE user_id = ${req.userId}
    `;
    return { address: `offers+${token}@${INBOX_DOMAIN}` };
  }
);

/**
 * Retention. Raw excerpts are only kept when a parser failed, so they can be
 * improved against the mail that beat them, and they are deleted on schedule.
 * Call this from a cron once the app has one.
 */
export const purgeRawExcerpts = api<void, { purged: number }>(
  { expose: false, method: "POST", path: "/offers/internal/purge" },
  async () => {
    const rows = await cardsDB.queryAll<{ id: number }>`
      UPDATE offer_ingests
      SET raw_excerpt = NULL
      WHERE raw_excerpt IS NOT NULL AND purge_after < CURRENT_DATE
      RETURNING id
    `;
    return { purged: rows.length };
  }
);
