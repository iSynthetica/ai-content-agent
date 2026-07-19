// Routing (§8 spike-1) — умовні переходи графа. Чисті функції над станом (легко unit-тестуються
// окремо від графа й нод). Дві петлі ревізії (авто + людська) з незалежними cap'ами.
import { MAX_HUMAN_REVISIONS, MAX_REVISIONS } from "../config";
import type { ContentStateT } from "../state";

// Авто-петля Reviewer→Writer з жорстким cap'ом MAX_REVISIONS (захист від нескінченного циклу).
export const routeAfterReviewer = (s: ContentStateT): "writerRevision" | "humanReviewGate" => {
  const needsRev = s.final.some((f) => f.status === "needs_revision");
  return needsRev && s.revisionCount < MAX_REVISIONS ? "writerRevision" : "humanReviewGate";
};

// request_revision → writerRevision лише якщо: (1) є непорожні цілі (буде needs_revision-мішень)
// і (2) не вичерпано людський cap. Інакше — done (approve/reject або дегенеративний порожній запит).
export const routeAfterHuman = (s: ContentStateT): "writerRevision" | "done" => {
  const d = s.humanDecision;
  const hasTargets = d?.action === "request_revision" && (d.itemIds?.length ?? 0) > 0;
  return hasTargets && s.humanRevisionCount <= MAX_HUMAN_REVISIONS ? "writerRevision" : "done";
};
