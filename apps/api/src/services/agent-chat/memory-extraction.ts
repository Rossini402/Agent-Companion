import { type Db, agentMemories } from "@ai-companion/db"

/** 一次性情绪/寒暄等不值得长期记忆的短语 */
const SMALL_TALK = /^(嗯+|哦+|啊+|哈+|呵+|好的?|收到|在吗|你好|晚安|早|拜拜|谢谢|ok|okay)\s*[。！!.~]*$/i

/**
 * fast reject（本地规则，零成本）：短寒暄 / 一次性情绪 / 过短 / 疑似敏感信息。
 * 命中返回 true（直接丢弃，不进入候选判断与 LLM 抽取）。
 */
export function fastRejectMemory(userText: string): boolean {
  const t = userText.trim()
  if (t.length < 6) return true
  if (SMALL_TALK.test(t)) return true
  // 疑似敏感信息（身份证/银行卡/长数字）——不写入记忆
  if (/\b\d{11,}\b/.test(t)) return true
  return false
}

export type ExtractedMemory = {
  type: string // 偏好/边界/关系目标/对话风格/重要事实
  content: string
  importance: number // 1–5
}

/**
 * 长期记忆抽取（异步、失败不影响主回复）。
 * 流程：fast reject → 候选判断（LangChain 结构化输出 + 关键词兜底）→ LLM 抽取。
 * TODO(阶段 1 后段)：接入 LLM 完成候选判断与抽取；当前先用关键词兜底占位。
 */
export async function extractMemoriesFromTurn(_input: {
  userText: string
  assistantText: string
}): Promise<ExtractedMemory[]> {
  const { userText } = _input
  if (fastRejectMemory(userText)) return []

  // —— 关键词兜底（LLM 接入前的最小可用版） ——
  const memories: ExtractedMemory[] = []
  if (/(不要|别|讨厌|不喜欢|尽量|希望你|以后)/.test(userText)) {
    memories.push({ type: "偏好", content: userText.trim().slice(0, 200), importance: 4 })
  }
  // TODO: 替换为 LangChain 结构化输出抽取，归类 type 并打 importance
  return memories
}

/** 写入抽取出的记忆，关联来源消息 */
export async function saveExtractedMemories(
  db: Db,
  args: {
    userId: string
    agentId: string
    sourceMessageId: string | null
    memories: ExtractedMemory[]
    nowMs: number
  },
): Promise<void> {
  if (args.memories.length === 0) return
  await db.insert(agentMemories).values(
    args.memories.map((m) => ({
      id: crypto.randomUUID(),
      userId: args.userId,
      agentId: args.agentId,
      type: m.type,
      content: m.content,
      importance: m.importance,
      status: "active" as const,
      sourceMessageId: args.sourceMessageId,
      createdAtMs: args.nowMs,
      updatedAtMs: args.nowMs,
    })),
  )
}
