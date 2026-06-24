import { ConversationIntentSchema, type ConversationIntent } from "@ai-companion/contracts"
import { callStructured } from "./structured"
import { formatMemories, formatRecent } from "./format"
import { INTENT_OUTPUT_SPEC } from "./output-spec"
import type { UnderstandingContext } from "./types"

/** 意图识别失败兜底（文章183） */
export const fallbackIntent: ConversationIntent = {
  primary: "unclear",
  secondary: [],
  confidence: 0.3,
  userNeed: "unknown",
  requestedAgentAction: "ask_follow_up",
  relationshipSignal: "neutral",
  replyExpectation: { depth: "medium", warmth: "medium", directness: "gentle", shouldAskQuestion: true },
  shouldClarify: true,
  clarifyingQuestion: "你是更想让我先听你说说，还是想让我帮你一起想办法？",
  promptGuidance: "先简短承接用户，不要擅自下结论；用一个自然的问题澄清用户真正需要。",
}

const SYSTEM = [
  "你是 AI 电子伴侣聊天产品的意图识别器。",
  "你的任务不是回复用户，而是判断用户在亲密陪伴/交友聊天场景中的真实沟通意图。",
  "必须结合最近对话、长期记忆、Agent 人设边界来判断。",
  "不要把所有问题都归为关系建议；用户只是想被陪伴、被听见或维持互动时，要识别为陪伴类意图。",
].join("\n")

export async function classifyIntent(ctx: UnderstandingContext): Promise<ConversationIntent> {
  const text = ctx.userText.trim()
  if (!text) {
    return normalizeIntent({
      ...fallbackIntent,
      primary: "casual_chat",
      confidence: 0.7,
      userNeed: "feel_connected",
      requestedAgentAction: "continue_topic",
      shouldClarify: false,
      clarifyingQuestion: null,
      promptGuidance: "用户没有提供明确新内容时，轻柔延续当前话题，不要制造压力。",
    })
  }
  try {
    const user = [
      `Agent 名称：${ctx.agentName || "未命名 Agent"}`,
      `Agent 边界规则：\n${ctx.agentGuardrails || "暂无"}`,
      `长期记忆：\n${formatMemories(ctx.activeMemories)}`,
      `最近对话：\n${formatRecent(ctx.recentMessages)}`,
      `本轮用户输入：\n${text}`,
    ].join("\n\n")
    const result = await callStructured({
      config: ctx.config,
      schema: ConversationIntentSchema,
      system: `${SYSTEM}\n\n${INTENT_OUTPUT_SPEC}`,
      user,
      signal: ctx.signal,
    })
    return normalizeIntent(result)
  } catch (err) {
    console.warn("classifyIntent failed, fallback", err)
    return normalizeIntent(fallbackIntent)
  }
}

/** 代码归一化（文章183）：守住产品策略，治理 LLM 输出 */
export function normalizeIntent(intent: ConversationIntent): ConversationIntent {
  const next: ConversationIntent = {
    ...intent,
    secondary: Array.from(new Set(intent.secondary.filter((s) => s !== intent.primary))).slice(0, 3),
    replyExpectation: { ...intent.replyExpectation },
    clarifyingQuestion: intent.clarifyingQuestion?.trim() || null,
    promptGuidance: intent.promptGuidance.trim() || fallbackIntent.promptGuidance,
  }
  if (next.confidence < 0.45) {
    next.primary = "unclear"
    next.secondary = []
    next.userNeed = "unknown"
    next.requestedAgentAction = "ask_follow_up"
    next.shouldClarify = true
    next.replyExpectation.shouldAskQuestion = true
  }
  if (next.primary === "memory_update") {
    next.userNeed = "update_memory"
    next.requestedAgentAction = "remember_fact"
    next.replyExpectation.depth = "short"
    next.replyExpectation.shouldAskQuestion = false
    next.shouldClarify = false
  }
  if (next.primary === "preference_setting" || next.primary === "agent_feedback") {
    next.userNeed = "adjust_agent"
    next.requestedAgentAction = next.primary === "agent_feedback" ? "repair_misunderstanding" : "adjust_style"
  }
  if (next.shouldClarify && !next.clarifyingQuestion) next.clarifyingQuestion = fallbackIntent.clarifyingQuestion
  return next
}
