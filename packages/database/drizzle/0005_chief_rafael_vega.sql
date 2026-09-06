CREATE TABLE "agent_tokens" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"secret_hash" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"amount" text NOT NULL,
	"asset" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"error" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"payer" text,
	"payment_hash" text NOT NULL,
	"resource" text NOT NULL,
	"result" jsonb,
	"status" text NOT NULL,
	"stubbed" boolean NOT NULL,
	"transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"agent_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text,
	"input" jsonb NOT NULL,
	"kind" text NOT NULL,
	"price_usd_micros" bigint NOT NULL,
	"result" jsonb,
	"run_id" uuid,
	"sale_id" uuid,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tokens_secret" ON "agent_tokens" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "agent_tokens_user" ON "agent_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_payment_hash" ON "sales" USING btree ("payment_hash");--> statement-breakpoint
CREATE INDEX "sales_transaction" ON "sales" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_user_idempotency" ON "tasks" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tasks_user_created" ON "tasks" USING btree ("user_id","created_at");