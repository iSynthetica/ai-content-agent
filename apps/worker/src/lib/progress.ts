// Per-node репортер прогресу пайплайна (§progress) — «хто зараз виконується».
// Пайплайн кличе onProgress(node, status) СИНХРОННО під час updates-стріму графа. Кожен виклик
// персиститься в generation_runs.progress ОКРЕМОЮ короткою scoped-txn (тверда межа §13: txn НЕ
// тримаємо під час графа — кожен апдейт коротка txn, як решта персисту).
//
// Виклики серіалізуються внутрішнім promise-ланцюгом: "running" і "done" однієї ноди йдуть впритул,
// тож без серіалізації два read-modify-write гонялись би за той самий рядок. Ланцюг гарантує порядок
// і відсутність гонок; flush() дочікує всі відкладені записи ПЕРЕД фінальним персистом статусу.
import { eq } from "drizzle-orm";
import { generationRuns } from "@forteq/db";
import type { RunProgress } from "@forteq/shared";
import type { ProgressCallback } from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";

export interface ProgressReporter {
  onProgress: ProgressCallback;
  /** Дочекатися всіх відкладених записів прогресу (викликати після прогону графа, до фінального персисту). */
  flush(): Promise<void>;
}

export function makeProgressReporter(
  ctx: HandlerContext,
  accountId: string,
  runId: string,
): ProgressReporter {
  const steps: RunProgress["steps"] = [];
  let chain: Promise<unknown> = Promise.resolve();

  const persist = (snapshot: RunProgress): Promise<unknown> =>
    withAccountScope(ctx, accountId, (tx) =>
      tx.update(generationRuns).set({ progress: snapshot }).where(eq(generationRuns.id, runId)),
    );

  const onProgress: ProgressCallback = (node, status) => {
    // Додаємо крок історії + виставляємо current (null коли нода завершилась).
    steps.push({ node, status, at: new Date().toISOString() });
    const snapshot: RunProgress = {
      current: status === "running" ? node : null,
      steps: [...steps], // снапшот на момент емісії (steps далі росте)
    };
    chain = chain
      .then(() => persist(snapshot))
      // Прогрес — best-effort UI-сигнал: збій запису НЕ валить прогін (лог і йдемо далі).
      .catch((err) => ctx.logger.warn({ runId, node, status, err }, "progress update failed"));
  };

  return { onProgress, flush: () => chain.then(() => undefined) };
}
