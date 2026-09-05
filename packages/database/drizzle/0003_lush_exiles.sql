CREATE TABLE "directory" (
	"amount" text NOT NULL,
	"asset" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"host" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"network" text NOT NULL,
	"pay_to" text NOT NULL,
	"url" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory" ADD CONSTRAINT "directory_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_user_url" ON "directory" USING btree ("user_id","url");