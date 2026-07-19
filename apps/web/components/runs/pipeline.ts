// Хелпер мапінгу вузлів графа генерації → ролі/статуси для PipelineFlow (n8n-стиль).
// Чисте виведення вигляду (без React) — єдина точка правди для порядку нод, українських
// лейблів і виведення статусу кожної ноди з потоку progress.
//
// Дані приходять у runDTO.progress (бек додає паралельно; схеми runProgress/pipelineStep
// зʼявляться у @forteq/shared). Поки їх немає — типи оголошені тут; TODO: замінити на імпорт
// із @forteq/shared, коли контракт змержать, щоб форма не розсинхронилась з api.

// Статус кроку з бекенду (pipelineStep.status).
export type PipelineStepStatus = "running" | "done" | "skipped" | "error";

export interface PipelineStep {
  node: string;
  status: PipelineStepStatus;
  at: string;
}

export interface RunProgress {
  current: string | null;
  steps: PipelineStep[];
}

// Візуальний статус ноди у флоу. Додає pending — «ще не було кроку по цій ноді».
export type NodeState = "pending" | "running" | "done" | "skipped" | "error";

// Ідентифікатор канонічного слота. writer/writerRevision → один слот "writer".
export type PipelineNodeId =
  | "researcher"
  | "strategist"
  | "writer"
  | "visual"
  | "reviewer"
  | "humanReviewGate";

interface CanonicalNode {
  id: PipelineNodeId;
  label: string; // роль українською (DS §8)
  aliases: string[]; // node-id у progress.steps, що мапляться на цей слот
  conditional?: boolean; // умовний вузол (visual — лише Instagram)
}

// Канонічні ноди зліва направо (порядок за ТЗ).
export const PIPELINE_NODES: readonly CanonicalNode[] = [
  { id: "researcher", label: "Дослідник", aliases: ["researcher"] },
  { id: "strategist", label: "Стратег", aliases: ["strategist"] },
  { id: "writer", label: "Автор", aliases: ["writer", "writerRevision"] },
  { id: "visual", label: "Візуал", aliases: ["visual"], conditional: true },
  { id: "reviewer", label: "Рецензент", aliases: ["reviewer"] },
  { id: "humanReviewGate", label: "Рев'ю людини", aliases: ["humanReviewGate"] },
];

// node-id (будь-який alias) → роль-лейбл. Для верхнього рядка «Зараз: <роль>».
const NODE_LABEL_BY_ALIAS: Record<string, string> = Object.fromEntries(
  PIPELINE_NODES.flatMap((node) => node.aliases.map((alias) => [alias, node.label])),
);

export function roleLabelForNode(node: string): string {
  return NODE_LABEL_BY_ALIAS[node] ?? node;
}

// Українські підписи станів — колір ніколи не єдиний носій сенсу (A11y §8).
export const NODE_STATE_LABEL: Record<NodeState, string> = {
  pending: "Очікує",
  running: "Виконується",
  done: "Готово",
  skipped: "Пропущено",
  error: "Помилка",
};

export interface PipelineNodeView {
  id: PipelineNodeId;
  label: string;
  state: NodeState;
  conditional: boolean;
  revision: boolean; // остання дія по слоту «Автор» — writerRevision → бейдж «ревізія»
}

// Виводить вигляд усіх нод із progress + runStatus.
// `graph.stream(streamMode:"updates")` віддає чанк ПІСЛЯ ноди (running+done разом), тож «поточну»
// ноду виводимо: перша канонічна БЕЗ кроку, поки run генерує (її чанк ще не прийшов = вона
// зараз виконується). Пропущені умовні (пізніша нода має крок, а ця — ні) → skipped.
// humanReviewGate на `needs_review` → running (генерація завершена, чекає на рішення людини).
export function derivePipelineNodes(
  progress: RunProgress | null | undefined,
  runStatus?: string,
): PipelineNodeView[] {
  const steps = progress?.steps ?? [];

  const lastByNode = PIPELINE_NODES.map((node) => {
    let last: PipelineStep | undefined;
    for (const step of steps) if (node.aliases.includes(step.node)) last = step;
    return last;
  });
  const hasStep = lastByNode.map((s) => Boolean(s));
  const lastStepIdx = hasStep.lastIndexOf(true); // найдальша нода, що вже має крок
  const generating = runStatus === "running" || runStatus === "queued";
  const awaitingReview = runStatus === "needs_review";
  // перша нода без кроку після найдальшої проштампованої = виконується зараз (не humanReviewGate).
  const runningIdx = generating
    ? PIPELINE_NODES.findIndex(
        (n, i) => !hasStep[i] && i > lastStepIdx && n.id !== "humanReviewGate",
      )
    : -1;

  return PIPELINE_NODES.map((node, i) => {
    const last = lastByNode[i];
    let state: NodeState;
    if (last) {
      state = last.status;
    } else if (i < lastStepIdx) {
      state = "skipped"; // пізніша нода відпрацювала, а ця — ні → умовний вузол обійдено
    } else if (i === runningIdx) {
      state = "running";
    } else if (node.id === "humanReviewGate" && awaitingReview) {
      state = "running"; // генерація завершена — чекає на рішення людини
    } else {
      state = "pending";
    }
    const revision = node.id === "writer" && last?.node === "writerRevision";

    return {
      id: node.id,
      label: node.label,
      state,
      conditional: Boolean(node.conditional),
      revision,
    };
  });
}

// Лейбл ролі ноди, що виконується зараз (для рядка «Зараз: <роль>»). null — жодна не running.
export function currentRoleLabel(nodes: PipelineNodeView[]): string | null {
  return nodes.find((n) => n.state === "running")?.label ?? null;
}
