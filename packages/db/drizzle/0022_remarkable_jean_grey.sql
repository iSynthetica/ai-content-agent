-- 0022 (§per-company-settings): переносимо BYOK-ключі та service-connections з ACCOUNT-скоупу у
-- COMPANY-скоуп. Рядки надалі тримають ОБИДВА id (account_id для RLS — незмінно; company_id як
-- партиція + WHERE-фільтр у репо). RLS-політики НЕ чіпаємо (лишаються account-based).
--
-- Ручна міграція (backfill = дані): drizzle-генерований варіант додавав би company_id одразу NOT
-- NULL і впав би на наявних рядках. Тому: додаємо nullable → дублюємо кожен account-ключ на КОЖНУ
-- компанію акаунта → видаляємо оригінали (company_id IS NULL) → SET NOT NULL. Снапшот + _journal
-- (idx 22) синхронні (drizzle-generate → «нічого мігрувати»).

-- ── api_keys ──────────────────────────────────────────────────────────────────
DROP INDEX "api_keys_account_provider_uq";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "company_id" uuid;--> statement-breakpoint
-- Дублюємо кожен наявний account-ключ на КОЖНУ компанію того ж акаунта (робастно для multi-company).
INSERT INTO "api_keys" (id, account_id, company_id, provider, ciphertext, last4, label, created_at, updated_at, last_used_at)
  SELECT gen_random_uuid(), k.account_id, c.id, k.provider, k.ciphertext, k.last4, k.label, k.created_at, k.updated_at, k.last_used_at
  FROM "api_keys" k JOIN "companies" c ON c.account_id = k.account_id
  WHERE k.company_id IS NULL;--> statement-breakpoint
DELETE FROM "api_keys" WHERE company_id IS NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_company_provider_uq" ON "api_keys" USING btree ("company_id","provider");--> statement-breakpoint

-- ── service_connections (прод: 0 рядків → backfill no-op, але пишемо симетрично) ──
DROP INDEX "service_connections_account_provider_uq";--> statement-breakpoint
ALTER TABLE "service_connections" ADD COLUMN "company_id" uuid;--> statement-breakpoint
INSERT INTO "service_connections" (id, account_id, company_id, provider, status, access_token_ct, refresh_token_ct, app_client_id, app_client_secret_ct, external_account_id, external_account_name, scopes, expires_at, meta, created_at, updated_at, last_used_at)
  SELECT gen_random_uuid(), s.account_id, c.id, s.provider, s.status, s.access_token_ct, s.refresh_token_ct, s.app_client_id, s.app_client_secret_ct, s.external_account_id, s.external_account_name, s.scopes, s.expires_at, s.meta, s.created_at, s.updated_at, s.last_used_at
  FROM "service_connections" s JOIN "companies" c ON c.account_id = s.account_id
  WHERE s.company_id IS NULL;--> statement-breakpoint
DELETE FROM "service_connections" WHERE company_id IS NULL;--> statement-breakpoint
ALTER TABLE "service_connections" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "service_connections" ADD CONSTRAINT "service_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_connections_company_provider_uq" ON "service_connections" USING btree ("company_id","provider");
