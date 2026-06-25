"use client"

import { useCallback, useEffect, useState } from "react"
import { API_BASE, AGENT_ID, DEV_USER, DEFAULT_CONVERSATION } from "./api"

export type UIMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  status?: "completed" | "failed"
  streaming?: boolean
  feedback?: { rating: "positive" | "negative" } | null
}

function stripCR(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line
}

function patchLastAssistant(prev: UIMessage[], patch: (m: UIMessage) => UIMessage): UIMessage[] {
  const next = prev.slice()
  const i = next.length - 1
  if (i >= 0 && next[i].role === "assistant") next[i] = patch(next[i])
  return next
}

export function useAgentChat() {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const reload = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`${API_BASE}/agent/conversations/${AGENT_ID}`, {
        headers: { "x-user-id": DEV_USER },
      })
      if (res.ok) {
        const data = (await res.json()) as { messages?: UIMessage[] }
        setMessages(
          (data.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            status: m.status,
            feedback: m.feedback ?? null,
          })),
        )
      }
    } catch {
      /* 历史拉取失败不致命 */
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return
      setSending(true)
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, status: "completed" },
        { role: "assistant", content: "", streaming: true },
      ])
      try {
        const res = await fetch(`${API_BASE}/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": DEV_USER },
          body: JSON.stringify({
            messages: [{ role: "user", content: trimmed }],
            conversation: DEFAULT_CONVERSATION,
          }),
        })
        if (!res.ok || !res.body) throw new Error(`chat ${res.status}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ""
        let evt = ""
        let assistantId: string | undefined
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const raw of lines) {
            const line = stripCR(raw)
            if (line.startsWith("event:")) {
              evt = line.slice(6).trim()
              continue
            }
            if (line.startsWith("data:")) {
              let data = line.slice(5)
              if (data.startsWith(" ")) data = data.slice(1)
              if (evt === "delta") {
                setMessages((prev) => patchLastAssistant(prev, (m) => ({ ...m, content: m.content + data })))
              } else if (evt === "error") {
                setMessages((prev) => patchLastAssistant(prev, (m) => ({ ...m, content: m.content + ` [错误] ${data}` })))
              } else if (evt === "done") {
                try {
                  assistantId = (JSON.parse(data) as { assistantMessageId?: string }).assistantMessageId
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }
        setMessages((prev) =>
          patchLastAssistant(prev, (m) => ({ ...m, streaming: false, status: "completed", id: assistantId })),
        )
      } catch {
        setMessages((prev) =>
          patchLastAssistant(prev, (m) => ({
            ...m,
            streaming: false,
            status: "failed",
            content: m.content || "[发送失败]",
          })),
        )
      } finally {
        setSending(false)
      }
    },
    [sending],
  )

  return { messages, sending, loadingHistory, send, reload, setMessages }
}
