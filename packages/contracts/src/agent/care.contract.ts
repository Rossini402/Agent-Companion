import { z } from "zod"

/** 主动关怀场景（文章190） */
export const AgentCareSceneSchema = z.enum([
  "morning",
  "night",
  "long_absence",
  "stress_support",
  "relationship_warmup",
  "anniversary",
])
export type AgentCareScene = z.infer<typeof AgentCareSceneSchema>

export const AgentCareFrequencySchema = z.enum(["daily", "weekly", "custom"])
export const AgentCareToneSchema = z.enum(["light", "gentle", "intimate"])

export const AgentCarePlanSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  enabled: z.boolean(),
  frequency: AgentCareFrequencySchema,
  preferredTime: z.string().max(20).nullable(),
  scenes: z.array(AgentCareSceneSchema).min(1).max(6),
  tone: AgentCareToneSchema,
  customPrompt: z.string().max(800).nullable(),
  nextRunAtMs: z.number().int().nonnegative().nullable(),
  createdAtMs: z.number().int().nonnegative(),
  updatedAtMs: z.number().int().nonnegative(),
})
export type AgentCarePlan = z.infer<typeof AgentCarePlanSchema>

export const UpsertAgentCarePlanRequestSchema = z.object({
  enabled: z.boolean(),
  frequency: AgentCareFrequencySchema,
  preferredTime: z.string().trim().max(20).optional().nullable(),
  scenes: z.array(AgentCareSceneSchema).min(1).max(6),
  tone: AgentCareToneSchema,
  customPrompt: z.string().trim().max(800).optional().nullable(),
})
export type UpsertAgentCarePlanRequest = z.infer<typeof UpsertAgentCarePlanRequestSchema>

export const GenerateAgentCareEventRequestSchema = z.object({
  scene: AgentCareSceneSchema.optional(),
})
export type GenerateAgentCareEventRequest = z.infer<typeof GenerateAgentCareEventRequestSchema>

export const AgentCareEventSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  scene: AgentCareSceneSchema,
  status: z.enum(["generated", "read"]),
  message: z.string(),
  generatedAtMs: z.number().int().nonnegative(),
  readAtMs: z.number().int().nonnegative().nullable(),
})
export type AgentCareEvent = z.infer<typeof AgentCareEventSchema>
