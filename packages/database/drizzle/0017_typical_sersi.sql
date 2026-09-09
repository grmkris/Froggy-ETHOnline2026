CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"external_key" text,
	"source" text NOT NULL,
	"status" text,
	"connection_id" text,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"external_key" text,
	"source" text NOT NULL,
	"status" text,
	"connection_id" text,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"external_key" text,
	"source" text NOT NULL,
	"status" text,
	"connection_id" text,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"external_key" text,
	"source" text NOT NULL,
	"status" text,
	"connection_id" text,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_owners" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sequence" bigint DEFAULT 0 NOT NULL,
	"lease_epoch" bigint DEFAULT 0 NOT NULL,
	"lease_expires_at" bigint DEFAULT 0 NOT NULL,
	"active_run_id" uuid
);
--> statement-breakpoint
CREATE TABLE "conversation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"external_key" text,
	"source" text NOT NULL,
	"status" text,
	"connection_id" text,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_artifacts" ADD CONSTRAINT "history_artifacts_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_owners" ADD CONSTRAINT "history_owners_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_user_id_users_did_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_owner_updated" ON "conversations" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "conversations_thread_created" ON "conversations" USING btree ("user_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversations_run_created" ON "conversations" USING btree ("user_id","run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversations_search" ON "conversations" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "conversations_owner_created" ON "conversations" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_external" ON "conversations" USING btree ("user_id","external_key");--> statement-breakpoint
CREATE INDEX "history_artifacts_owner_updated" ON "history_artifacts" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "history_artifacts_thread_created" ON "history_artifacts" USING btree ("user_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "history_artifacts_run_created" ON "history_artifacts" USING btree ("user_id","run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "history_artifacts_search" ON "history_artifacts" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "history_artifacts_owner_created" ON "history_artifacts" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "history_artifacts_external" ON "history_artifacts" USING btree ("user_id","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_owner_sequence" ON "activity_events" USING btree ("user_id","sequence");--> statement-breakpoint
CREATE INDEX "tool_executions_owner_updated" ON "tool_executions" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "tool_executions_thread_created" ON "tool_executions" USING btree ("user_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "tool_executions_run_created" ON "tool_executions" USING btree ("user_id","run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "tool_executions_search" ON "tool_executions" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "tool_executions_owner_created" ON "tool_executions" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_executions_external" ON "tool_executions" USING btree ("user_id","external_key");--> statement-breakpoint
CREATE INDEX "conversation_messages_owner_updated" ON "conversation_messages" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "conversation_messages_thread_created" ON "conversation_messages" USING btree ("user_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversation_messages_run_created" ON "conversation_messages" USING btree ("user_id","run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversation_messages_search" ON "conversation_messages" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "conversation_messages_owner_created" ON "conversation_messages" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_external" ON "conversation_messages" USING btree ("user_id","external_key");--> statement-breakpoint
CREATE INDEX "conversation_runs_owner_updated" ON "conversation_runs" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "conversation_runs_thread_created" ON "conversation_runs" USING btree ("user_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversation_runs_run_created" ON "conversation_runs" USING btree ("user_id","run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversation_runs_search" ON "conversation_runs" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "conversation_runs_owner_created" ON "conversation_runs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_external" ON "conversation_runs" USING btree ("user_id","external_key");