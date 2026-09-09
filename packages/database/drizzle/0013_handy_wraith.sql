CREATE TABLE "trade_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_rules" ADD CONSTRAINT "trade_rules_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_rules_owner" ON "trade_rules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_user_key" ON "trades" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "trades_pending" ON "trades" USING btree ("status","user_id");