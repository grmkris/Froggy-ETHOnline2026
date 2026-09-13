CREATE TABLE "monitoring_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitoring_accounts" ADD CONSTRAINT "monitoring_accounts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;