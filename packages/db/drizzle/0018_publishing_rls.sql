-- RLS (ADR-0003): service_connections + publications — тенант-таблиці, ізоляція за account_id.
-- service_connections тримає OAuth-токени орендаря (секрети), publications — його публікації; доступ
-- (SELECT/INSERT/UPDATE/DELETE) лише в межах свого акаунта. NULLIF — бо на пулених з'єднаннях GUC
-- порожніє і ''::uuid валив би кожен запит (§db-migration skill, landmine). Створення таблиць —
-- у 0017 (drizzle generate, snapshot-aware); RLS тут рукописно, бо drizzle його не відбиває у
-- снапшот, тож наступний generate нічого не перезапропонує. Виконується як forteq_owner.
ALTER TABLE "service_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "service_connections_tenant" ON "service_connections"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "publications_tenant" ON "publications"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);
