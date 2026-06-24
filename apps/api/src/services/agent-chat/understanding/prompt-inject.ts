import type {
  ConversationIntent,
  ConversationEmotion,
  ConversationRelationshipStage,
  ConversationSafety,
  EmotionRoute,
  ReplyPolicy,
} from "@ai-companion/contracts"

const HIDDEN = "以上为隐性策略，请勿在回复中暴露任何分类标签或内部术语。"

/** 安全边界注入（文章182）：continue/safe 时返回空串被 filter 剔除 */
export function getSafetySystemInstruction(safety: ConversationSafety | null | undefined): string {
  if (!safety || safety.boundaryAction === "continue") return ""
  return [
    "本轮安全边界判断（必须遵守）：",
    `- 等级：${safety.safetyLevel}；分类：${safety.category}；动作：${safety.boundaryAction}`,
    `- 回复策略：${safety.responseGuidance}`,
    "请优先保护用户与他人的现实安全、隐私和关系边界；不要提供操控、伤害、违法或高风险专业建议。",
  ].join("\n")
}

export function getIntentSystemInstruction(intent: ConversationIntent | null | undefined): string {
  if (!intent) return ""
  return [
    "本轮用户意图分析（隐性参考）：",
    `- 主意图：${intent.primary}（置信度 ${intent.confidence.toFixed(2)}）`,
    `- 用户需要：${intent.userNeed}`,
    `- 期望回复：深度 ${intent.replyExpectation.depth} / 温度 ${intent.replyExpectation.warmth} / 风格 ${intent.replyExpectation.directness}`,
    intent.shouldClarify && intent.clarifyingQuestion ? `- 如需澄清可参考：${intent.clarifyingQuestion}` : "",
    `- 指导：${intent.promptGuidance}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function getRelationshipStageSystemInstruction(stage: ConversationRelationshipStage | null | undefined): string {
  if (!stage) return ""
  return [
    "本轮关系阶段（隐性参考）：",
    `- 阶段：${stage.displayName}（亲密度允许 ${stage.intimacyPermission}，节奏 ${stage.pacing}）`,
    stage.riskSignals.length ? `- 风险信号：${stage.riskSignals.join("、")}` : "",
    `- 指导：${stage.relationshipGuidance}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function getEmotionRouteSystemInstruction(
  emotion: ConversationEmotion | null | undefined,
  route: EmotionRoute | null | undefined,
): string {
  if (!emotion && !route) return ""
  const lines: string[] = ["本轮情绪与回应方式（隐性参考）："]
  if (emotion) {
    lines.push(`- 情绪：${emotion.primaryEmotion}（强度 ${emotion.intensity.toFixed(2)}，${emotion.valence}）`)
    if (emotion.needsComfort) lines.push("- 用户需要被安慰，先承接情绪")
    if (emotion.needsDeescalation) lines.push("- 需要先降温，避免火上浇油")
  }
  if (route) {
    lines.push(`- 回应长度：${route.responseLength}；${route.shouldMirrorEmotion ? "可镜像用户情绪；" : ""}${route.shouldUsePetName ? "可用昵称；" : ""}`)
    lines.push(`- 指导：${route.routeGuidance}`)
  }
  return lines.join("\n")
}

export function getReplyPolicySystemInstruction(p: ReplyPolicy | null | undefined): string {
  if (!p) return ""
  return [
    "本轮回复策略（必须遵守）：",
    `- 策略：${p.policy}`,
    `- 句数范围：${p.sentenceBudget.min}-${p.sentenceBudget.max} 句`,
    `- 节奏：${p.rhythm}；开场动作：${p.openingMove}；亲密度：${p.intimacyLevel}`,
    `- 最多追问 ${p.questionLimit} 个问题，最多给 ${p.adviceLimit} 条建议`,
    p.allowedMoves.length ? `- 允许动作：${p.allowedMoves.join("、")}` : "",
    p.forbiddenMoves.length ? `- 禁止动作：${p.forbiddenMoves.join("、")}` : "",
    `- 风格指导：${p.styleGuidance}`,
    `这不是固定话术模板；请自然表达，但必须遵守以上策略约束。${HIDDEN}`,
  ]
    .filter(Boolean)
    .join("\n")
}
