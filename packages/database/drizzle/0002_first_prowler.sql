CREATE TABLE "telegram_pairings" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_user_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "telegram_pairings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_pairings" ADD CONSTRAINT "telegram_pairings_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;