CREATE TABLE "agent_invocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"usd_micros" bigint,
	"task_id" uuid,
	"stubbed" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_invocations_owner_connection_at" ON "agent_invocations" USING btree ("user_id","connection_id","at","id");