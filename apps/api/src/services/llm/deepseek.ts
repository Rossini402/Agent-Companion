import type { ChatCompletionMessage } from "../agent-chat/build-prompt"

export type DeepSeekConfig = {
  apiKey: string
  model: string
  baseUrl?: string
}

/**
 * DeepSeek 流式对话（OpenAI 兼容，POST {baseUrl}/chat/completions，stream:true）。
 * 以 async generator 逐块吐出文本增量；SSE 以 `data:` 行传输，`[DONE]` 结束。
 */
export async function* streamDeepSeekChat(
  config: DeepSeekConfig,
  messages: ChatCompletionMessage[],
  opts?: { temperature?: number; signal?: AbortSignal },
): AsyncGenerator<string, void, unknown> {
  const baseUrl = (config.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "")
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: opts?.temperature ?? 0.7,
    }),
    signal: opts?.signal,
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "")
    throw new Error(`deepseek_http_${res.status}: ${detail.slice(0, 500)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    // 末段可能是半行，留到下次拼接
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const data = trimmed.slice(5).trim()
      if (data === "[DONE]") return
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[]
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // 不完整 JSON（理论上不会发生，因为按整行解析），忽略
      }
    }
  }
}
