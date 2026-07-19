// Обмежений паралелізм для per-item роботи вузлів (writer/visual/reviewer).
// Навіщо: LLM-виклики per-item НЕЗАЛЕЖНІ, а послідовний `for...of await` робив вузол
// сумою латентностей (8 постів × ~4.4с = 35с замість ~6с). Необмежений Promise.all
// натомість б'є в rate-limit провайдера → пул із фіксованою кількістю воркерів.
//
// Контракти, які тут свідомо збережені:
//   1. ПОРЯДОК результатів = порядок входу (пишемо за індексом, не push у гонці).
//   2. Помилка одного елемента НЕ валить пул і НЕ втрачається — повертається як { ok: false }
//      (ізоляція per-item, NFR-2.2, лишається за викликачем: він формує errors[]).

export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<Settled<R>>> {
  const out = new Array<Settled<R>>(items.length);
  let next = 0;

  // Воркери тягнуть наступний вільний індекс зі спільного лічильника — рівномірне
  // навантаження навіть коли елементи дуже різні за часом (blog проти twitter).
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        try {
          out[i] = { ok: true, value: await fn(items[i]!, i) };
        } catch (error) {
          out[i] = { ok: false, error };
        }
      }
    }),
  );

  return out;
}
