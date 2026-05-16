import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  json,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// --- Better Auth tables ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").default("UTC").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    uniqueIndex("account_provider_account_unq").on(t.providerId, t.accountId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Domain tables ---

export const platformEnum = pgEnum("platform", [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "canceled",
]);

/** A brand is a logical bucket: one brand groups all the social accounts that share an identity. */
export const brand = pgTable(
  "brand",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#CCFF00"),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brand_user_idx").on(t.userId)]
);

/** A user-connected social account, scoped to one brand. */
export const connection = pgTable(
  "connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: text("brand_id").references(() => brand.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    accountId: text("account_id").notNull(), // platform user/page/channel id
    accountName: text("account_name").notNull(),
    accountHandle: text("account_handle"),
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("connection_user_idx").on(t.userId),
    index("connection_brand_idx").on(t.brandId),
    uniqueIndex("connection_user_platform_account_unq").on(
      t.userId,
      t.platform,
      t.accountId
    ),
  ]
);

/** A piece of short-form video content the user uploaded. */
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    blobPath: text("blob_path").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    thumbnailUrl: text("thumbnail_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_user_idx").on(t.userId)]
);

/** A "campaign" — one piece of content with one base caption, scheduled to many platforms. */
export const post = pgTable(
  "post",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: text("brand_id").references(() => brand.id, { onDelete: "set null" }),
    mediaId: text("media_id").references(() => media.id, { onDelete: "set null" }),
    /** Default caption — used when a target row has no override. */
    caption: text("caption").notNull().default(""),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("post_user_idx").on(t.userId),
    index("post_brand_idx").on(t.brandId),
  ]
);

/** Per-platform scheduled instance of the post — one row per (post, account, time). */
export const postTarget = pgTable(
  "post_target",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => connection.id, {
      onDelete: "set null",
    }),
    platform: platformEnum("platform").notNull(),
    /** Per-target caption override. If null, use post.caption. */
    caption: text("caption"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: postStatusEnum("status").notNull().default("scheduled"),
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("post_target_user_idx").on(t.userId),
    index("post_target_post_idx").on(t.postId),
    index("post_target_scheduled_idx").on(t.scheduledAt),
    index("post_target_status_idx").on(t.status),
  ]
);

/** TubeRunner: long-form YouTube posts. Separate from `post` because the
 * shape is different — single platform (YouTube), rich metadata (title,
 * description, tags, category, thumbnail), and no per-platform fanout. */
export const tubePostVisibilityEnum = pgEnum("tube_post_visibility", [
  "public",
  "unlisted",
  "private",
]);

export const tubePost = pgTable(
  "tube_post",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: text("brand_id").references(() => brand.id, { onDelete: "set null" }),
    connectionId: text("connection_id").references(() => connection.id, {
      onDelete: "set null",
    }),
    mediaId: text("media_id").references(() => media.id, { onDelete: "set null" }),
    /** Optional custom thumbnail blob URL. */
    thumbnailUrl: text("thumbnail_url"),

    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** YouTube tags as a JSON array of strings. */
    tags: json("tags").$type<string[]>().default([]),
    /** YouTube category id (e.g. "22" = People & Blogs). */
    categoryId: text("category_id").default("22").notNull(),
    visibility: tubePostVisibilityEnum("visibility").notNull().default("public"),
    madeForKids: boolean("made_for_kids").notNull().default(false),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: postStatusEnum("status").notNull().default("scheduled"),
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    youtubeVideoId: text("youtube_video_id"),

    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tube_post_user_idx").on(t.userId),
    index("tube_post_brand_idx").on(t.brandId),
    index("tube_post_scheduled_idx").on(t.scheduledAt),
    index("tube_post_status_idx").on(t.status),
  ]
);

export type User = typeof user.$inferSelect;
export type Brand = typeof brand.$inferSelect;
export type Connection = typeof connection.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Post = typeof post.$inferSelect;
export type PostTarget = typeof postTarget.$inferSelect;
export type TubePost = typeof tubePost.$inferSelect;
