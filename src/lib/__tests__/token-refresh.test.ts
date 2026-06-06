import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenRefresher } from "../publishers/types";

// ---------------------------------------------------------------------------
// Mocks. Paths are resolved relative to THIS file (src/lib/__tests__), so the
// module under test (src/lib/token-refresh.ts) imports "../crypto" etc. which
// from here is the same as "../crypto".
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted above all imports, so anything they reference
// must be created via vi.hoisted() (which is also hoisted) rather than as plain
// top-level consts. We hoist the db spies and the mutable refreshers map here.
const mocks = vi.hoisted(() => {
  const setSpy = vi.fn((..._args: unknown[]) => ({ where: whereSpy }));
  const whereSpy = vi.fn((..._args: unknown[]) => Promise.resolve());
  const updateSpy = vi.fn((..._args: unknown[]) => ({ set: setSpy }));
  const refreshers: Record<string, (...args: unknown[]) => unknown> = {};
  return { setSpy, whereSpy, updateSpy, refreshers };
});

const { setSpy, whereSpy, updateSpy } = mocks;
// Typed view of the same object the mocked module returns.
const refreshers = mocks.refreshers as Partial<Record<string, TokenRefresher>>;

// crypto: deterministic, reversible stand-ins so we can assert exactly what was
// decrypted on the way in and what was encrypted on the way out.
vi.mock("../crypto", () => ({
  decryptSecret: (v: string | null | undefined): string | null =>
    v == null ? null : String(v).replace(/^enc:/, ""),
  encryptSecret: (v: string): string => "enc:" + v,
  isEncrypted: (v: unknown): boolean =>
    typeof v === "string" && v.startsWith("enc:"),
}));

// db: a chainable update().set().where() where .set() captures its payload and
// .where() resolves.
vi.mock("../db", () => ({
  db: { update: mocks.updateSpy },
}));

// schema: token-refresh imports `connection` (used only inside eq()).
vi.mock("../db/schema", () => ({
  connection: { id: "connection.id" },
}));

// publishers: a mutable refreshers map we reconfigure per test.
vi.mock("../publishers", () => ({ refreshers: mocks.refreshers }));

// logger: silence structured logging.
vi.mock("../logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Real PublisherError (cheap class, not mocked) so `instanceof` + retryable hold.
import { PublisherError } from "../publishers/types";
import { ensureFreshAccessToken } from "../token-refresh";

type Conn = Parameters<typeof ensureFreshAccessToken>[0];

function makeConn(overrides: Partial<Conn> = {}): Conn {
  return {
    id: "conn_1",
    platform: "youtube",
    accessToken: "enc:access-1",
    refreshToken: "enc:refresh-1",
    accessTokenExpiresAt: null,
    metadata: null,
    ...overrides,
  };
}

/** A Date `mins` minutes from now (negative = in the past). */
function minutesFromNow(mins: number): Date {
  return new Date(Date.now() + mins * 60 * 1000);
}

beforeEach(() => {
  setSpy.mockClear();
  whereSpy.mockClear();
  updateSpy.mockClear();
  // Reset the mutable refreshers map between tests.
  for (const k of Object.keys(refreshers)) delete refreshers[k];
});

describe("ensureFreshAccessToken", () => {
  it("(a) returns decrypted access and does NOT touch the db when expiry is null", async () => {
    const conn = makeConn({
      accessTokenExpiresAt: null,
      accessToken: "enc:my-access",
    });

    const result = await ensureFreshAccessToken(conn);

    expect(result).toBe("my-access");
    expect(updateSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("(b) returns decrypted access with no refresh when expiry is far in the future", async () => {
    // Provide a refresher to prove it is NOT consulted when the token is fresh.
    const refresher = vi.fn();
    refreshers.youtube = refresher as unknown as TokenRefresher;

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(60),
      accessToken: "enc:fresh-access",
    });

    const result = await ensureFreshAccessToken(conn);

    expect(result).toBe("fresh-access");
    expect(refresher).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("(c) refreshes when expired: calls refresher, persists encrypted token + needsReconnect:false + lastRefreshedAt, returns new access", async () => {
    const newExpiry = minutesFromNow(120);
    const refresher = vi.fn<TokenRefresher>(async () => ({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      accessTokenExpiresAt: newExpiry,
    }));
    refreshers.youtube = refresher;

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(-10), // expired
      accessToken: "enc:old-access",
      refreshToken: "enc:old-refresh",
      metadata: { channelId: "abc" },
    });

    const result = await ensureFreshAccessToken(conn);

    // Refresher received the DECRYPTED refresh/access tokens + metadata.
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(refresher).toHaveBeenCalledWith({
      refreshToken: "old-refresh",
      accessToken: "old-access",
      metadata: { channelId: "abc" },
    });

    // Returns the brand-new (decrypted) access token from the refresher.
    expect(result).toBe("new-access");

    // Persisted the re-encrypted token + cleared the reconnect flag.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const payload = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.accessToken).toBe("enc:new-access");
    expect(payload.refreshToken).toBe("enc:new-refresh");
    expect(payload.accessTokenExpiresAt).toBe(newExpiry);
    expect(payload.needsReconnect).toBe(false);
    expect(payload.lastRefreshError).toBeNull();
    expect(payload.lastRefreshedAt).toBeInstanceOf(Date);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("(c2) leaves refreshToken unchanged (undefined) when the provider does not rotate it", async () => {
    const refresher = vi.fn<TokenRefresher>(async () => ({
      accessToken: "rotated-access",
      // no refreshToken returned
      accessTokenExpiresAt: minutesFromNow(120),
    }));
    refreshers.youtube = refresher;

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: "enc:keep-this-refresh",
    });

    const result = await ensureFreshAccessToken(conn);

    expect(result).toBe("rotated-access");
    const payload = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.accessToken).toBe("enc:rotated-access");
    // undefined => drizzle leaves the column unchanged.
    expect(payload.refreshToken).toBeUndefined();
  });

  it("(d) when the refresher throws: persists needsReconnect:true and throws a non-retryable PublisherError", async () => {
    const refresher = vi.fn<TokenRefresher>(async () => {
      throw new Error("provider 400: invalid_grant");
    });
    refreshers.youtube = refresher;

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: "enc:old-refresh",
    });

    await expect(ensureFreshAccessToken(conn)).rejects.toMatchObject({
      name: "PublisherError",
      retryable: false,
    });

    // markNeedsReconnect path persisted the flag.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.needsReconnect).toBe(true);
    expect(payload.lastRefreshError).toContain("invalid_grant");
  });

  it("(d2) the thrown error is a real PublisherError instance", async () => {
    refreshers.youtube = vi.fn<TokenRefresher>(async () => {
      throw new Error("boom");
    });

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: "enc:old-refresh",
    });

    const err = await ensureFreshAccessToken(conn).catch((e) => e);
    expect(err).toBeInstanceOf(PublisherError);
    expect(err.retryable).toBe(false);
  });

  it("(d3) when the refresher throws a RETRYABLE error: does NOT flag needsReconnect and re-throws it retryable", async () => {
    // Transient blip (429/5xx/timeout) — refreshers signal this with retryable:true.
    refreshers.youtube = vi.fn<TokenRefresher>(async () => {
      throw new PublisherError("YouTube refresh 503", true);
    });

    const conn = makeConn({
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: "enc:old-refresh",
    });

    const err = await ensureFreshAccessToken(conn).catch((e) => e);
    expect(err).toBeInstanceOf(PublisherError);
    // Must stay retryable so the dispatcher reschedules within MAX_ATTEMPTS.
    expect(err.retryable).toBe(true);
    // Must NOT have flagged the (healthy) connection as needing reconnect.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("(e) expired with NO refresher for the platform: persists needsReconnect:true and throws non-retryable", async () => {
    // No refresher registered for facebook (Meta has none by design).
    const conn = makeConn({
      platform: "facebook",
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: "enc:old-refresh",
    });

    await expect(ensureFreshAccessToken(conn)).rejects.toMatchObject({
      name: "PublisherError",
      retryable: false,
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.needsReconnect).toBe(true);
    expect(payload.lastRefreshError).toContain("facebook");
  });

  it("(e2) expired with a refresher but NO refresh token: persists needsReconnect:true and throws non-retryable", async () => {
    refreshers.youtube = vi.fn<TokenRefresher>(async () => ({
      accessToken: "should-not-be-used",
    }));

    const conn = makeConn({
      platform: "youtube",
      accessTokenExpiresAt: minutesFromNow(-10),
      accessToken: "enc:old-access",
      refreshToken: null, // no refresh token
    });

    await expect(ensureFreshAccessToken(conn)).rejects.toMatchObject({
      name: "PublisherError",
      retryable: false,
    });

    expect(refreshers.youtube).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.needsReconnect).toBe(true);
    expect(payload.lastRefreshError).toContain("Missing refresh token");
  });

  it("(f) fresh/unknown-expiry but access token is null: throws a non-retryable 'missing access token' error", async () => {
    const conn = makeConn({
      accessTokenExpiresAt: null, // unknown expiry => fresh path
      accessToken: null, // but no usable access token
    });

    const err = await ensureFreshAccessToken(conn).catch((e) => e);
    expect(err).toBeInstanceOf(PublisherError);
    expect(err.retryable).toBe(false);
    expect(String(err.message).toLowerCase()).toContain("access token");

    // No db write on this path.
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
