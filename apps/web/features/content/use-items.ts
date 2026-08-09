"use client";

// Айтеми (пости) run (spike-3 §9 п.6). Базово НЕ має власного refetchInterval — картки рефетчаться
// реактивно з ефекту на сторінці run, коли зростає run.counts.items або змінюється run.status.
// Так на сторінці крутиться рівно ОДИН polling-таймер (useRun).
//
// ВИНЯТОК (§7.4): картинки малюються ПІСЛЯ того, як прогін уже перейшов у needs_review, а на
// цьому статусі useRun polling вимикає (чекає людину). Без власного таймера image_url доїхав би
// у БД, але сторінка б його не побачила до ручного перезавантаження. Тому тут — вузький таймер,
// що живе РІВНО поки є instagram-пост без картинки, і глушиться після MAX_VISUAL_POLLS
// (інакше провалена генерація поллила б вічно).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { itemsResponse, type ContentItemDTO } from "@/features/content/schemas";

const VISUALS_POLL_MS = 5000;
const MAX_VISUAL_POLLS = 36; // ~3 хв — стеля очікування картинки

function hasPendingVisuals(items: ContentItemDTO[] | undefined): boolean {
  return Boolean(items?.some((i) => i.channel === "instagram" && !i.imageUrl));
}

// archived (§post-archive): "exclude" (дефолт) — основний список без архіву; "only" — окремий
// вигляд архіву прогону. Ключ архіву має спільний префікс ["items", runId], тож інвалідація
// qk.items(runId) з мутацій архіву перечитує обидва списки. Архів не поллить картинки (вони не
// генеруються для архівованих) — visuals-таймер лишається лише для основного списку.
export function useItems(
  runId: string,
  initialData?: ContentItemDTO[],
  archived: "exclude" | "only" | "all" = "exclude",
  enabled = true,
) {
  const polls = React.useRef(0);
  const isArchiveView = archived === "only";

  return useQuery({
    queryKey: isArchiveView ? qk.itemsArchived(runId) : qk.items(runId),
    queryFn: () =>
      http.get(endpoints.items(runId, isArchiveView ? "only" : undefined), itemsResponse),
    initialData,
    enabled: !!runId && enabled,
    refetchInterval: (q) => {
      if (isArchiveView || !hasPendingVisuals(q.state.data)) {
        polls.current = 0; // картинки доїхали (або їх і не було / архів) — лічильник назад у нуль
        return false;
      }
      if (polls.current >= MAX_VISUAL_POLLS) return false;
      polls.current += 1;
      return VISUALS_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
