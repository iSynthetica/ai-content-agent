CREATE TABLE "run_config_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_config_presets" ADD CONSTRAINT "run_config_presets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_config_presets" ADD CONSTRAINT "run_config_presets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_config_presets_company_name_idx" ON "run_config_presets" USING btree ("company_id","name");--> statement-breakpoint
-- RLS (ADR-0003): run_config_presets — тенант-таблиця, ізоляція за account_id. NULLIF — бо на
-- пулених з'єднаннях GUC порожніє і ''::uuid валив би кожен запит (§db-migration skill).
ALTER TABLE "run_config_presets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_config_presets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "run_config_presets_tenant" ON "run_config_presets"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);