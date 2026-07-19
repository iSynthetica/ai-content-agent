// Re-export-шим межі web↔api. Раніше ці DTO жили тут локально (api ще не мав їх у @forteq/shared);
// тепер їх ВЛАСНИК — @forteq/shared, а тут лишається тонкий re-export, щоб наявні імпорти
// @/lib/dto не ламались. Нові споживачі імпортують напряму з @forteq/shared (проти дрейфу).
import { z } from "zod";

export {
  accountDTO,
  accountsResponse,
  companiesResponse,
  companySettingsDTO,
  contentPlanDTO,
  // Історична назва у web-хуках (use-update-plan-config) — аліас на канонічний contentPlanDTO.
  contentPlanDTO as contentPlanResponse,
} from "@forteq/shared";
export type {
  AccountDTO,
  CompanySettingsDTO,
  ContentPlanDTO,
  ContentPlanDTO as ContentPlanResponse,
} from "@forteq/shared";

// Локальна відповідь-підтвердження для мутацій без сутності (НЕ частина контракту межі —
// власне web-зручність, тож лишається тут, а не у shared).
export const okResponse = z.object({ ok: z.boolean() }).partial();
