-- 0003: RLS-політики коерсять порожній GUC → NULL.
-- Кастомний GUC (app.current_*) після SET LOCAL на ПУЛОВАНОМУ з'єднанні ревертиться не в NULL, а в
-- порожній рядок '' (дефолт placeholder). Наступний запит на тому ж з'єднанні, що НЕ виставляє цей GUC
-- (напр. resolvePrimaryMembership ставить лише current_user_id), отримує current_setting(...)='' →
-- ''::uuid → 22P02. NULLIF(..., '') робить '' → NULL → політика дає 0 рядків (safe default), без падіння.

DROP POLICY IF EXISTS "accounts_member_read" ON "accounts";--> statement-breakpoint
CREATE POLICY "accounts_member_read" ON "accounts" FOR SELECT USING (
  "id" IN (SELECT "account_id" FROM "memberships"
           WHERE "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
);--> statement-breakpoint

DROP POLICY IF EXISTS "memberships_read_own" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_read_own" ON "memberships" FOR SELECT USING (
  "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);--> statement-breakpoint

DROP POLICY IF EXISTS "memberships_tenant" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_tenant" ON "memberships" USING (
  "account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid
) WITH CHECK (
  "account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid
);--> statement-breakpoint

DROP POLICY IF EXISTS "companies_tenant" ON "companies";--> statement-breakpoint
CREATE POLICY "companies_tenant" ON "companies" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "company_settings_tenant" ON "company_settings";--> statement-breakpoint
CREATE POLICY "company_settings_tenant" ON "company_settings" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "content_plans_tenant" ON "content_plans";--> statement-breakpoint
CREATE POLICY "content_plans_tenant" ON "content_plans" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "plan_entries_tenant" ON "plan_entries";--> statement-breakpoint
CREATE POLICY "plan_entries_tenant" ON "plan_entries" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "generation_runs_tenant" ON "generation_runs";--> statement-breakpoint
CREATE POLICY "generation_runs_tenant" ON "generation_runs" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "content_items_tenant" ON "content_items";--> statement-breakpoint
CREATE POLICY "content_items_tenant" ON "content_items" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "notifications_tenant" ON "notifications";--> statement-breakpoint
CREATE POLICY "notifications_tenant" ON "notifications" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS "inbox_items_tenant" ON "inbox_items";--> statement-breakpoint
CREATE POLICY "inbox_items_tenant" ON "inbox_items" USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid) WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);
