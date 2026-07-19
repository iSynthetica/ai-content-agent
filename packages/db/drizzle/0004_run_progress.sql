-- 0004: per-node прогрес пайплайна (§progress). Nullable jsonb { current, steps[] }.
-- Worker пише його per-node під час прогону графа (окремими короткими txn); api віддає у runDTO.progress.
-- Nullable — щоб наявні прогони (без прогресу) лишались валідними без backfill.
ALTER TABLE "generation_runs" ADD COLUMN "progress" jsonb;
