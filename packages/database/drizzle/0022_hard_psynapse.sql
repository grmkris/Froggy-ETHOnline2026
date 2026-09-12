CREATE TABLE "email_mailboxes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "email_mailboxes_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "email_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_records" ADD CONSTRAINT "email_records_user_id_email_mailboxes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."email_mailboxes"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_records_owner_kind" ON "email_records" USING btree ("user_id","kind");