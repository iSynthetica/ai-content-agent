// Integration — повний обхід графа + interrupt/resume roundtrip на MemorySaver і фейкових моделях (§14).
// Мережа/БД не потрібні: усі side-effects за портами. Тестуємо control-flow та інваріанти, НЕ текст.
import { describe, expect, it } from "vitest";
import { createPipeline } from "../../src/index";
import { makeDeps } from "../fixtures/deps";
import { approvedResponses, flaggedResponses, fullInput } from "../fixtures/brief";

describe("interrupt/resume roundtrip", () => {
  it("start → needs_review з payload на 3 елементи (усі approved, flaggedCount=0)", async () => {
    const { deps } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    const r1 = await pipe.start(fullInput(), "t-approve");

    expect(r1.status).toBe("needs_review");
    if (r1.status !== "needs_review") return;
    expect(r1.interrupt.items).toHaveLength(3);
    expect(r1.interrupt.flaggedCount).toBe(0);
    expect(r1.output.final).toHaveLength(3);
    expect(r1.output.final.every((f) => f.status === "approved")).toBe(true);
    expect(r1.output.costCents).toBeGreaterThan(0); // cost акумульовано з usage_metadata
  });

  it("resume(approve) → completed", async () => {
    const { deps } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    await pipe.start(fullInput(), "t-a");
    const r2 = await pipe.resume("t-a", { action: "approve" });
    expect(r2.status).toBe("completed");
  });

  it("resume(reject) → completed", async () => {
    const { deps } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    await pipe.start(fullInput(), "t-r");
    const r2 = await pipe.resume("t-r", { action: "reject", reason: "not now" });
    expect(r2.status).toBe("completed");
  });

  it("resume(request_revision, {itemIds:[X], notes}) переписує САМЕ X; note доходить до Writer'а", async () => {
    const { deps, fake } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    const r1 = await pipe.start(fullInput(), "t-rev");
    if (r1.status !== "needs_review") throw new Error("expected needs_review");

    const linkedin = r1.output.final.filter((f) => f.channel === "linkedin");
    const x = linkedin[0].id;
    const y = linkedin[1].id;

    const r2 = await pipe.resume("t-rev", {
      action: "request_revision",
      itemIds: [x],
      notes: "додай конкретну цифру",
    });

    // Повертається знову на gate (людський цикл), стан оновлено.
    expect(r2.status).toBe("needs_review");
    if (r2.status !== "needs_review") return;

    const fx = r2.output.final.find((f) => f.id === x);
    const fy = r2.output.final.find((f) => f.id === y);
    expect(fx?.text).toBe("REVISED draft text"); // X переписаний
    expect(fx?.revisionHistory).toEqual(["Initial draft text for the post."]); // попередній текст у історії
    expect(fy?.revisionHistory).toEqual([]); // Y не чіпали
    expect(fy?.text).toBe("Initial draft text for the post.");

    // Людський note матеріалізувався і дійшов до промпту Writer'а.
    expect((fake.calls.writer ?? []).some((p) => p.includes("додай конкретну цифру"))).toBe(true);
  });

  it("флеговий кейс: пост, що лишився flagged, після request_revision з його id ТАКИ переписується", async () => {
    const { deps } = makeDeps(flaggedResponses());
    const pipe = createPipeline(deps);
    const r1 = await pipe.start(fullInput(), "t-flag");
    if (r1.status !== "needs_review") throw new Error("expected needs_review");
    expect(r1.output.final.every((f) => f.status === "flagged")).toBe(true);
    expect(r1.interrupt.flaggedCount).toBe(3);

    const x = r1.output.final.find((f) => f.channel === "linkedin")!.id;
    const r2 = await pipe.resume("t-flag", { action: "request_revision", itemIds: [x] });

    if (r2.status !== "needs_review") throw new Error("expected needs_review again");
    const fx = r2.output.final.find((f) => f.id === x);
    // gate підняв flagged→needs_revision → writerRevision таки переписав (історія зросла).
    expect(fx?.revisionHistory).toEqual(["Initial draft text for the post."]);
    expect(fx?.text).toBe("REVISED draft text");
  });

  it("getState на неіснуючому thread → EMPTY_OUTPUT, interrupted:false (не кидає)", async () => {
    const { deps } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    const state = await pipe.getState("nonexistent-thread");
    expect(state.interrupted).toBe(false);
    expect(state.output.final).toEqual([]);
    expect(state.output.costCents).toBe(0);
    expect(state.output.research).toBeNull();
  });

  it("resume піднімає modelConfig зі стану (checkpointer), без повторної передачі конфігу", async () => {
    const { deps } = makeDeps(approvedResponses());
    const pipe = createPipeline(deps);
    await pipe.start(fullInput(), "t-cfg");
    // resume приймає лише threadId + decision — modelConfig береться з persisted-стану.
    const r2 = await pipe.resume("t-cfg", { action: "approve" });
    expect(r2.status).toBe("completed");
  });
});
