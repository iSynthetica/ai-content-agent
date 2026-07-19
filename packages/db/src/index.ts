import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export * from "./schema";
export * from "./rls";

export type DB = ReturnType<typeof createDb>;

/** Створює drizzle-клієнт. Для RLS конект іде під роллю forteq_app (DATABASE_URL). */
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}
