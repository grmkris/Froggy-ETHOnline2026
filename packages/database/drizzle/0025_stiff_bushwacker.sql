CREATE TABLE "wallet_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"transaction_hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"observed_at" bigint NOT NULL,
	"finality" text NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"monitor_id" text NOT NULL,
	"key" text NOT NULL,
	"state" text NOT NULL,
	"not_before" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"document" jsonb NOT NULL,
	CONSTRAINT "wallet_alerts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "wallet_stream_state" (
	"network" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD CONSTRAINT "wallet_activities_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD CONSTRAINT "wallet_activities_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_activities_item_transaction" ON "wallet_activities" USING btree ("user_id","item_id","transaction_hash");--> statement-breakpoint
CREATE INDEX "wallet_activities_owner_item" ON "wallet_activities" USING btree ("user_id","item_id","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_finality_block" ON "wallet_activities" USING btree ("finality","block_number");--> statement-breakpoint
CREATE INDEX "wallet_activities_retention" ON "wallet_activities" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "wallet_alerts_due" ON "wallet_alerts" USING btree ("state","not_before");--> statement-breakpoint
CREATE INDEX "wallet_alerts_monitor" ON "wallet_alerts" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "wallet_alerts_retention" ON "wallet_alerts" USING btree ("created_at");