import { describe, it, expect } from "vitest";
import { mapPool } from "../../src/lib/mapPool";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapPool", () => {
  it("зберігає порядок результатів попри різний час виконання", async () => {
    // Перший елемент найповільніший — при push-у в гонці він опинився б останнім.
    const out = await mapPool([30, 1, 1, 1], 4, async (ms, i) => {
      await tick(ms);
      return i;
    });
    expect(out.map((r) => (r.ok ? r.value : "err"))).toEqual([0, 1, 2, 3]);
  });

  it("ізолює помилку одного елемента, не втрачаючи решту", async () => {
    const out = await mapPool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    expect(out[0]).toEqual({ ok: true, value: 10 });
    expect(out[1]!.ok).toBe(false);
    expect((out[1] as { error: Error }).error.message).toBe("boom");
    expect(out[2]).toEqual({ ok: true, value: 30 });
  });

  it("не перевищує ліміт одночасності", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++inFlight);
      await tick(5);
      inFlight--;
      return null;
    });
    expect(peak).toBe(3);
  });

  it("справді паралелить: 4 × 25мс при ліміті 4 вкладаються значно швидше за суму", async () => {
    const t0 = Date.now();
    await mapPool([0, 1, 2, 3], 4, async () => {
      await tick(25);
      return null;
    });
    expect(Date.now() - t0).toBeLessThan(70); // послідовно було б ~100мс
  });

  it("порожній вхід не зависає і не спавнить воркерів", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });
});
