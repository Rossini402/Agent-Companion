import type {
  ConversationIntent,
  ConversationEmotion,
  ConversationRelationshipStage,
  EmotionRoute,
} from "@ai-companion/contracts"

type RouteName = EmotionRoute["route"]

const ROUTE_DEFAULTS: Record<RouteName, Omit<EmotionRoute, "route" | "routeGuidance">> = {
  light_companion: { responseLength: "short", shouldAskQuestion: true, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: false },
  warm_comfort: { responseLength: "short", shouldAskQuestion: false, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: true },
  deep_comfort: { responseLength: "medium", shouldAskQuestion: false, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: true },
  playful_flirt: { responseLength: "short", shouldAskQuestion: true, shouldGiveAdvice: false, shouldUsePetName: true, shouldMirrorEmotion: false },
  calm_deescalation: { responseLength: "short", shouldAskQuestion: false, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: false },
  relationship_repair: { responseLength: "short", shouldAskQuestion: false, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: true },
  gentle_clarification: { responseLength: "very_short", shouldAskQuestion: true, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: false },
  practical_support: { responseLength: "medium", shouldAskQuestion: false, shouldGiveAdvice: true, shouldUsePetName: false, shouldMirrorEmotion: false },
  quiet_presence: { responseLength: "very_short", shouldAskQuestion: false, shouldGiveAdvice: false, shouldUsePetName: false, shouldMirrorEmotion: true },
}

const ROUTE_GUIDANCE: Record<RouteName, string> = {
  light_companion: "轻松自然地陪伴，维持互动温度，不刻意深入。",
  warm_comfort: "先共情安慰，让用户感到被理解，不急着给方案。",
  deep_comfort: "给予更深的情感承接与陪伴，缓慢、稳定、不评判。",
  playful_flirt: "俏皮亲昵地回应，制造甜度，但尊重对方节奏。",
  calm_deescalation: "降温优先，稳定而温和，先化解负面情绪再谈其它。",
  relationship_repair: "优先修复关系体验，承接情绪、必要时致歉，少暧昧。",
  gentle_clarification: "温和地澄清用户真正想要什么，只问一个问题。",
  practical_support: "在共情基础上给出克制、可行的建议。",
  quiet_presence: "安静陪伴，话少而稳，不追问、不给建议。",
}

function assembleRoute(route: RouteName): EmotionRoute {
  return { route, ...ROUTE_DEFAULTS[route], routeGuidance: ROUTE_GUIDANCE[route] }
}

/** intent+emotion 都缺时的兜底路由 */
export const fallbackEmotionRoute: EmotionRoute = assembleRoute("gentle_clarification")

/**
 * 情绪路由（代码规则，文章184+187）。LLM 负责识别情绪，代码负责选择路由——稳定、可预测。
 * 规则优先级从高到低。
 */
export function buildEmotionRoute(input: {
  intent: ConversationIntent
  emotion: ConversationEmotion
  relationshipStage: ConversationRelationshipStage
}): EmotionRoute {
  const { intent, emotion, relationshipStage: stage } = input

  // 1. 修复阶段优先
  if (stage.stage === "repairing" || stage.pacing === "repair_first") return assembleRoute("relationship_repair")

  // 2. 边界敏感 / 依赖观察 / 强边界 → 降温
  if (stage.stage === "boundary_sensitive" || stage.stage === "dependency_watch" || stage.boundaryMode === "firm") {
    return assembleRoute("calm_deescalation")
  }

  // 3. 需要降温 / 愤怒 → 降温
  if (emotion.needsDeescalation || emotion.primaryEmotion === "angry") return assembleRoute("calm_deescalation")

  // 4. 修复/反馈意图 → 修复
  if (intent.primary === "conversation_repair" || intent.primary === "agent_feedback") {
    return assembleRoute("relationship_repair")
  }

  // 5. 暧昧/亲昵 → 调情，但低历史/低亲密度降级为轻陪伴（文章187）
  if (intent.primary === "romantic_flirt" || emotion.primaryEmotion === "affectionate") {
    if (stage.stage === "new_connection" || stage.intimacyPermission === "low") return assembleRoute("light_companion")
    return assembleRoute("playful_flirt")
  }

  // 6. 关系建议/分析情况
  if (intent.primary === "relationship_advice" || intent.requestedAgentAction === "analyze_situation") {
    return emotion.needsComfort ? assembleRoute("warm_comfort") : assembleRoute("practical_support")
  }

  // 7. 需要安慰 / 负面情绪
  if (emotion.needsComfort || emotion.valence === "negative") {
    const quiet = emotion.primaryEmotion === "tired" || intent.primary === "companionship_presence"
    return quiet ? assembleRoute("quiet_presence") : assembleRoute("warm_comfort")
  }

  // 8. 默认
  return assembleRoute("light_companion")
}
