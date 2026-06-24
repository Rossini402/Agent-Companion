import { drizzle } from "drizzle-orm/d1"
import * as schema from "./schema"

export * from "./schema"
export { schema }

/** 用 Cloudflare D1 binding 构造 drizzle 实例 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>
