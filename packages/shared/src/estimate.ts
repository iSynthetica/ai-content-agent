// Пре-ран естиматор вартості прогону (Phase 4). Це ОЦІНКА, не рахунок: точні токени залежать від
// теми, довжини й к-сті авто-ревізій, тож показуємо число з «≈». Константи нижче — грубі середні
// на виклик; калібруються за фактичною телеметрією (generation_runs.cost_cents). Чистий модуль
// (імпортує і web) — без process.env.
//
// Модель масштабування = топологія графа (researcher→strategist→writer→reviewer, packages/pipeline):
//   • researcher — 1 виклик на ПРОГІН;
//   • strategist — 1 виклик на ПРОГІН, розмір росте з к-стю постів (планує їх усі);
//   • writer, reviewer — на КОЖЕН пост (mapPool), з поправкою на авто-петлю ревізій;
//   • judge — ОФЛАЙН-евалюація (не у графі генерації) → у вартість прогону не входить;
//   • зображення — на кожен instagram-пост (фіксована ціна за картинку).
import { imageModelPriceCents, textModelPrice } from "./pricing";

interface RoleTokens {
  in: number;
  out: number;
}
const RESEARCHER: RoleTokens = { in: 1500, out: 1200 }; // 1×/прогін
const STRATEGIST_BASE: RoleTokens = { in: 1200, out: 400 }; // 1×/прогін …
const STRATEGIST_PER_POST: RoleTokens = { in: 150, out: 250 }; // … + масштаб на кожен пост
const WRITER: RoleTokens = { in: 1800, out: 900 }; // ×N постів
const REVIEWER: RoleTokens = { in: 1600, out: 600 }; // ×N постів
// Авто-петля Reviewer→Writer (до MAX_REVISIONS) спрацьовує вибірково — множник на per-post частину.
const REVISION_FACTOR = 1.25;

// Поріг «дорогого прогону» (центи): понад нього діалог просить друге підтвердження. $2.00.
export const EXPENSIVE_RUN_CENTS = 200;

export interface RunCostEstimateInput {
  totalPosts: number; // усього постів у прогоні
  imageCount: number; // з них instagram (кожен = 1 картинка)
  // РЕЗОЛВЛЕНІ id моделей на роль (api резолвить із settings+override; ціна кодується id, не провайдером).
  roleModels: { researcher: string; strategist: string; writer: string; reviewer: string };
  imageModel?: string; // дефолт gpt-image-1
}

export interface RunCostEstimate {
  cents: number;
  textCents: number;
  imageCents: number;
  posts: number;
  images: number;
  expensive: boolean;
}

function callCents(modelId: string, t: RoleTokens): number {
  const p = textModelPrice(modelId);
  return (t.in / 1_000_000) * p.inputPer1M * 100 + (t.out / 1_000_000) * p.outputPer1M * 100;
}

export function estimateRunCost(input: RunCostEstimateInput): RunCostEstimate {
  const n = Math.max(0, Math.floor(input.totalPosts));
  const images = Math.max(0, Math.floor(input.imageCount));
  const rm = input.roleModels;

  // На прогін: researcher (фікс) + strategist (базовий + масштаб з N).
  let textCents = callCents(rm.researcher, RESEARCHER);
  textCents += callCents(rm.strategist, {
    in: STRATEGIST_BASE.in + STRATEGIST_PER_POST.in * n,
    out: STRATEGIST_BASE.out + STRATEGIST_PER_POST.out * n,
  });
  // На пост × N, з поправкою на авто-ревізії (writer+reviewer крутяться в петлі).
  textCents += n * REVISION_FACTOR * callCents(rm.writer, WRITER);
  textCents += n * REVISION_FACTOR * callCents(rm.reviewer, REVIEWER);

  const imageCents = images * imageModelPriceCents(input.imageModel ?? "gpt-image-1");
  const cents = textCents + imageCents;
  return { cents, textCents, imageCents, posts: n, images, expensive: cents >= EXPENSIVE_RUN_CENTS };
}
