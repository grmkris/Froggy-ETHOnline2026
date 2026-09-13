CREATE TABLE "wallet_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"network" text DEFAULT 'eip155:8453' NOT NULL,
	"transaction_hash" text,
	"block_number" bigint NOT NULL,
	"observed_at" bigint NOT NULL,
	"finality" text NOT NULL,
	"delivery" text DEFAULT 'waiting' NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_alert_windows" (
	"user_id" text NOT NULL,
	"minute" bigint NOT NULL,
	"slots" bigint NOT NULL,
	"summary_id" text,
	CONSTRAINT "wallet_alert_windows_user_id_minute_pk" PRIMARY KEY("user_id","minute")
);
--> statement-breakpoint
CREATE TABLE "wallet_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"monitor_id" text,
	"network" text DEFAULT 'eip155:8453' NOT NULL,
	"summary_id" text,
	"key" text NOT NULL,
	"state" text NOT NULL,
	"not_before" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"document" jsonb NOT NULL,
	CONSTRAINT "wallet_alerts_key_unique" UNIQUE("key")
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
CREATE TABLE "wallet_stream_state" (
	"network" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD CONSTRAINT "wallet_activities_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_activities" ADD CONSTRAINT "wallet_activities_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alert_windows" ADD CONSTRAINT "wallet_alert_windows_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_price_evaluations" ADD CONSTRAINT "wallet_price_evaluations_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_price_evaluations" ADD CONSTRAINT "wallet_price_evaluations_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_activities_item_transaction" ON "wallet_activities" USING btree ("user_id","item_id","transaction_hash");--> statement-breakpoint
CREATE INDEX "wallet_activities_owner_item" ON "wallet_activities" USING btree ("user_id","item_id","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_finality_block" ON "wallet_activities" USING btree ("network","finality","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_delivery" ON "wallet_activities" USING btree ("network","delivery","id");--> statement-breakpoint
CREATE INDEX "wallet_activities_retention" ON "wallet_activities" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "wallet_alert_windows_retention" ON "wallet_alert_windows" USING btree ("minute");--> statement-breakpoint
CREATE INDEX "wallet_alerts_due" ON "wallet_alerts" USING btree ("network","state","not_before");--> statement-breakpoint
CREATE INDEX "wallet_alerts_monitor" ON "wallet_alerts" USING btree ("monitor_id","id");--> statement-breakpoint
CREATE INDEX "wallet_alerts_summary" ON "wallet_alerts" USING btree ("summary_id","id");--> statement-breakpoint
CREATE INDEX "wallet_alerts_retention" ON "wallet_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_price_evaluations_rollback" ON "wallet_price_evaluations" USING btree ("network","block_number","id");