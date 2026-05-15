import type { Fetcher, PopularVideo } from "./types";

/**
 * LinkedIn doesn't expose a clean "list my video posts" endpoint with metrics
 * for individuals — the relevant APIs (Posts API, Marketing API) require
 * higher-tier permissions.
 *
 * We return an empty list rather than crash the feed. Future: support
 * Company Page accounts via the Marketing/Community API where customers
 * have those credentials.
 */
export const fetchLinkedInPopular: Fetcher = async () => {
  return [];
};
