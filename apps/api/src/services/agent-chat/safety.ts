import { ConversationSafetySchema, type ConversationSafety } from "@ai-companion/contracts"
import { callDeepSeekJson, type DeepSeekConfig } from "../llm/deepseek"
import type { ChatCompletionMessage } from "./build-prompt"

const SAFETY_SYSTEM = [
  "你是 AI 电子伴侣聊天产品的安全边界判断器。",
  "你的任务是判断本轮用户输入是否需要安全边界处理，而不是替用户聊天。",
  "必须优先识别自伤危机、违法暴力、隐私侵犯、操控关系、性边界、高风险医疗法律财务建议、强情绪依赖。",
  "不要因为产品是陪伴/恋爱/交友场景就放松边界；也不要过度拦截普通倾诉、轻度暧昧和正常情绪表达。",
  "如果不确定，使用 caution + soft_boundary，而不是 safe。",
  "只输出一个 JSON 对象，禁止任何解释、前后缀、```json 代码块。",
  '字段固定为：{"safetyLevel","category","boundaryAction","reason","responseGuidance","allowMemoryExtraction"}。',
  "safetyLevel ∈ [safe, caution, redirect, block, crisis]；",
  "category ∈ [normal, emotional_dependency, manipulation, self_harm, sexual_boundary, privacy, illegal, medical_legal_financial, other]；",
  "boundaryAction ∈ [continue, soft_boundary, redirect, refuse, crisis_support]；",
  "reason / responseGuidance 为简短中文；allowMemoryExtraction 为布尔。",
].join("\n")

/** 业务一致性保护：安全等级越高，系统越保守（文章182） */
export function normalizeConversationSafety(s: ConversationSafety): ConversationSafety {
  const next: ConversationSafety = { ...s }
  if (next.safetyLevel === "crisis") {
    next.boundaryAction = "crisis_support"
    next.allowMemoryExtraction = false
  }
  if (next.safetyLevel === "block" && next.boundaryAction !== "crisis_support") {
    next.boundaryAction = "refuse"
    next.allowMemoryExtraction = false
  }
  if (next.boundaryAction === "refuse" || next.boundaryAction === "crisis_support") {
    next.allowMemoryExtraction = false
  }
  if (next.boundaryAction === "continue" && next.safetyLevel !== "safe") {
    next.boundaryAction = "soft_boundary"
  }
  if (!next.responseGuidance.trim()) next.responseGuidance = "用温和、克制、尊重边界的方式回复。"
  return next
}

/** 失败保守 fallback：绝不当 safe（文章182） */
export const fallbackSafety: ConversationSafety = {
  safetyLevel: "caution",
  category: "other",
  boundaryAction: "soft_boundary",
  reason: "安全边界判断暂时不可用，采用保守回复策略。",
  responseGuidance: "用温和、克制、尊重边界的方式回复；不要提供操控、伤害、违法或高风险专业建议。",
  allowMemoryExtraction: false,
}

/** 从可能含噪声（reasoning / ```json）的文本里抠出第一个 JSON 对象并 zod 解析 */
function tryParseSafety(raw: string): ConversationSafety | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const parsed = ConversationSafetySchema.safeParse(JSON.parse(m[0]))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function analyzeConversationSafety(params: {
  config: DeepSeekConfig
  agentName: string
  agentGuardrails: string | null
  activeMemories: { type: string; importance: number; content: string }[]
  recentMessages: { role: "user" | "assistant"; content: string }[]
  userText: string
  signal?: AbortSignal
}): Promise<ConversationSafety> {
  // 空输入直接 safe，省一次调用
  if (!params.userText.trim()) {
    return {
      safetyLevel: "safe",
      category: "normal",
      boundaryAction: "continue",
      reason: "空输入",
      responseGuidance: "",
      allowMemoryExtraction: true,
    }
  }
  const human = [
    `Agent 名称：${params.agentName || "未命名 Agent"}`,
    "",
    "Agent 自定义边界规则：",
    params.agentGuardrails || "暂无",
    "",
    "长期记忆：",
    params.activeMemories.map((m) => `- [${m.type}] ${m.content}`).join("\n") || "暂无",
    "",
    "最近对话：",
    params.recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n") || "暂无",
    "",
    "本轮用户输入：",
    params.userText,
  ].join("\n")
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: SAFETY_SYSTEM },
    { role: "user", content: human },
  ]

  // 退路：最多 2 次（先 json_object，再纯 prompt 约束），全失败 → 保守 fallback
  for (const jsonObject of [true, false]) {
    try {
      const raw = await callDeepSeekJson(params.config, messages, { signal: params.signal, jsonObject })
      const parsed = tryParseSafety(raw)
      if (parsed) return normalizeConversationSafety(parsed)
    } catch (err) {
      console.error("safety analysis attempt failed", { jsonObject, err })
    }
  }
  return fallbackSafety
}

/** 前置短路文本：null 表示不短路、继续正常聊天（文章182） */
export function buildBoundaryResponse(safety: ConversationSafety): string | null {
  if (safety.boundaryAction === "crisis_support") {
    return [
      "我听到你现在可能很难受。先别一个人硬扛，尽量把手边可能伤害自己的东西移远一点，去到更安全、有人能看见你的地方。",
      "如果你有立即伤害自己的可能，请现在联系当地紧急电话或身边可信的人，让他们陪你。你也可以告诉我：你现在是否安全、身边有没有人可以马上联系。",
    ].join("\n\n")
  }
  if (safety.boundaryAction === "refuse") {
    return [
      "这个请求我不能直接帮你完成，因为它可能会伤害他人、侵犯隐私，或越过必要的安全边界。",
      safety.responseGuidance || "我可以换一种更安全、尊重边界的方式，帮你梳理真实需求和可行表达。",
    ].join("\n\n")
  }
  return null
}
