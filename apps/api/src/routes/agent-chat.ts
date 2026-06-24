import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { InboxChatRequestSchema, UpdateAgentMemoryRequestSchema } from "@ai-companion/contracts"
import { createDb, agentMemories } from "@ai-companion/db"
import { and, eq } from "drizzle-orm"
import type { AppEnv } from "../env"
import { buildAgentChatMessages } from "../services/agent-chat/build-prompt"
import {
  getOrCreateConversation,
  insertMessage,
  updateConversationAfterMessage,
  listRecentMessages,
  listActiveMemories,
  listMemoriesForManage,
} from "../services/agent-chat/repository"
import { rollSummary } from "../services/agent-chat/summary"
import { extractMemoriesFromTurn, saveExtractedMemories } from "../services/agent-chat/memory-extraction"
import { streamDeepSeekChat } from "../services/llm/deepseek"
import { analyzeConversationUnderstanding } from "../services/agent-chat/understanding"
import { analyzeConversationSafety, buildBoundaryResponse } from "../services/agent-chat/safety"
import { evaluateReplyQuality } from "../services/agent-chat/reply-quality"

const RECENT_MESSAGE_LIMIT = 18
const MEMORY_INJECTION_LIMIT = 8

export const agentChatRoutes = new Hono<AppEnv>()

/**
 * POST /agent/chat —— 阶段 1 主链路（DeepSeek 流式）
 * ①用户消息先落库 → ②③读历史/记忆 → ④组装 prompt → ⑤流式生成
 * → ⑥assistant 落库 → ⑦滚动摘要 → ⑧记忆抽取
 */
agentChatRoutes.post("/chat", async (c) => {
  const userId = c.get("userId")
  const parsed = InboxChatRequestSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)
  }
  const payload = parsed.data
  const agentId = payload.conversation.id
  if (!agentId) return c.json({ error: "missing_agent_id" }, 400)
  if (!c.env.DEEPSEEK_API_KEY) return c.json({ error: "missing_llm_key" }, 500)

  const db = createDb(c.env.DB)
  const nowMs = Date.now()
  const latestUserText = payload.messages.at(-1)?.content?.trim() ?? ""

  const conversation = await getOrCreateConversation(db, { userId, agentId, nowMs })

  // ②③ 先读「此前」历史 + active 长期记忆（必须在写入本轮用户消息之前，
  // 否则本轮消息会同时出现在 history 和 latestUserText，导致 prompt / 摘要重复）
  const history = await listRecentMessages(db, {
    conversationId: conversation.id,
    limit: RECENT_MESSAGE_LIMIT,
  })
  const activeMemories = await listActiveMemories(db, { userId, agentId, limit: MEMORY_INJECTION_LIMIT })

  // 读取 Agent 默认人设（理解链与 prompt 都要用作 guardrails/人设，上移到落库之前）
  const agentRow = await c.env.DB.prepare(
    "SELECT default_prompt FROM user_agent_companions WHERE id = ? AND user_id = ?",
  )
    .bind(agentId, userId)
    .first<{ default_prompt: string | null }>()

  const llmConfig = {
    apiKey: c.env.DEEPSEEK_API_KEY,
    model: payload.llmConfig?.model ?? c.env.DEEPSEEK_MODEL,
    baseUrl: c.env.DEEPSEEK_BASE_URL,
  }

  // ★ 阶段3 S1：安全边界判断（最前，写用户消息之前；失败保守兜底，绝不当 safe）
  const safety = await analyzeConversationSafety({
    config: llmConfig,
    agentName: payload.conversation.name,
    agentGuardrails: agentRow?.default_prompt ?? null,
    activeMemories,
    recentMessages: history,
    userText: latestUserText,
    signal: c.req.raw.signal,
  })
  const boundaryText = buildBoundaryResponse(safety)

  // ★ 阶段2 对话理解链（非短路时才需要；把 safety 接进理解链，顺序 safety→intent→…，全程兜底）
  const understanding = boundaryText
    ? null
    : await analyzeConversationUnderstanding({
        config: llmConfig,
        agentName: payload.conversation.name,
        agentGuardrails: agentRow?.default_prompt ?? null,
        activeMemories,
        recentMessages: history,
        conversationSummary: conversation.summary,
        messageCount: conversation.messageCount,
        userText: latestUserText,
        signal: c.req.raw.signal,
        safety,
      })

  // ① 用户消息落库（短路写 safety；正常写完整 understanding，已含 safety）
  let sourceUserMessageId: string | null = null
  if (latestUserText) {
    sourceUserMessageId = crypto.randomUUID()
    await insertMessage(db, {
      id: sourceUserMessageId,
      conversationId: conversation.id,
      userId,
      agentId,
      role: "user",
      content: latestUserText,
      status: "completed",
      metadataJson: understanding
        ? JSON.stringify(understanding)
        : JSON.stringify({ analysisVersion: "conversation-safety-v1", safety }),
      nowMs,
    })
    await updateConversationAfterMessage(db, {
      conversationId: conversation.id,
      messageCount: conversation.messageCount + 1,
      lastMessageAtMs: nowMs,
      nowMs,
    })
  }

  // ④ 组装 prompt（注入安全 + 阶段2 理解链结果；短路分支不用）
  const promptMessages = understanding
    ? buildAgentChatMessages({
        agentDefaultPrompt: agentRow?.default_prompt ?? null,
        activeMemories,
        summary: conversation.summary,
        conversation: payload.conversation,
        history,
        latestUserText,
        understanding,
      })
    : []

  // ⑤ 流式生成 → 边吐边写 SSE，结束后做后处理
  return streamSSE(c, async (sse) => {
    // ★ 阶段3 前置短路：refuse / crisis_support 不进 DeepSeek，直接返回预设安全回复
    if (boundaryText) {
      await sse.writeSSE({ event: "delta", data: boundaryText })
      const sId = crypto.randomUUID()
      const sMs = Date.now()
      const sGuard = evaluateReplyQuality({ assistantText: boundaryText, replyPolicy: null })
      await insertMessage(db, {
        id: sId,
        conversationId: conversation.id,
        userId,
        agentId,
        role: "assistant",
        content: boundaryText,
        status: "completed",
        metadataJson: JSON.stringify({ boundaryShortCircuit: true, safety, guard: sGuard }),
        nowMs: sMs,
      })
      await updateConversationAfterMessage(db, {
        conversationId: conversation.id,
        summary: conversation.summary,
        messageCount: conversation.messageCount + (latestUserText ? 2 : 1),
        lastMessageAtMs: sMs,
        nowMs: sMs,
      })
      await sse.writeSSE({
        event: "done",
        data: JSON.stringify({ conversationId: conversation.id, assistantMessageId: sId, status: "completed" }),
      })
      return
    }

    let assistantText = ""
    let failed = false
    try {
      for await (const delta of streamDeepSeekChat(llmConfig, promptMessages, {
        temperature: payload.llmConfig?.temperature,
        signal: c.req.raw.signal,
      })) {
        assistantText += delta
        await sse.writeSSE({ event: "delta", data: delta })
      }
    } catch (err) {
      failed = true
      console.error("deepseek stream failed", err)
      await sse.writeSSE({ event: "error", data: String(err instanceof Error ? err.message : err) })
    }

    // ⑥ assistant 落库 + Q1 回复质量守卫（只记录不拦截；metadata 合并 safety + guard）
    const assistantMessageId = crypto.randomUUID()
    const afterMs = Date.now()
    const guard = evaluateReplyQuality({ assistantText, replyPolicy: understanding?.replyPolicy ?? null })
    await insertMessage(db, {
      id: assistantMessageId,
      conversationId: conversation.id,
      userId,
      agentId,
      role: "assistant",
      content: assistantText,
      status: failed ? "failed" : "completed",
      metadataJson: JSON.stringify({
        model: llmConfig.model,
        promptMessageCount: promptMessages.length,
        injectedMemories: activeMemories.length,
        boundaryShortCircuit: false,
        safety,
        guard,
      }),
      nowMs: afterMs,
    })

    if (!failed) {
      // ⑦ 滚动摘要 + 会话状态
      const summary = rollSummary({
        previousSummary: conversation.summary,
        latestUserText,
        assistantText,
      })
      await updateConversationAfterMessage(db, {
        conversationId: conversation.id,
        summary,
        messageCount: conversation.messageCount + (latestUserText ? 2 : 1),
        lastMessageAtMs: afterMs,
        nowMs: afterMs,
      })

      // ⑧ 长期记忆抽取（★ 阶段3 safety 闸门：allowMemoryExtraction=false 时跳过）
      if (safety.allowMemoryExtraction) {
        try {
          const extracted = await extractMemoriesFromTurn({ userText: latestUserText, assistantText })
          await saveExtractedMemories(db, {
            userId,
            agentId,
            sourceMessageId: sourceUserMessageId,
            memories: extracted,
            nowMs: Date.now(),
          })
        } catch (err) {
          console.error("memory extraction failed", err)
        }
      }
    }

    // 收尾事件：告知前端最终消息 id 与状态
    await sse.writeSSE({
      event: "done",
      data: JSON.stringify({ conversationId: conversation.id, assistantMessageId, status: failed ? "failed" : "completed" }),
    })
  })
})

/** GET /agent/memories?agentId= —— 记忆库列表 */
agentChatRoutes.get("/memories", async (c) => {
  const userId = c.get("userId")
  const agentId = c.req.query("agentId")
  if (!agentId) return c.json({ error: "missing_agent_id" }, 400)
  const db = createDb(c.env.DB)
  const rows = await listMemoriesForManage(db, { userId, agentId })
  return c.json({ agentId, memories: rows })
})

/** PATCH /agent/memories/:id —— 改 type/content/importance/status */
agentChatRoutes.patch("/memories/:id", async (c) => {
  const userId = c.get("userId")
  const id = c.req.param("id")
  const parsed = UpdateAgentMemoryRequestSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)

  const db = createDb(c.env.DB)
  await db
    .update(agentMemories)
    .set({ ...parsed.data, updatedAtMs: Date.now() })
    .where(and(eq(agentMemories.id, id), eq(agentMemories.userId, userId)))
  return c.json({ ok: true })
})

/** DELETE /agent/memories/:id —— 软删除（status='deleted'） */
agentChatRoutes.delete("/memories/:id", async (c) => {
  const userId = c.get("userId")
  const id = c.req.param("id")
  const db = createDb(c.env.DB)
  await db
    .update(agentMemories)
    .set({ status: "deleted", updatedAtMs: Date.now() })
    .where(and(eq(agentMemories.id, id), eq(agentMemories.userId, userId)))
  return c.json({ ok: true })
})
