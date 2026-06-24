import type { ZodType } from "zod"
import type { DeepSeekConfig } from "../../llm/deepseek"

type Msg = { role: "system" | "user"; content: string }

/**
 * DeepSeek json_object 结构化输出 + Zod 解析 + 重试（替代文章的 LangChain，适配本项目自写 fetch）。
 * 退路链：
 *  ① 首次用 response_format:json_object（原生 JSON mode）
 *  ② extractJson 容错提取（剥离 markdown 围栏 / 截取首个 {...}）
 *  ③ Zod 强校验失败 → 重试；重试时改为纯 Prompt 约束（去掉 response_format，兼容不支持该字段的中转）
 *  ④ 全部失败 → 抛错，由上层节点 fallback 兜底
 * 注意：deepseek-v4-flash 为推理模型，非流式时从 message.content 取最终文本。
 */
export async function callStructured<T>(args: {
  config: DeepSeekConfig
  schema: ZodType<T>
  system: string
  user: string
  signal?: AbortSignal
  maxRetries?: number
}): Promise<T> {
  const { config, schema, system, user, signal } = args
  const maxRetries = args.maxRetries ?? 2
  const baseUrl = (config.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "")
  let lastErr: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const messages: Msg[] = [
        { role: "system", content: `${system}\n你必须只输出一个合法 JSON 对象，不要任何解释、不要 markdown 代码块。` },
        { role: "user", content: user },
      ]
      const useJsonMode = attempt === 0 // 首次用原生 JSON mode，重试改纯 prompt 约束
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          temperature: 0, // 判断类任务用 0，稳定
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal,
      })
      if (!res.ok) throw new Error(`structured_http_${res.status}: ${(await res.text()).slice(0, 300)}`)
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const raw = json.choices?.[0]?.message?.content ?? ""
      return schema.parse(extractJson(raw))
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("structured_output_failed")
}

/** 容错提取：若模型多吐了 markdown 围栏 / 前后缀，截取首个完整 JSON 对象 */
function extractJson(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fallthrough */
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error("no_json_object_found")
}
