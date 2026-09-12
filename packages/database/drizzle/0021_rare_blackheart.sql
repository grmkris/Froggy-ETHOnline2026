CREATE TABLE "wallet_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origin" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_connections" ADD CONSTRAINT "wallet_connections_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_requests" ADD CONSTRAINT "wallet_requests_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_connections_user_origin" ON "wallet_connections" USING btree ("user_id","origin");--> statement-breakpoint
CREATE INDEX "wallet_requests_user_created" ON "wallet_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_requests_status" ON "wallet_requests" USING btree ("status");