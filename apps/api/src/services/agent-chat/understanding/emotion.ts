import {
  ConversationEmotionSchema,
  type ConversationEmotion,
  type ConversationIntent,
} from "@ai-companion/contracts"
import { callStructured } from "./structured"
import { formatRecent } from "./format"
import { EMOTION_OUTPUT_SPEC } from "./output-spec"
import type { UnderstandingContext } from "./types"

/** 情绪识别失败兜底（文章184） */
export const fallbackEmotion: ConversationEmotion = {
  primaryEmotion: "neutral",
  secondaryEmotions: [],
  intensity: 0.3,
  valence: "neutral",
  arousal: "low",
  needsComfort: false,
  needsDeescalation: false,
  needsClarification: true,
  emotionalCue: "情绪信号不明显，保持中性温和陪伴。",
  replyTone: "warm",
}

const SYSTEM = [
  "你是 AI 电子伴侣聊天产品的情绪识别器。",
  "判断用户本轮的情绪状态，而不是回复用户。",
  "同样一句话在不同意图下情绪可能不同，请结合给定的意图与最近对话综合判断。",
  "对疲惫、低落、孤独、焦虑等需要被陪伴的信号要敏感，但不要过度解读中性表达。",
].join("\n")

export async function detectEmotion(
  ctx: UnderstandingContext,
  intent: ConversationIntent,
): Promise<ConversationEmotion> {
  const text = ctx.userText.trim()
  if (!text) return normalizeEmotion(fallbackEmotion)
  try {
    const user = [
      `已识别意图：primary=${intent.primary}，userNeed=${intent.userNeed}，relationshipSignal=${intent.relationshipSignal}`,
      `最近对话：\n${formatRecent(ctx.recentMessages)}`,
      `本轮用户输入：\n${text}`,
    ].join("\n\n")
    const result = await callStructured({
      config: ctx.config,
      schema: ConversationEmotionSchema,
      system: `${SYSTEM}\n\n${EMOTION_OUTPUT_SPEC}`,
      user,
      signal: ctx.signal,
    })
    return normalizeEmotion(result)
  } catch (err) {
    console.warn("detectEmotion failed, fallback", err)
    return normalizeEmotion(fallbackEmotion)
  }
}

/** 代码归一化（文章184）：强负面→needsComfort；愤怒/受伤+高激活→needsDeescalation */
export function normalizeEmotion(e: ConversationEmotion): ConversationEmotion {
  const next: ConversationEmotion = {
    ...e,
    secondaryEmotions: Array.from(new Set(e.secondaryEmotions.map((s) => s.trim()).filter(Boolean))).slice(0, 3),
    emotionalCue: e.emotionalCue.trim() || fallbackEmotion.emotionalCue,
  }
  if (next.intensity >= 0.7 && next.valence === "negative") next.needsComfort = true
  if ((next.primaryEmotion === "angry" || next.primaryEmotion === "hurt") && next.arousal === "high") {
    next.needsDeescalation = true
  }
  return next
}
