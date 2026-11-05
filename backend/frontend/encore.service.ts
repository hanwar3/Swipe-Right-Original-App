import { api } from "encore.dev/api";
import { Service } from "encore.dev/service";

export default new Service("frontend");

// The web app, served from the site root. "!path" is a fallback route: API
// endpoints match first, and anything else (a deep link like /wallet) gets
// index.html so the app's router can take it from there.
// Build it with `bun run build` in backend/ before deploying.
export const assets = api.static({
  path: "/!path",
  expose: true,
  dir: "./dist",
  notFound: "./dist/index.html",
  notFoundStatus: 200,
});
