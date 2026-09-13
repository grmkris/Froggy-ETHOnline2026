CREATE TABLE "saved_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_items_owner" ON "saved_items" USING btree ("user_id");