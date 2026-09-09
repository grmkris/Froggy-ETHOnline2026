CREATE TABLE "launch_watches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_task_id" uuid NOT NULL,
	"status" text NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_watches" ADD CONSTRAINT "launch_watches_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_watches_user_task" ON "launch_watches" USING btree ("user_id","source_task_id");--> statement-breakpoint
CREATE INDEX "launch_watches_active" ON "launch_watches" USING btree ("status","user_id");