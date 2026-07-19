// Матеріалізація порожніх слотів контент-плану (§5 раунд 2): cadence + горизонт → датовані слоти.
//
// Ключове рішення планера: ПЛАНУВАННЯ ВІДОКРЕМЛЕНЕ ВІД ГЕНЕРАЦІЇ. Спершу з'являються порожні
// датовані слоти (коли і в який канал ми публікуємо), і лише потім вони наповнюються темами
// і врешті запускають прогін. Тому ця функція нічого не знає про теми й моделі.
//
// Чиста функція без БД і без Date.now(): «сьогодні» приходить аргументом. Інакше тест на межу
// місяця чи на високосний рік був би неможливим, а поведінка залежала б від дня запуску.
import type { Channel } from "@forteq/shared";

export const WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAY_ORDER)[number];

export interface ChannelCadence {
  /** Публікуємо у ці дні щотижня. */
  weekdays?: readonly Weekday[];
  /** Або: раз на N тижнів у день `weekday`. */
  everyNWeeks?: number;
  weekday?: Weekday;
}

export type Cadence = Partial<Record<Channel, ChannelCadence>>;

export interface Slot {
  date: string; // YYYY-MM-DD
  channel: Channel;
}

// ── дати без залежностей ─────────────────────────────────────────────────────
// Свідомо на UTC: слот — це календарний день, а не момент часу. Локальна таймзона зсувала б
// дату на добу для користувачів на схід/захід від сервера.

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/** 0=mon … 6=sun — зручніше за getUTCDay(), де тиждень починається з неділі. */
function weekdayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function weekdayOf(d: Date): Weekday {
  return WEEKDAY_ORDER[weekdayIndex(d)]!;
}

/** Понеділок того тижня, у якому лежить дата — база відліку для everyNWeeks. */
function startOfWeek(d: Date): Date {
  return addDays(d, -weekdayIndex(d));
}

function weeksBetween(a: Date, b: Date): number {
  return Math.floor((startOfWeek(b).getTime() - startOfWeek(a).getTime()) / (7 * 86_400_000));
}

/**
 * Розкладає cadence у конкретні дати на горизонті [from; from + horizonWeeks).
 *
 * `from` включно. Слоти повертаються відсортованими за датою, потім за каналом — порядок
 * детермінований, щоб повторний виклик давав ідентичний результат (від цього залежить
 * ідемпотентність матеріалізації).
 */
export function materializeSlots(input: {
  cadence: Cadence;
  from: string;
  horizonWeeks: number;
}): Slot[] {
  const { cadence, from, horizonWeeks } = input;
  if (horizonWeeks <= 0) return [];

  const start = parseISODate(from);
  const days = horizonWeeks * 7;
  const slots: Slot[] = [];

  for (const [channel, rule] of Object.entries(cadence) as [Channel, ChannelCadence][]) {
    if (!rule) continue;

    // Щотижневий режим має пріоритет: якщо задані обидва, weekdays конкретніший.
    if (rule.weekdays && rule.weekdays.length > 0) {
      const want = new Set(rule.weekdays);
      for (let i = 0; i < days; i++) {
        const d = addDays(start, i);
        if (want.has(weekdayOf(d))) slots.push({ date: toISODate(d), channel });
      }
      continue;
    }

    // Раз на N тижнів. Без `weekday` рахуємо від дня, з якого стартує горизонт, —
    // це передбачуваніше за мовчазний дефолт на понеділок.
    if (rule.everyNWeeks && rule.everyNWeeks > 0) {
      const target: Weekday = rule.weekday ?? weekdayOf(start);
      for (let i = 0; i < days; i++) {
        const d = addDays(start, i);
        if (weekdayOf(d) !== target) continue;
        if (weeksBetween(start, d) % rule.everyNWeeks !== 0) continue;
        slots.push({ date: toISODate(d), channel });
      }
    }
  }

  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
}

/**
 * Відкидає слоти, що вже існують у плані.
 *
 * Матеріалізація має бути ІДЕМПОТЕНТНОЮ: користувач натискає «оновити план» повторно, горизонт
 * зсувається щотижня, і без цієї перевірки кожен виклик дублював би всі слоти на перетині.
 * Ключ — (дата, канал): два пости в один канал на один день плануються як одна позиція.
 */
export function excludeExisting(
  slots: readonly Slot[],
  existing: ReadonlyArray<{ date: string | null; channel: string }>,
): Slot[] {
  const taken = new Set(
    existing.filter((e) => e.date).map((e) => `${e.date}|${e.channel}`),
  );
  return slots.filter((s) => !taken.has(`${s.date}|${s.channel}`));
}
