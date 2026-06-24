import type {
  ConversationIntent,
  ConversationEmotion,
  ConversationRelationshipStage,
  EmotionRoute,
  ReplyPolicy,
} from "@ai-companion/contracts"

type RouteName = EmotionRoute["route"]
type Allowed = ReplyPolicy["allowedMoves"][number]
type Budget = ReplyPolicy["sentenceBudget"]

/** 由路由的回复长度推句数预算（文章185） */
export function sentenceBudgetForRoute(route: EmotionRoute): Budget {
  switch (route.responseLength) {
    case "very_short":
      return { min: 1, max: 2 }
    case "short":
      return { min: 1, max: 3 }
    case "medium":
      return { min: 2, max: 4 }
    case "long":
      return { min: 3, max: 6 }
  }
}

const ROUTE_TO_POLICY: Record<
  RouteName,
  { policy: ReplyPolicy["policy"]; openingMove: ReplyPolicy["openingMove"]; rhythm: ReplyPolicy["rhythm"]; allowed: Allowed[]; intimacy: ReplyPolicy["intimacyLevel"] }
> = {
  quiet_presence: { policy: "quiet_presence", openingMove: "comfort", rhythm: "still", allowed: ["validate_feeling", "offer_presence"], intimacy: "medium" },
  warm_comfort: { policy: "warm_companion", openingMove: "comfort", rhythm: "soft", allowed: ["validate_feeling", "mirror_emotion", "offer_presence"], intimacy: "medium" },
  deep_comfort: { policy: "deep_empathy", openingMove: "comfort", rhythm: "soft", allowed: ["validate_feeling", "mirror_emotion", "offer_presence", "ask_one_question"], intimacy: "high" },
  playful_flirt: { policy: "playful_flirt", openingMove: "play", rhythm: "lively", allowed: ["light_tease", "use_pet_name", "ask_one_question"], intimacy: "high" },
  calm_deescalation: { policy: "calm_boundary", openingMove: "acknowledge", rhythm: "focused", allowed: ["validate_feeling", "set_soft_boundary"], intimacy: "low" },
  relationship_repair: { policy: "relationship_repair", openingMove: "apologize", rhythm: "soft", allowed: ["validate_feeling", "repair_misunderstanding", "offer_presence"], intimacy: "medium" },
  gentle_clarification: { policy: "gentle_clarify", openingMove: "clarify", rhythm: "natural", allowed: ["ask_one_question", "validate_feeling"], intimacy: "low" },
  practical_support: { policy: "practical_support", openingMove: "answer", rhythm: "focused", allowed: ["give_one_suggestion", "give_two_suggestions", "ask_one_question"], intimacy: "low" },
  light_companion: { policy: "warm_companion", openingMove: "acknowledge", rhythm: "natural", allowed: ["validate_feeling", "ask_one_question", "light_tease"], intimacy: "medium" },
}

/** 上游全缺时的兜底策略 */
export const fallbackReplyPolicy: ReplyPolicy = {
  policy: "gentle_clarify",
  sentenceBudget: { min: 1, max: 2 },
  rhythm: "natural",
  openingMove: "clarify",
  allowedMoves: ["ask_one_question", "validate_feeling"],
  forbiddenMoves: ["lecture", "over_explain", "expose_internal_labels"],
  questionLimit: 1,
  adviceLimit: 0,
  intimacyLevel: "low",
  styleGuidance: "先温和澄清用户真正想要什么，只问一个问题，不下结论。",
}

/**
 * 回复策略（代码规则，文章185+187）。把意图/情绪/关系阶段/路由收敛成可执行的回复约束。
 */
export function buildReplyPolicy(input: {
  safety: null
  intent: ConversationIntent
  emotion: ConversationEmotion
  relationshipStage: ConversationRelationshipStage
  route: EmotionRoute
}): ReplyPolicy {
  const { intent, emotion, relationshipStage: stage, route } = input
  const base = ROUTE_TO_POLICY[route.route]

  let policy = base.policy
  let openingMove = base.openingMove
  let rhythm = base.rhythm
  let allowedMoves: Allowed[] = [...base.allowed]
  let intimacyLevel = base.intimacy
  let sentenceBudget = sentenceBudgetForRoute(route)

  // 记忆/偏好类 → memory_ack（文章185：只承接、≤2 句）
  if (intent.primary === "memory_update" || intent.primary === "preference_setting") {
    policy = "memory_ack"
    openingMove = "acknowledge"
    rhythm = "soft"
    allowedMoves = ["acknowledge_memory"]
    sentenceBudget = { min: 1, max: 2 }
  }

  const forbidden = new Set<ReplyPolicy["forbiddenMoves"][number]>(["lecture", "over_explain", "expose_internal_labels"])

  // 二次修正（文章187）
  if (stage.intimacyPermission === "low") {
    forbidden.add("intense_flirt")
    intimacyLevel = "low"
  }
  if (stage.pacing === "slow_down") {
    forbidden.add("premature_advice")
    sentenceBudget = { min: 1, max: Math.min(sentenceBudget.max, 3) }
  }
  if (stage.pacing === "repair_first") {
    policy = "relationship_repair"
  }
  if (emotion.intensity >= 0.75) {
    forbidden.add("intense_flirt")
    forbidden.add("premature_advice")
  }

  // 问/建议上限由路由开关决定
  const questionLimit: ReplyPolicy["questionLimit"] = route.shouldAskQuestion ? 1 : 0
  const adviceLimit: ReplyPolicy["adviceLimit"] = route.shouldGiveAdvice ? (route.route === "practical_support" ? 2 : 1) : 0
  if (questionLimit === 0) allowedMoves = allowedMoves.filter((m) => m !== "ask_one_question")
  if (adviceLimit === 0) allowedMoves = allowedMoves.filter((m) => m !== "give_one_suggestion" && m !== "give_two_suggestions")

  return {
    policy,
    sentenceBudget,
    rhythm,
    openingMove,
    allowedMoves: Array.from(new Set(allowedMoves)).slice(0, 6),
    forbiddenMoves: Array.from(forbidden).slice(0, 8),
    questionLimit,
    adviceLimit,
    intimacyLevel,
    styleGuidance: route.routeGuidance.slice(0, 700),
  }
}
