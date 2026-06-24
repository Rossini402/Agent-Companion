import type { ActiveMemory, HistoryMessage } from "../build-prompt"

/** 把长期记忆格式化进理解节点的 user 段 */
export function formatMemories(mems: ActiveMemory[]): string {
  if (!mems.length) return "（暂无）"
  return mems.map((m) => `- [${m.type} / 重要度 ${m.importance}] ${m.content}`).join("\n")
}

/** 把最近对话格式化进理解节点的 user 段（最多 12 条） */
export function formatRecent(msgs: HistoryMessage[]): string {
  if (!msgs.length) return "（暂无）"
  return msgs
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n")
}
