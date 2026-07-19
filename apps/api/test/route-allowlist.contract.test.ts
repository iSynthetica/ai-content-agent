// Drift-guard: роути api ↔ allowlist BFF-проксі у web (TODO S-3, нарешті написаний).
//
// Навіщо: allowlist у web і таблиця роутів в api описують ту саму поверхню у двох місцях, і вони
// розходяться мовчки — типи цього не бачать. Наслідки вже траплялись двічі: ендпоінт існував в
// api, але 404-ив із браузера, бо його забули в allowlist; і навпаки — allowlist роками ніс
// 8 «мертвих» шляхів, яких в api не було.
//
// Тест читає ОБИДВА файли як текст, а не імпортує їх: web — Next-модуль із alias-імпортами, і
// тягнути його в тести api означало б тягнути половину фронтенду.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_FILE = resolve(__dirname, "../src/http/routes/index.ts");
const ALLOWLIST_FILE = resolve(__dirname, "../../web/lib/endpoints.ts");

type Entry = { method: string; path: string };

/** `r.get("/companies/:companyId/runs", ...)` → { GET, /companies/:companyId/runs } */
function parseRoutes(src: string): Entry[] {
  const out: Entry[] = [];
  const re = /\br\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;
  for (const m of src.matchAll(re)) out.push({ method: m[1]!.toUpperCase(), path: m[2]! });
  return out;
}

/** `{ method: "GET", pattern: /^\/runs\/[^/]+$/ }` → { GET, RegExp } */
function parseAllowlist(src: string): Array<{ method: string; re: RegExp; raw: string }> {
  const out: Array<{ method: string; re: RegExp; raw: string }> = [];
  const block = src.slice(src.indexOf("ALLOW"), src.indexOf("export function isAllowed"));
  // Нежадібний збіг до `/ }`: тіло патерна містить і екрановані слеші (\/), і класи [^/],
  // тож наївне [^/]+ обривається на першому ж слеші й читає лише частину списку.
  const re = /\{\s*method:\s*"(\w+)",\s*pattern:\s*\/(.+?)\/\s*\}/g;
  for (const m of block.matchAll(re)) {
    out.push({ method: m[1]!, re: new RegExp(m[2]!), raw: `${m[1]} ${m[2]}` });
  }
  return out;
}

// Express-параметр → конкретне значення, щоб перевірити збіг із регуляркою allowlist.
function concrete(path: string): string {
  return path.replace(/:[A-Za-z]+/g, "11111111-2222-3333-4444-555555555555");
}

const routesSrc = readFileSync(ROUTES_FILE, "utf8");
const allowSrc = readFileSync(ALLOWLIST_FILE, "utf8");
const routes = parseRoutes(routesSrc);
const allow = parseAllowlist(allowSrc);

describe("route allowlist drift guard", () => {
  it("парсери взагалі щось знайшли (інакше тест був би завжди зеленим)", () => {
    // Без цієї перевірки зміна формату файлу зробила б drift-guard беззмістовним, але зеленим —
    // найгірший вид тесту.
    expect(routes.length).toBeGreaterThan(10);
    expect(allow.length).toBeGreaterThan(10);
  });

  it("кожен бізнес-роут api присутній в allowlist проксі", () => {
    const missing = routes
      .map((r) => ({ ...r, url: concrete(r.path) }))
      .filter((r) => !allow.some((a) => a.method === r.method && a.re.test(r.url)))
      .map((r) => `${r.method} ${r.path}`);

    expect(missing, `Роути є в api, але фронт до них не достукається (404 у проксі):\n${missing.join("\n")}`)
      .toEqual([]);
  });

  it("allowlist не містить шляхів, яких в api немає", () => {
    // Мертвий запис у allowlist — це обіцянка ендпоінта, якої ніхто не виконує: фронт спокійно
    // його викличе й отримає 404 у рантаймі.
    const urls = routes.map((r) => ({ method: r.method, url: concrete(r.path) }));
    const dead = allow
      .filter((a) => !urls.some((u) => u.method === a.method && a.re.test(u.url)))
      .map((a) => a.raw);

    expect(dead, `Allowlist обіцяє ендпоінти, яких в api немає:\n${dead.join("\n")}`).toEqual([]);
  });
});
