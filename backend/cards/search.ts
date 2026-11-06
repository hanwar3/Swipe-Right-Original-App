import { api, APIError } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { cardsDB } from "./db";
import { categoriesFor, type Card } from "./list";
import { rateLimit } from "../lib/ratelimit";
import { clientIp } from "../lib/request";

export interface SearchCardsParams {
  query: Query<string>;
}

export interface SearchCardsResponse {
  cards: Card[];
}

// Searches for credit cards by name or issuer. Public, so bounded: a short
// query, at most 50 results, and a per-address rate limit.
export const search = api<SearchCardsParams, SearchCardsResponse>(
  { expose: true, method: "GET", path: "/cards/search" },
  async (params) => {
    rateLimit(`card-search:${clientIp()}`, 120, 60_000);
    const term = String(params.query ?? "").trim().toLowerCase().slice(0, 80);
    if (term.length < 2) throw APIError.invalidArgument("Type at least two letters");
    // Escape LIKE wildcards so a "%" in the query is a literal character.
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const cardRows = await cardsDB.queryAll`
      SELECT id, name, issuer, image_url, annual_fee, network, type
      FROM cards
      WHERE LOWER(name) LIKE ${like} OR LOWER(issuer) LIKE ${like}
      ORDER BY name
      LIMIT 50
    `;
    const cats = await categoriesFor(cardRows.map((r) => Number(r.id)));
    return {
      cards: cardRows.map((row) => ({
        id: row.id,
        name: row.name,
        issuer: row.issuer,
        imageUrl: row.image_url,
        annualFee: row.annual_fee,
        network: row.network || "Visa",
        type: row.type || "credit",
        categories: cats.get(Number(row.id)) ?? [],
      })),
    };
  }
);
