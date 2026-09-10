ALTER TABLE "users" ADD COLUMN "privy_policy_allowance" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privy_policy_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privy_policy_id" text;