import { z } from "zod"

/** 安全边界判断结果（文章182） */
export const ConversationSafetySchema = z.object({
  safetyLevel: z.enum(["safe", "caution", "redirect", "block", "crisis"]),
  category: z.enum([
    "normal",
    "emotional_dependency",
    "manipulation",
    "self_harm",
    "sexual_boundary",
    "privacy",
    "illegal",
    "medical_legal_financial",
    "other",
  ]),
  boundaryAction: z.enum(["continue", "soft_boundary", "redirect", "refuse", "crisis_support"]),
  reason: z.string().trim().max(300),
  responseGuidance: z.string().trim().max(600),
  allowMemoryExtraction: z.boolean(),
})
export type ConversationSafety = z.infer<typeof ConversationSafetySchema>

/** 回复质量守卫违规码（文章186） */
export const ReplyQualityViolationCode = z.enum([
  "too_many_sentences",
  "too_many_questions",
  "too_many_suggestions",
  "internal_label_leak",
  "breaks_immersion",
  "forbidden_lecture",
  "forbidden_over_explain",
  "forbidden_premature_advice",
  "forbidden_intense_flirt",
  "forbidden_diagnosis",
  "forbidden_aggressive_siding",
  "forbidden_pressure",
  "forbidden_real_world_promise",
])
export type ReplyQualityViolationCodeType = z.infer<typeof ReplyQualityViolationCode>

/** 回复质量守卫结果（文章186，只记录不拦截） */
export const ReplyQualityGuardSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().min(0).max(1),
  sentenceCount: z.number().int().min(0),
  questionCount: z.number().int().min(0),
  adviceCount: z.number().int().min(0),
  violations: z
    .array(
      z.object({
        code: ReplyQualityViolationCode,
        severity: z.enum(["low", "medium", "high"]),
        evidence: z.string().trim().max(160),
      }),
    )
    .max(12),
})
export type ReplyQualityGuard = z.infer<typeof ReplyQualityGuardSchema>
