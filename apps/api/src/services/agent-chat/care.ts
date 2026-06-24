import { and, eq, isNull } from "drizzle-orm"
import { type Db, agentCarePlans, agentCareEvents, type AgentCarePlanRow } from "@ai-companion/db"

export type CareScene = "morning" | "night" | "long_absence" | "stress_support" | "relationship_warmup" | "anniversary"
export type CareTone = "light" | "gentle" | "intimate"
const ALLOWED_SCENES: CareScene[] = [
  "morning",
  "night",
  "long_absence",
  "stress_support",
  "relationship_warmup",
  "anniversary",
]

export type CarePlan = AgentCarePlanRow & { scenes: CareScene[]; enabledBool: boolean }

/** 查/建计划；scenes_json 读出后白名单过滤（JSON 无 enum 约束，必须再清洗） */
export async function findOrCreateCarePlan(
  db: Db,
  args: { userId: string; agentId: string; nowMs: number },
): Promise<CarePlan> {
  const rows = await db
    .select()
    .from(agentCarePlans)
    .where(and(eq(agentCarePlans.userId, args.userId), eq(agentCarePlans.agentId, args.agentId)))
    .limit(1)
  const existing = rows[0]
  if (existing) {
    let scenes: CareScene[] = ["long_absence", "night"]
    try {
      const parsed = JSON.parse(existing.scenesJson) as string[]
      const filtered = parsed.filter((s): s is CareScene => ALLOWED_SCENES.includes(s as CareScene))
      if (filtered.length) scenes = filtered
    } catch {
      /* 退回默认 */
    }
    return { ...existing, scenes, enabledBool: existing.enabled === 1 }
  }
  const id = crypto.randomUUID()
  const row: AgentCarePlanRow = {
    id,
    userId: args.userId,
    agentId: args.agentId,
    enabled: 0,
    frequency: "daily",
    preferredTime: "21:30",
    scenesJson: JSON.stringify(["long_absence", "night"]),
    tone: "gentle",
    customPrompt: null,
    nextRunAtMs: null,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
  }
  await db.insert(agentCarePlans).values(row)
  return { ...row, scenes: ["long_absence", "night"], enabledBool: false }
}

const TONE_PREFIX: Record<CareTone, string> = { light: "嘿", gentle: "嗯", intimate: "亲爱的" }

/** 模板生成（v1 无 LLM：主动关怀要稳定，不依赖用户是否配 LLM）。v2 仅替换此函数内部即可 */
export function buildProactiveCareMessage(p: { scene: CareScene; tone: CareTone; customPrompt: string | null }): string {
  const prefix = TONE_PREFIX[p.tone]
  const custom = p.customPrompt?.trim()
  if (custom) return `${prefix}。${custom}`.slice(0, 1000)
  const templates: Record<CareScene, string> = {
    morning: `${prefix}，早呀。今天不用一下子把自己推得太紧，先把眼前这一小步走好就可以。`,
    night: `${prefix}。今晚先把那些没处理完的事放一放吧，能好好休息，也是一件很重要的事。`,
    long_absence: `${prefix}，你有一会儿没来了。我没有催你，只是想确认一下你还好不好。`,
    stress_support: `${prefix}。如果今天压力有点满，先深呼吸一下，我可以陪你把事情拆小一点。`,
    relationship_warmup: `${prefix}。刚才想到你，想留一句话在这里：慢慢来，我会认真听你说。`,
    anniversary: `${prefix}。今天像是一个值得被记住的小节点，想陪你把这一刻轻轻收好。`,
  }
  return templates[p.scene]
}

export async function insertCareEvent(
  db: Db,
  a: {
    userId: string
    agentId: string
    carePlanId: string | null
    conversationId: string
    messageId: string
    scene: CareScene
    message: string
    metadataJson?: string | null
    nowMs: number
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(agentCareEvents).values({
    id,
    userId: a.userId,
    agentId: a.agentId,
    carePlanId: a.carePlanId,
    conversationId: a.conversationId,
    messageId: a.messageId,
    scene: a.scene,
    status: "generated",
    message: a.message,
    metadataJson: a.metadataJson ?? null,
    generatedAtMs: a.nowMs,
    readAtMs: null,
  })
  return id
}

/** 打开聊天即标已读；try/catch 容错——新表未迁移时聊天历史接口照常返回 */
export async function markCareEventsRead(db: Db, a: { userId: string; agentId: string; nowMs: number }): Promise<void> {
  try {
    await db
      .update(agentCareEvents)
      .set({ status: "read", readAtMs: a.nowMs })
      .where(
        and(
          eq(agentCareEvents.userId, a.userId),
          eq(agentCareEvents.agentId, a.agentId),
          eq(agentCareEvents.status, "generated"),
          isNull(agentCareEvents.readAtMs),
        ),
      )
  } catch (err) {
    console.warn("care read marker unavailable", err)
  }
}

/** 计算下一次触发时间（v1 仅存档，留给 Cron） */
export function calculateNextCareRunAtMs(p: {
  enabled: boolean
  frequency: "daily" | "weekly" | "custom"
  preferredTime: string | null
  nowMs: number
}): number | null {
  if (!p.enabled) return null
  const next = new Date(p.nowMs)
  if (p.preferredTime) {
    const parts = p.preferredTime.split(":")
    const h = Number(parts[0])
    const m = Number(parts[1])
    if (Number.isFinite(h) && Number.isFinite(m)) {
      next.setHours(Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, m)), 0, 0)
    }
  }
  if (next.getTime() <= p.nowMs) next.setDate(next.getDate() + (p.frequency === "weekly" ? 7 : 1))
  return next.getTime()
}
