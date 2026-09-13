CREATE TABLE "saved_item_data" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_item_data" ADD CONSTRAINT "saved_item_data_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item_data" ADD CONSTRAINT "saved_item_data_item_id_saved_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."saved_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_item_data_owner_item" ON "saved_item_data" USING btree ("user_id","item_id");