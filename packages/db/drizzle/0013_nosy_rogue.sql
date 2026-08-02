CREATE TYPE "public"."content_source" AS ENUM('generated', 'human');--> statement-breakpoint
CREATE TABLE "content_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "content_source" NOT NULL,
	"text" text NOT NULL,
	"title" text,
	"editor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "content_item_versions" ADD CONSTRAINT "content_item_versions_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_versions" ADD CONSTRAINT "content_item_versions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_versions" ADD CONSTRAINT "content_item_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_item_versions_item_created_idx" ON "content_item_versions" USING btree ("content_item_id","created_at");--> statement-breakpoint
-- RLS (ADR-0003): content_item_versions — тенант-таблиця, ізоляція за account_id. NULLIF — бо на
-- пулених з'єднаннях GUC порожніє і ''::uuid валив би кожен запит (§db-migration skill).
ALTER TABLE "content_item_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_item_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_item_versions_tenant" ON "content_item_versions"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);