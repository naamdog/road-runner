CREATE TYPE "public"."tube_post_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "tube_post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand_id" text,
	"connection_id" text,
	"media_id" text,
	"thumbnail_url" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" json DEFAULT '[]'::json,
	"category_id" text DEFAULT '22' NOT NULL,
	"visibility" "tube_post_visibility" DEFAULT 'public' NOT NULL,
	"made_for_kids" boolean DEFAULT false NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "post_status" DEFAULT 'scheduled' NOT NULL,
	"published_url" text,
	"published_at" timestamp with time zone,
	"youtube_video_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tube_post" ADD CONSTRAINT "tube_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tube_post" ADD CONSTRAINT "tube_post_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tube_post" ADD CONSTRAINT "tube_post_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tube_post" ADD CONSTRAINT "tube_post_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tube_post_user_idx" ON "tube_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tube_post_brand_idx" ON "tube_post" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "tube_post_scheduled_idx" ON "tube_post" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "tube_post_status_idx" ON "tube_post" USING btree ("status");