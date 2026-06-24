import {
  type ConversationRelationshipStage,
  ConversationRelationshipStageSchema,
  type ConversationIntent,
  type ConversationEmotion,
} from "@ai-companion/contracts"
import { callStructured } from "./structured"
import { formatMemories, formatRecent } from "./format"
import { RELATIONSHIP_OUTPUT_SPEC } from "./output-spec"
import type { UnderstandingContext } from "./types"

type Stage = ConversationRelationshipStage["stage"]
type RiskSignal = ConversationRelationshipStage["riskSignals"][number]

const STAGE_DEFAULTS: Record<
  Stage,
  Pick<
    ConversationRelationshipStage,
    "displayName" | "trustLevel" | "stability" | "boundaryMode" | "intimacyPermission" | "pacing"
  >
> = {
  new_connection: { displayName: "初识", trustLevel: "low", stability: "new", boundaryMode: "careful", intimacyPermission: "low", pacing: "advance_gently" },
  warming_up: { displayName: "升温熟悉", trustLevel: "low", stability: "warming", boundaryMode: "warm", intimacyPermission: "medium", pacing: "advance_gently" },
  comfortable_chat: { displayName: "自在闲聊", trustLevel: "medium", stability: "stable", boundaryMode: "warm", intimacyPermission: "medium", pacing: "hold" },
  trusted_companion: { displayName: "信任陪伴", trustLevel: "high", stability: "deepening", boundaryMode: "open", intimacyPermission: "high", pacing: "hold" },
  close_bond: { displayName: "亲密羁绊", trustLevel: "high", stability: "deepening", boundaryMode: "open", intimacyPermission: "high", pacing: "hold" },
  repairing: { displayName: "关系修复中", trustLevel: "medium", stability: "repairing", boundaryMode: "careful", intimacyPermission: "low", pacing: "repair_first" },
  boundary_sensitive: { displayName: "边界敏感", trustLevel: "low", stability: "fragile", boundaryMode: "firm", intimacyPermission: "low", pacing: "slow_down" },
  dependency_watch: { displayName: "依赖观察", trustLevel: "medium", stability: "fragile", boundaryMode: "careful", intimacyPermission: "medium", pacing: "slow_down" },
}

function assembleStage(
  stage: Stage,
  closenessScore: number,
  riskSignals: ConversationRelationshipStage["riskSignals"],
  guidance: string,
): ConversationRelationshipStage {
  return {
    stage,
    closenessScore: Math.max(0, Math.min(100, Math.round(closenessScore))),
    riskSignals: riskSignals.slice(0, 5),
    relationshipGuidance: guidance.slice(0, 700),
    ...STAGE_DEFAULTS[stage],
  }
}

function stageFromScore(score: number, messageCount: number): Stage {
  if (messageCount >= 80 && score >= 75) return "close_bond"
  if (messageCount >= 36 && score >= 58) return "trusted_companion"
  if (messageCount >= 16 && score >= 38) return "comfortable_chat"
  if (messageCount >= 6) return "warming_up"
  return "new_connection"
}

/** 启发式兜底（文章187）：纯靠 messageCount + 记忆重要度 + 亲近信号推关系阶段 */
export function buildHeuristicRelationshipStage(
  ctx: UnderstandingContext,
  intent: ConversationIntent,
  _emotion: ConversationEmotion,
): ConversationRelationshipStage {
  const memBonus = Math.min(
    ctx.activeMemories.reduce((n, m) => n + m.importance, 0),
    25,
  )
  const signalBonus =
    intent.relationshipSignal === "seeking_closeness" ? 8 : intent.relationshipSignal === "warming_up" ? 4 : 0
  const score = ctx.messageCount * 1.1 + memBonus + signalBonus
  const stage = stageFromScore(score, ctx.messageCount)
  const risks: ConversationRelationshipStage["riskSignals"] = ctx.messageCount < 6 ? ["low_history"] : []
  return assembleStage(stage, score, risks, "按互动量推断的关系阶段，保持与该阶段匹配的亲密度与节奏。")
}

const SYSTEM = [
  "你是 AI 电子伴侣聊天产品的关系阶段分析器。",
  "结合消息数量、长期记忆、最近对话、当前意图与情绪，判断用户与该 Agent 当前所处的关系阶段。",
  "关系推进要克制：消息很少时不要给出过高亲密度；出现受伤/冲突/依赖风险信号时要识别为修复/边界/依赖观察阶段。",
].join("\n")

export async function analyzeRelationshipStage(
  ctx: UnderstandingContext,
  intent: ConversationIntent,
  emotion: ConversationEmotion,
): Promise<ConversationRelationshipStage> {
  try {
    const user = [
      `消息总数：${ctx.messageCount}`,
      `会话摘要：${ctx.conversationSummary || "（暂无）"}`,
      `当前意图：primary=${intent.primary}，relationshipSignal=${intent.relationshipSignal}`,
      `当前情绪：primary=${emotion.primaryEmotion}，valence=${emotion.valence}，needsComfort=${emotion.needsComfort}`,
      `长期记忆：\n${formatMemories(ctx.activeMemories)}`,
      `最近对话：\n${formatRecent(ctx.recentMessages)}`,
      `本轮用户输入：\n${ctx.userText.trim() || "（空）"}`,
    ].join("\n\n")
    const result = await callStructured({
      config: ctx.config,
      schema: ConversationRelationshipStageSchema,
      system: `${SYSTEM}\n\n${RELATIONSHIP_OUTPUT_SPEC}`,
      user,
      signal: ctx.signal,
    })
    return normalizeRelationshipStage(result, ctx, intent, emotion)
  } catch (err) {
    console.warn("analyzeRelationshipStage failed, heuristic fallback", err)
    return normalizeRelationshipStage(buildHeuristicRelationshipStage(ctx, intent, emotion), ctx, intent, emotion)
  }
}

/** 代码归一化（文章187）：低历史压亲密度、依赖/修复信号收口 */
export function normalizeRelationshipStage(
  stage: ConversationRelationshipStage,
  ctx: UnderstandingContext,
  intent: ConversationIntent,
  emotion: ConversationEmotion,
): ConversationRelationshipStage {
  let next: ConversationRelationshipStage = {
    ...stage,
    displayName: stage.displayName.trim() || STAGE_DEFAULTS[stage.stage].displayName,
    riskSignals: Array.from(new Set(stage.riskSignals)).slice(0, 5),
    relationshipGuidance: stage.relationshipGuidance.trim().slice(0, 700) || "保持与当前关系阶段匹配的亲密度与节奏。",
  }

  // 低历史强拉回初识（文章187：消息很少不给高亲密度）
  if (ctx.messageCount < 6) {
    next = {
      ...next,
      ...STAGE_DEFAULTS.new_connection,
      stage: "new_connection",
      closenessScore: Math.min(next.closenessScore, 35),
      intimacyPermission: "low",
      riskSignals: Array.from(new Set<RiskSignal>([...next.riskSignals, "low_history"])).slice(0, 5),
    }
  }

  // 依赖风险 → 依赖观察
  if (intent.relationshipSignal === "dependency_risk") {
    next = { ...next, ...STAGE_DEFAULTS.dependency_watch, stage: "dependency_watch", closenessScore: next.closenessScore }
    next.riskSignals = Array.from(new Set<RiskSignal>([...next.riskSignals, "dependency_risk"])).slice(0, 5)
  }

  // 冲突/受伤/失望 → 修复阶段
  const repairing =
    intent.primary === "conversation_repair" ||
    intent.relationshipSignal === "feeling_hurt" ||
    intent.relationshipSignal === "conflict" ||
    emotion.primaryEmotion === "hurt" ||
    emotion.primaryEmotion === "disappointed"
  if (repairing) {
    next = { ...next, ...STAGE_DEFAULTS.repairing, stage: "repairing", closenessScore: next.closenessScore, pacing: "repair_first" }
    next.riskSignals = Array.from(new Set<RiskSignal>([...next.riskSignals, "conflict"])).slice(0, 5)
  }

  return next
}
