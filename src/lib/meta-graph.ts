/**
 * Single source of truth for the Meta Graph API version.
 *
 * Meta ships a new Graph API version roughly every quarter and supports each
 * for ~2 years. When a version nears its expiry, bump THIS ONE CONSTANT and
 * every Facebook/Instagram call moves together.
 *
 *   v19.0  expired   2026-05-21  (what this app shipped on — now dead)
 *   v20.0  deprecates 2026-09-24
 *   v25.0  released  2026-02-18  ← current target (longest runway)
 *
 * See: https://developers.facebook.com/docs/graph-api/changelog/versions/
 */
export const META_GRAPH_VERSION = "v25.0";

/** Base for Graph API data/token calls, e.g. `${META_GRAPH_BASE}/me/accounts`. */
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Base for the OAuth login dialog, e.g. `${META_DIALOG_BASE}/dialog/oauth`. */
export const META_DIALOG_BASE = `https://www.facebook.com/${META_GRAPH_VERSION}`;
