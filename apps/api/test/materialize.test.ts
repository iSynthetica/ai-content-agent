// Unit — slot materialisation. Date arithmetic is exactly the kind of logic that looks obviously
// right and is wrong at month, year and DST boundaries, so the cases below are deliberately picked
// at those edges rather than in the middle of a calm week.
import { describe, expect, it } from "vitest";
import { excludeExisting, materializeSlots } from "../src/lib/materialize";

// 2026-07-20 is a Monday — makes the expectations readable.
const MON = "2026-07-20";

describe("materializeSlots — weekly cadence", () => {
  it("puts a slot on each requested weekday", () => {
    const slots = materializeSlots({
      cadence: { linkedin: { weekdays: ["mon", "wed"] } },
      from: MON,
      horizonWeeks: 1,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-20", "2026-07-22"]);
  });

  it("repeats across the whole horizon", () => {
    const slots = materializeSlots({
      cadence: { twitter: { weekdays: ["fri"] } },
      from: MON,
      horizonWeeks: 3,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-24", "2026-07-31", "2026-08-07"]);
  });

  it("handles several channels and keeps a deterministic order", () => {
    const a = materializeSlots({
      cadence: { blog: { weekdays: ["mon"] }, linkedin: { weekdays: ["mon"] } },
      from: MON,
      horizonWeeks: 1,
    });
    expect(a).toEqual([
      { date: MON, channel: "blog" },
      { date: MON, channel: "linkedin" },
    ]);
  });

  it("crosses a month boundary correctly", () => {
    const slots = materializeSlots({
      cadence: { blog: { weekdays: ["fri"] } },
      from: "2026-07-27",
      horizonWeeks: 2,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-31", "2026-08-07"]);
  });

  it("crosses a year boundary correctly", () => {
    const slots = materializeSlots({
      cadence: { blog: { weekdays: ["thu"] } },
      from: "2026-12-28",
      horizonWeeks: 2,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-12-31", "2027-01-07"]);
  });
});

describe("materializeSlots — everyNWeeks cadence", () => {
  it("emits every other week on the named weekday", () => {
    const slots = materializeSlots({
      cadence: { blog: { everyNWeeks: 2, weekday: "tue" } },
      from: MON,
      horizonWeeks: 6,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-21", "2026-08-04", "2026-08-18"]);
  });

  it("falls back to the weekday the horizon starts on when none is named", () => {
    const slots = materializeSlots({
      cadence: { blog: { everyNWeeks: 2 } },
      from: MON, // Monday
      horizonWeeks: 4,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-20", "2026-08-03"]);
  });

  it("weekdays wins when both rules are present — it is the more specific one", () => {
    const slots = materializeSlots({
      cadence: { blog: { weekdays: ["wed"], everyNWeeks: 3, weekday: "fri" } },
      from: MON,
      horizonWeeks: 1,
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-07-22"]);
  });
});

describe("materializeSlots — degenerate input", () => {
  it("empty cadence produces nothing", () => {
    expect(materializeSlots({ cadence: {}, from: MON, horizonWeeks: 4 })).toEqual([]);
  });

  it("zero horizon produces nothing", () => {
    expect(
      materializeSlots({ cadence: { blog: { weekdays: ["mon"] } }, from: MON, horizonWeeks: 0 }),
    ).toEqual([]);
  });

  it("a channel rule with neither weekdays nor everyNWeeks is skipped, not crashed on", () => {
    expect(materializeSlots({ cadence: { blog: {} }, from: MON, horizonWeeks: 4 })).toEqual([]);
  });
});

describe("excludeExisting", () => {
  // Materialisation must be idempotent: the horizon shifts weekly and users press "refresh plan"
  // repeatedly. Without this filter every call would duplicate the overlapping slots.
  const slots = [
    { date: "2026-07-20", channel: "blog" as const },
    { date: "2026-07-21", channel: "linkedin" as const },
  ];

  it("drops slots that already exist for the same date and channel", () => {
    const out = excludeExisting(slots, [{ date: "2026-07-20", channel: "blog" }]);
    expect(out).toEqual([{ date: "2026-07-21", channel: "linkedin" }]);
  });

  it("same date but a different channel is not a duplicate", () => {
    const out = excludeExisting(slots, [{ date: "2026-07-20", channel: "twitter" }]);
    expect(out).toHaveLength(2);
  });

  it("undated entries (backlog) never mask a dated slot", () => {
    const out = excludeExisting(slots, [{ date: null, channel: "blog" }]);
    expect(out).toHaveLength(2);
  });

  it("a second materialisation over an unchanged plan adds nothing", () => {
    const existing = slots.map((s) => ({ date: s.date, channel: s.channel }));
    expect(excludeExisting(slots, existing)).toEqual([]);
  });
});
