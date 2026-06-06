ALTER TABLE "connection" ADD COLUMN "needs_reconnect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "last_refresh_error" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_user_default_unq" ON "brand" USING btree ("user_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "connection_needs_reconnect_idx" ON "connection" USING btree ("needs_reconnect");--> statement-breakpoint
CREATE UNIQUE INDEX "post_user_idempotency_unq" ON "post" USING btree ("user_id","idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_target_post_conn_unq" ON "post_target" USING btree ("post_id","connection_id");--> statement-breakpoint
CREATE INDEX "post_target_connection_idx" ON "post_target" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "tube_post_connection_idx" ON "tube_post" USING btree ("connection_id");