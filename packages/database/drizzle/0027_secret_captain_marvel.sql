CREATE TABLE "credit_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"available_units" bigint DEFAULT 0 NOT NULL,
	"reserved_units" bigint DEFAULT 0 NOT NULL,
	"spent_units" bigint DEFAULT 0 NOT NULL,
	"per_task_units" bigint NOT NULL,
	"daily_units" bigint NOT NULL,
	"expires_at" bigint,
	"frozen" boolean DEFAULT false NOT NULL,
	"stubbed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "credit_accounts_nonnegative" CHECK ("credit_accounts"."available_units" >= 0 AND "credit_accounts"."reserved_units" >= 0 AND "credit_accounts"."spent_units" >= 0 AND "credit_accounts"."per_task_units" >= 0 AND "credit_accounts"."daily_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"connection_id" text,
	"idempotency_key" text NOT NULL,
	"units" bigint NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"stubbed" boolean NOT NULL,
	CONSTRAINT "credit_charges_positive" CHECK ("credit_charges"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"units" bigint NOT NULL,
	"available_delta" bigint NOT NULL,
	"reserved_delta" bigint NOT NULL,
	"charge_id" uuid,
	"purchase_id" uuid,
	"task_id" uuid,
	"at" bigint NOT NULL,
	"note" text NOT NULL,
	"stubbed" boolean NOT NULL,
	CONSTRAINT "credit_entries_nonnegative" CHECK ("credit_entries"."units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"credit_units" bigint NOT NULL,
	"network" text NOT NULL,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"pay_to" text NOT NULL,
	"status" text NOT NULL,
	"challenge" jsonb NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"proof_hash" text,
	"authorization_key" text,
	"payment_header" text,
	"transaction_id" text,
	"signed_transaction" text,
	"transaction_nonce" bigint,
	"error" text,
	"stubbed" boolean NOT NULL,
	CONSTRAINT "credit_purchases_positive" CHECK ("credit_purchases"."credit_units" > 0)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "charge_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "price_credit_units" bigint;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "charge_status" text;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_charges_owner_key" ON "credit_charges" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_charges_task" ON "credit_charges" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "credit_charges_owner_time" ON "credit_charges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_entries_owner_time" ON "credit_entries" USING btree ("user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_entries_charge_kind" ON "credit_entries" USING btree ("charge_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_entries_purchase_kind" ON "credit_entries" USING btree ("purchase_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_owner_key" ON "credit_purchases" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_proof" ON "credit_purchases" USING btree ("proof_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_authorization" ON "credit_purchases" USING btree ("authorization_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_transaction" ON "credit_purchases" USING btree ("network","transaction_id");--> statement-breakpoint
CREATE INDEX "credit_purchases_owner_time" ON "credit_purchases" USING btree ("user_id","created_at");