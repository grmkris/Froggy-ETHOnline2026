CREATE TABLE "schedules" (
	"action" jsonb NOT NULL,
	"cadence" jsonb NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"status" text NOT NULL,
	"timezone" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_due" ON "schedules" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "schedules_user" ON "schedules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "digest_hour";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "digest_timezone";