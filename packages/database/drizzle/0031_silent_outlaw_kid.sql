CREATE TABLE "updates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"at" bigint NOT NULL,
	"read_at" bigint,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "updates_owner_key" ON "updates" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "updates_owner_id" ON "updates" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "updates_unread" ON "updates" USING btree ("user_id") WHERE "updates"."read_at" is null;