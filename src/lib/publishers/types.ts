import type { Platform } from "../platforms";

export interface PublishInput {
  videoUrl: string;
  caption: string;
  title?: string | null;
  durationMs?: number | null;
  contentType?: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** Platform-specific account metadata (channel id, page id, urn, etc). */
  metadata: Record<string, unknown> | null;
  /** Platform connection record for context (e.g. handle). */
  accountId: string;
  accountName: string;
}

export interface PublishResult {
  publishedId: string;
  publishedUrl: string | null;
}

export type Publisher = (input: PublishInput) => Promise<PublishResult>;

export class PublisherError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "PublisherError";
    this.retryable = retryable;
  }
}

export class NotConfiguredError extends PublisherError {
  constructor(platform: Platform) {
    super(
      `${platform} publishing is not yet configured. Check platform docs and set env vars.`,
      false
    );
    this.name = "NotConfiguredError";
  }
}
