-- DB-2: RLS-політики + ролі. Виконується як forteq_owner (власник схеми).
-- Патерн: tenant_isolation через current_setting('app.current_account_id') (виставляє
-- withAccountContext у request/job-scoped транзакції). `true` = missing_ok → без контексту
-- GUC = NULL, порівняння дає false → 0 рядків (safe default).

-- ── ролі застосунку (non-superuser, підвладні RLS) ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'forteq_app') THEN
    CREATE ROLE forteq_app LOGIN PASSWORD 'app';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'forteq_sweeper') THEN
    CREATE ROLE forteq_sweeper LOGIN PASSWORD 'sweeper';
  END IF;
END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO forteq_app, forteq_sweeper;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forteq_app, forteq_sweeper;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forteq_app, forteq_sweeper;--> statement-breakpoint

-- ── accounts: видимі за членством користувача (для account switcher) ──────────
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_member_read" ON "accounts" FOR SELECT USING (
  "id" IN (SELECT "account_id" FROM "memberships"
           WHERE "user_id" = current_setting('app.current_user_id', true)::uuid)
);--> statement-breakpoint

-- ── memberships: read-own (bootstrap авторизації) + tenant-isolation ──────────
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_read_own" ON "memberships" FOR SELECT USING (
  "user_id" = current_setting('app.current_user_id', true)::uuid
);--> statement-breakpoint
CREATE POLICY "memberships_tenant" ON "memberships" USING (
  "account_id" = current_setting('app.current_account_id', true)::uuid
) WITH CHECK (
  "account_id" = current_setting('app.current_account_id', true)::uuid
);--> statement-breakpoint

-- ── тенант-таблиці: tenant_isolation (account_id = поточний акаунт) ────────────
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "companies_tenant" ON "companies" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "company_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "company_settings_tenant" ON "company_settings" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "content_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_plans_tenant" ON "content_plans" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "plan_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "plan_entries_tenant" ON "plan_entries" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "generation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "generation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generation_runs_tenant" ON "generation_runs" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_items_tenant" ON "content_items" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant" ON "notifications" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "inbox_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "inbox_items_tenant" ON "inbox_items" USING ("account_id" = current_setting('app.current_account_id', true)::uuid) WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);

-- Примітка: RBAC per-role (viewer read-only, editor drafts, reviewer approve) — рефайнмент
-- поверх tenant_isolation, додається з API-5/RBAC (додаткові policy на current_setting('app.current_role')).
-- users — НЕ тенант-таблиця (auth читає її до контексту), RLS не вмикаємо (spike-2 §2.10.2).
