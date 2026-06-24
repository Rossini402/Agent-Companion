import type { InboxChatConversation, ConversationUnderstanding } from "@ai-companion/contracts"
import {
  getSafetySystemInstruction,
  getIntentSystemInstruction,
  getRelationshipStageSystemInstruction,
  getEmotionRouteSystemInstruction,
  getReplyPolicySystemInstruction,
} from "./understanding/prompt-inject"

export type ChatRole = "system" | "user" | "assistant"
export type ChatCompletionMessage = { role: ChatRole; content: string }

export type ActiveMemory = { type: string; importance: number; content: string }
export type HistoryMessage = { role: "user" | "assistant"; content: string }

/** 清洗 D1 中存储的消息内容，空白消息返回空串以便跳过 */
export function normalizeStoredMessage(content: string): string {
  return content.replace(/\s+/g, " ").trim()
}

/**
 * Prompt 组装 —— 一次「上下文分拣」。
 * 顺序：人设 → 长期记忆 → 会话摘要 →（对象资料）→ 历史消息 → 本轮输入。
 * 每段各回答一个问题，回答才不容易飘。
 */
export function buildAgentChatMessages(input: {
  agentDefaultPrompt?: string | null
  activeMemories: ActiveMemory[]
  summary?: string | null
  conversation: InboxChatConversation
  history: HistoryMessage[]
  latestUserText: string
  understanding?: ConversationUnderstanding | null
}): ChatCompletionMessage[] {
  const { agentDefaultPrompt, activeMemories, summary, conversation, history, latestUserText, understanding } = input

  const systemContent = [
    agentDefaultPrompt || "你是 AI Agent Web 控制台里的聊天陪伴助手。",
    "请基于当前聊天对象、关系氛围和用户意图，用简洁、自然的中文回答用户。",
    "如果用户要求起草回复，请直接给出可发送的聊天内容，避免正式公文格式和职场汇报语气。",
    "你的建议应尊重双方边界，避免操控式话术、制造焦虑或诱导过度解读。",
    // 阶段3 安全边界注入（最前，紧贴人设/通用约束之后）
    getSafetySystemInstruction(understanding?.safety),
    // 阶段2 对话理解链注入（人设之后、长期记忆之前）：意图→关系阶段→情绪/路由→回复策略
    getIntentSystemInstruction(understanding?.intent),
    getRelationshipStageSystemInstruction(understanding?.relationshipStage),
    getEmotionRouteSystemInstruction(understanding?.emotion, understanding?.route),
    getReplyPolicySystemInstruction(understanding?.replyPolicy),
    activeMemories.length > 0
      ? [
          "以下是用户与该 Agent 的长期记忆，请优先尊重：",
          ...activeMemories.map((m) => `- [${m.type} / 重要度 ${m.importance}] ${m.content}`),
        ].join("\n")
      : "",
    summary ? `此前对话摘要：${summary}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const messages: ChatCompletionMessage[] = [{ role: "system", content: systemContent }]

  // 聊天对象静态资料：单独一条 user message
  messages.push({
    role: "user",
    content: [
      `聊天对象：${conversation.name}（${conversation.handle}）`,
      `对象状态：${conversation.status}，${conversation.lastActive}`,
      `关系阶段：${conversation.relationship}`,
      `聊天主题：${conversation.headline}`,
      `共同点：${conversation.topic}`,
      `心动值：${conversation.chemistryLabel} ${conversation.chemistry}`,
      `互动节奏：${conversation.rhythm}`,
      `对象备注：${conversation.profileNote}`,
    ].join("\n"),
  })

  // 历史消息（来自 D1，清洗空消息，保留原 role）
  for (const message of history) {
    const text = normalizeStoredMessage(message.content)
    if (!text) continue
    messages.push({ role: message.role, content: text })
  }

  // 本轮用户输入
  if (latestUserText) {
    messages.push({ role: "user", content: latestUserText })
  }

  return messages
}
