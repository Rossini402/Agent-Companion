/** Cloudflare Workers 运行时绑定 */
export type Bindings = {
  DB: D1Database
  // 上游 LLM（DeepSeek，OpenAI 兼容）
  DEEPSEEK_API_KEY: string
  DEEPSEEK_MODEL: string
  DEEPSEEK_BASE_URL?: string
  // 后续：KV、R2、Vectorize 等
}

/** Hono 请求级变量（鉴权后写入 userId 等） */
export type Variables = {
  userId: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
