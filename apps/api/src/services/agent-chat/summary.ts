const MAX_SUMMARY_CHARS = 1600

/**
 * 轻量滚动摘要（非 LLM）。
 * previousSummary 已经累积了「此前所有对话」的脉络，因此每轮只需把「本轮新增的一来一回」
 * 追加到尾部，再压缩空白、保留末尾 MAX_SUMMARY_CHARS（保留最近内容）。
 * —— 不要再把 recent 历史窗口重新拼进来，否则会和 previousSummary 重复计数。
 * 选择字符串策略而非 LLM 摘要：零额外推理成本、确定性、够用即可。
 */
export function rollSummary(input: {
  previousSummary?: string | null
  latestUserText: string
  assistantText: string
}): string {
  const { previousSummary, latestUserText, assistantText } = input

  const parts = [previousSummary?.trim() ?? ""]
  if (latestUserText.trim()) parts.push(`用户：${latestUserText.trim()}`)
  if (assistantText.trim()) parts.push(`助手：${assistantText.trim()}`)

  const merged = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  return merged.length > MAX_SUMMARY_CHARS ? merged.slice(-MAX_SUMMARY_CHARS) : merged
}
