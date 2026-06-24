import type { DeepSeekConfig } from "../../llm/deepseek"
import type { ConversationSafety } from "@ai-companion/contracts"
import type { ActiveMemory, HistoryMessage } from "../build-prompt"

/** 对话理解链的公共输入上下文 */
export type UnderstandingContext = {
  config: DeepSeekConfig
  agentName: string
  agentGuardrails: string | null
  activeMemories: ActiveMemory[]
  recentMessages: HistoryMessage[]
  conversationSummary: string | null
  messageCount: number
  userText: string
  signal?: AbortSignal
  safety?: ConversationSafety | null
}
