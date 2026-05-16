CREATE TABLE "brand" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#CCFF00' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "post_target" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_user_idx" ON "brand" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_brand_idx" ON "connection" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "post_brand_idx" ON "post" USING btree ("brand_id");