ALTER TABLE "tasks" ADD COLUMN "connection_id" text;--> statement-breakpoint
UPDATE "tasks" SET "connection_id" = "agent_token_id" WHERE "agent_token_id" IS NOT NULL;