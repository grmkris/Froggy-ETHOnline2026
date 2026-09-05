CREATE TABLE "mandates" (
	"document" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document" jsonb NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"spend_id" uuid NOT NULL,
	"stubbed" boolean NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spends" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"usd_micros" bigint NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"did" text PRIMARY KEY NOT NULL,
	"frozen_at" timestamp with time zone,
	"hedera_account_id" text,
	"hedera_key_ciphertext" text,
	"privy_wallet_address" text,
	"privy_wallet_id" text
);
--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spends" ADD CONSTRAINT "spends_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_user_created" ON "receipts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spends_user_idempotency" ON "spends" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "spends_user_created" ON "spends" USING btree ("user_id","created_at");