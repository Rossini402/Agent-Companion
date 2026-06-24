import { z } from "zod"
import { ConversationSafetySchema } from "./safety.contract"

/** 意图 primary 候选（文章183） */
export const CompanionIntentPrimarySchema = z.enum([
  "casual_chat",
  "emotional_support",
  "relationship_advice",
  "romantic_flirt",
  "companionship_presence",
  "roleplay",
  "life_sharing",
  "memory_update",
  "preference_setting",
  "agent_feedback",
  "conversation_repair",
  "date_or_activity_planning",
  "creative_request",
  "meta_question",
  "unclear",
])
export type CompanionIntentPrimary = z.infer<typeof CompanionIntentPrimarySchema>

/** 意图（文章183） */
export const ConversationIntentSchema = z.object({
  primary: CompanionIntentPrimarySchema,
  secondary: z.array(CompanionIntentPrimarySchema).max(3),
  confidence: z.number().min(0).max(1),
  userNeed: z.enum([
    "be_heard",
    "be_comforted",
    "get_advice",
    "get_reply_draft",
    "play_along",
    "feel_connected",
    "set_boundary",
    "update_memory",
    "adjust_agent",
    "unknown",
  ]),
  requestedAgentAction: z.enum([
    "answer_directly",
    "comfort_first",
    "ask_follow_up",
    "draft_message",
    "analyze_situation",
    "roleplay_response",
    "remember_fact",
    "adjust_style",
    "repair_misunderstanding",
    "continue_topic",
  ]),
  relationshipSignal: z.enum([
    "neutral",
    "warming_up",
    "seeking_closeness",
    "testing_boundary",
    "feeling_hurt",
    "pulling_away",
    "dependency_risk",
    "conflict",
  ]),
  replyExpectation: z.object({
    depth: z.enum(["short", "medium", "deep"]),
    warmth: z.enum(["low", "medium", "high"]),
    directness: z.enum(["gentle", "balanced", "direct"]),
    shouldAskQuestion: z.boolean(),
  }),
  shouldClarify: z.boolean(),
  clarifyingQuestion: z.string().trim().max(200).nullable(),
  promptGuidance: z.string().trim().max(600),
})
export type ConversationIntent = z.infer<typeof ConversationIntentSchema>

/** 情绪（文章184） */
export const ConversationEmotionSchema = z.object({
  primaryEmotion: z.enum([
    "neutral",
    "happy",
    "tired",
    "lonely",
    "sad",
    "anxious",
    "angry",
    "jealous",
    "embarrassed",
    "affectionate",
    "playful",
    "confused",
    "disappointed",
    "stressed",
    "hurt",
  ]),
  secondaryEmotions: z.array(z.string().trim().min(1).max(40)).max(3),
  intensity: z.number().min(0).max(1),
  valence: z.enum(["positive", "neutral", "negative", "mixed"]),
  arousal: z.enum(["low", "medium", "high"]),
  needsComfort: z.boolean(),
  needsDeescalation: z.boolean(),
  needsClarification: z.boolean(),
  emotionalCue: z.string().trim().max(300),
  replyTone: z.enum(["light", "warm", "soft", "playful", "calm", "serious", "reassuring", "apologetic"]),
})
export type ConversationEmotion = z.infer<typeof ConversationEmotionSchema>

/** 关系阶段（文章187） */
export const ConversationRelationshipStageSchema = z.object({
  stage: z.enum([
    "new_connection",
    "warming_up",
    "comfortable_chat",
    "trusted_companion",
    "close_bond",
    "repairing",
    "boundary_sensitive",
    "dependency_watch",
  ]),
  displayName: z.string().trim().min(1).max(80),
  closenessScore: z.number().int().min(0).max(100),
  trustLevel: z.enum(["low", "medium", "high"]),
  stability: z.enum(["new", "warming", "stable", "deepening", "fragile", "repairing"]),
  boundaryMode: z.enum(["open", "warm", "careful", "firm"]),
  intimacyPermission: z.enum(["low", "medium", "high"]),
  pacing: z.enum(["slow_down", "hold", "advance_gently", "repair_first"]),
  riskSignals: z
    .array(
      z.enum([
        "low_history",
        "dependency_risk",
        "boundary_testing",
        "conflict",
        "pulling_away",
        "sexual_boundary",
        "emotional_volatility",
      ]),
    )
    .max(5),
  relationshipGuidance: z.string().trim().max(700),
})
export type ConversationRelationshipStage = z.infer<typeof ConversationRelationshipStageSchema>

/** 情绪路由（文章184，代码产出） */
export const EmotionRouteSchema = z.object({
  route: z.enum([
    "light_companion",
    "warm_comfort",
    "deep_comfort",
    "playful_flirt",
    "calm_deescalation",
    "relationship_repair",
    "gentle_clarification",
    "practical_support",
    "quiet_presence",
  ]),
  responseLength: z.enum(["very_short", "short", "medium", "long"]),
  shouldAskQuestion: z.boolean(),
  shouldGiveAdvice: z.boolean(),
  shouldUsePetName: z.boolean(),
  shouldMirrorEmotion: z.boolean(),
  routeGuidance: z.string().trim().max(600),
})
export type EmotionRoute = z.infer<typeof EmotionRouteSchema>

/** 回复策略（文章185，代码产出） */
export const ReplyPolicySchema = z.object({
  policy: z.enum([
    "quiet_presence",
    "warm_companion",
    "deep_empathy",
    "playful_flirt",
    "calm_boundary",
    "relationship_repair",
    "gentle_clarify",
    "practical_support",
    "roleplay_flow",
    "memory_ack",
  ]),
  sentenceBudget: z.object({
    min: z.number().int().min(1).max(8),
    max: z.number().int().min(1).max(8),
  }),
  rhythm: z.enum(["still", "soft", "natural", "lively", "focused"]),
  openingMove: z.enum(["acknowledge", "comfort", "mirror", "apologize", "play", "answer", "clarify", "set_boundary"]),
  allowedMoves: z
    .array(
      z.enum([
        "validate_feeling",
        "mirror_emotion",
        "offer_presence",
        "ask_one_question",
        "give_one_suggestion",
        "give_two_suggestions",
        "light_tease",
        "use_pet_name",
        "repair_misunderstanding",
        "continue_roleplay",
        "acknowledge_memory",
        "set_soft_boundary",
      ]),
    )
    .max(6),
  forbiddenMoves: z
    .array(
      z.enum([
        "lecture",
        "over_explain",
        "multiple_questions",
        "premature_advice",
        "intense_flirt",
        "diagnose_user",
        "take_sides_aggressively",
        "pressure_to_disclose",
        "promise_real_world_action",
        "expose_internal_labels",
      ]),
    )
    .max(8),
  questionLimit: z.number().int().min(0).max(2),
  adviceLimit: z.number().int().min(0).max(3),
  intimacyLevel: z.enum(["low", "medium", "high"]),
  styleGuidance: z.string().trim().max(700),
})
export type ReplyPolicy = z.infer<typeof ReplyPolicySchema>

/** 整轮理解结果（写 metadata 用） */
export const ConversationUnderstandingSchema = z.object({
  analysisVersion: z.literal("conversation-understanding-v2"),
  safety: ConversationSafetySchema.nullable(), // 阶段3 接入：承载本轮安全边界判断
  intent: ConversationIntentSchema,
  emotion: ConversationEmotionSchema,
  relationshipStage: ConversationRelationshipStageSchema,
  route: EmotionRouteSchema,
  replyPolicy: ReplyPolicySchema,
})
export type ConversationUnderstanding = z.infer<typeof ConversationUnderstandingSchema>
