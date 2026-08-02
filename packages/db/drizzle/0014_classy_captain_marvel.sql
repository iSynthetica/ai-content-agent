CREATE TABLE "run_topic_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"topics" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_topic_drafts" ADD CONSTRAINT "run_topic_drafts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_topic_drafts" ADD CONSTRAINT "run_topic_drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_topic_drafts_account_idx" ON "run_topic_drafts" USING btree ("account_id");--> statement-breakpoint
-- RLS (ADR-0003): run_topic_drafts — тенант-таблиця, ізоляція за account_id. NULLIF — бо на
-- пулених з'єднаннях GUC порожніє і ''::uuid валив би кожен запит (§db-migration skill).
ALTER TABLE "run_topic_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_topic_drafts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "run_topic_drafts_tenant" ON "run_topic_drafts"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);