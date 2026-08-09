ALTER TABLE "generation_runs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_items" DROP COLUMN "archived_at";