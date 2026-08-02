-- BYOK: RLS для api_keys — тенант-ізоляція за account_id (ADR-0003). Це секрети орендаря, тож
-- доступ (SELECT/INSERT/UPDATE/DELETE) лише в межах свого акаунта; NULLIF — бо на пулених
-- з'єднаннях GUC порожніє і ''::uuid валив би кожен запит. Виконується як forteq_owner.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_keys_tenant" ON "api_keys"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);
