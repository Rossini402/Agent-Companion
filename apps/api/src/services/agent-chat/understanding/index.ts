import type { ConversationUnderstanding } from "@ai-companion/contracts"
import type { UnderstandingContext } from "./types"
import { classifyIntent, fallbackIntent, normalizeIntent } from "./intent"
import { detectEmotion, fallbackEmotion, normalizeEmotion } from "./emotion"
import { analyzeRelationshipStage, buildHeuristicRelationshipStage, normalizeRelationshipStage } from "./relationship-stage"
import { buildEmotionRoute } from "./route"
import { buildReplyPolicy } from "./reply-policy"

export type { UnderstandingContext } from "./types"

/**
 * 对话理解链（串行，全程兜底，替代 LangGraph）。
 * 顺序严格遵循文章187：intent → emotion → relationshipStage → route → replyPolicy。
 * 任一 LLM 节点失败都不会抛到主链路（节点内各自 try/catch 回退 fallback）；
 * 仅当整体编排异常时，外层 catch 用 fallback 重建一套完整结果，保证 metadata 永远完整。
 */
export async function analyzeConversationUnderstanding(ctx: UnderstandingContext): Promise<ConversationUnderstanding> {
  try {
    const intent = await classifyIntent(ctx)
    const emotion = await detectEmotion(ctx, intent)
    const relationshipStage = await analyzeRelationshipStage(ctx, intent, emotion)
    const route = buildEmotionRoute({ intent, emotion, relationshipStage })
    const replyPolicy = buildReplyPolicy({ safety: null, intent, emotion, relationshipStage, route })
    return { analysisVersion: "conversation-understanding-v2", safety: null, intent, emotion, relationshipStage, route, replyPolicy }
  } catch (err) {
    console.warn("conversation understanding failed, full fallback", err)
    const intent = normalizeIntent(fallbackIntent)
    const emotion = normalizeEmotion(fallbackEmotion)
    const relationshipStage = normalizeRelationshipStage(
      buildHeuristicRelationshipStage(ctx, intent, emotion),
      ctx,
      intent,
      emotion,
    )
    const route = buildEmotionRoute({ intent, emotion, relationshipStage })
    const replyPolicy = buildReplyPolicy({ safety: null, intent, emotion, relationshipStage, route })
    return { analysisVersion: "conversation-understanding-v2", safety: null, intent, emotion, relationshipStage, route, replyPolicy }
  }
}
