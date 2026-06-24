import { z } from "zod"

/** 长期记忆类型（不锁枚举，给 v1 留弹性；用长度约束兜底） */
export const AgentMemoryTypeSchema = z.string().min(1).max(80)

/** 长期记忆（记忆库页面展示用，含来源消息追溯） */
export const AgentMemorySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  type: AgentMemoryTypeSchema,
  content: z.string().min(1).max(2000),
  importance: z.number().int().min(1).max(5),
  status: z.enum(["active", "disabled", "deleted"]),
  sourceMessageId: z.string().nullable(),
  sourceMessage: z
    .object({
      id: z.string().min(1),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdAtMs: z.number().int().nonnegative(),
    })
    .nullable(),
  createdAtMs: z.number().int().nonnegative(),
  updatedAtMs: z.number().int().nonnegative(),
})
export type AgentMemory = z.infer<typeof AgentMemorySchema>

/** 用户只能改 type/content/importance/status，不能改归属与来源 */
export const UpdateAgentMemoryRequestSchema = z.object({
  type: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  status: z.enum(["active", "disabled"]).optional(),
})
export type UpdateAgentMemoryRequest = z.infer<typeof UpdateAgentMemoryRequestSchema>

export const ListAgentMemoriesResponseSchema = z.object({
  agentId: z.string().min(1),
  memories: z.array(AgentMemorySchema),
})
export type ListAgentMemoriesResponse = z.infer<typeof ListAgentMemoriesResponseSchema>
