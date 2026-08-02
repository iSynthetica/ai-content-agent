// RBAC — матриця дозволів (єдине джерело правди). Цей пакет імпортують ОБИДВІ сторони:
// api використовує `can` для enforcement на ендпоінтах, web — щоб сховати недоступні дії.
// Тому матриця живе тут, а не в apps/api: інакше бек і фронт розійшлися б у розумінні ролей.
import { ROLES } from "./config";

export type Role = (typeof ROLES)[number];

// Дозволи — операційні наміри, НЕ ендпоінти. Один дозвіл може стерегти кілька роутів
// (напр. plan:write — і content-plan, і всі мутації планувальника). GET-и дозволу не потребують:
// будь-який автентифікований член акаунта читає (viewer), ізоляцію форсить RLS.
export const PERMISSIONS = [
  "company:write", // створення/редагування компанії
  "company:delete", // видалення компанії
  "settings:write", // бренд + модельна конфігурація
  "plan:write", // контент-план і всі мутації планувальника (materialize/suggest/patch/approve)
  "run:start", // запуск генерації (enqueue прогону)
  "decision:make", // HITL: approve/reject/rerun на рівні прогону і поста
  "apikey:manage", // BYOK: додати/ротувати/видалити ключ орендаря (шов треку BYOK)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Матриця «роль → дозволи». Читати по рядку: що вміє роль.
//
// Ролі складаються у сходинки за можливостями (viewer ⊂ reviewer ⊂ editor ⊂ admin ⊂ owner),
// але матриця задана ЯВНО, а не через ранг: коли зʼявиться нелінійна роль (напр. billing),
// рангова модель тихо збрехала б, а явний набір — ні.
//
// owner і admin наразі збігаються: єдине, що їх різнило б у матриці (видалення акаунта), поки не
// має ендпоінта. Розрізнення матеріалізується, коли зʼявиться account:delete — не раніше.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "company:write",
    "company:delete",
    "settings:write",
    "plan:write",
    "run:start",
    "decision:make",
    "apikey:manage",
  ],
  admin: [
    "company:write",
    "company:delete",
    "settings:write",
    "plan:write",
    "run:start",
    "decision:make",
    "apikey:manage",
  ],
  editor: ["company:write", "settings:write", "plan:write", "run:start", "decision:make"],
  reviewer: ["decision:make"],
  viewer: [],
};

// role приходить як string з межі HTTP (req.auth.role — TenantContext.role: string, бо db не
// залежить від цього пакета). Невідома/підроблена роль → жодних прав (безпечний deny-дефолт),
// а не виняток на ROLE_PERMISSIONS[undefined].
export function can(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
}
