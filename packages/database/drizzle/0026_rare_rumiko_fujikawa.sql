CREATE TABLE "wallet_alert_windows" (
	"user_id" text NOT NULL,
	"minute" bigint NOT NULL,
	"slots" bigint NOT NULL,
	"summary_id" text,
	CONSTRAINT "wallet_alert_windows_user_id_minute_pk" PRIMARY KEY("user_id","minute")
);
--> statement-breakpoint
CREATE TABLE "wallet_price_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"network" text NOT NULL,
	"block_number" bigint NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
DROP INDEX "wallet_activities_finality_block";--> statement-breakpoint
DROP INDEX "wallet_alerts_due";--> statement-breakpoint
DROP INDEX "wallet_alerts_monitor";--> statement-breakpoint
ALTER TABLE "wallet_activities" ALTER COLUMN "transaction_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ALTER COLUMN "monitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD COLUMN "network" text DEFAULT 'eip155:8453' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD COLUMN "delivery" text DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD COLUMN "network" text DEFAULT 'eip155:8453' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD COLUMN "summary_id" text;--> statement-breakpoint
ALTER TABLE "wallet_alert_windows" ADD CONSTRAINT "wallet_alert_windows_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_price_evaluations" ADD CONSTRAINT "wallet_price_evaluations_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_price_evaluations" ADD CONSTRAINT "wallet_price_evaluations_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_alert_windows_retention" ON "wallet_alert_windows" USING btree ("minute");--> statement-breakpoint
CREATE INDEX "wallet_price_evaluations_rollback" ON "wallet_price_evaluations" USING btree ("network","block_number","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_delivery" ON "wallet_activities" USING btree ("network","delivery","id");--> statement-breakpoint
CREATE INDEX "wallet_alerts_summary" ON "wallet_alerts" USING btree ("summary_id","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_finality_block" ON "wallet_activities" USING btree ("network","finality","id");--> statement-breakpoint
CREATE INDEX "wallet_alerts_due" ON "wallet_alerts" USING btree ("network","state","not_before");--> statement-breakpoint
CREATE INDEX "wallet_alerts_monitor" ON "wallet_alerts" USING btree ("monitor_id","id");
--> statement-breakpoint
UPDATE "wallet_activities" SET "network" = COALESCE("document"->>'network', 'eip155:8453'), "delivery" = COALESCE("document"->>'delivery', 'waiting');
--> statement-breakpoint
UPDATE "wallet_alerts" SET "document" = jsonb_set("document", '{network}', to_jsonb("network"));
