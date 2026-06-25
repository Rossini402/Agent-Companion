"use client"

import { useEffect, useRef, useState } from "react"
import { BookMarked } from "lucide-react"
import { useAgentChat } from "@/lib/useAgentChat"
import { useSubmitFeedback } from "@/lib/queries"
import { DEFAULT_CONVERSATION } from "@/lib/api"
import { MessageBubble } from "./MessageBubble"
import { Composer } from "./Composer"
import { MemoryPanel } from "./MemoryPanel"
import { Button } from "./ui/button"

export function ChatView() {
  const { messages, sending, loadingHistory, send, markFeedback } = useAgentChat()
  const submitFeedback = useSubmitFeedback()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  const handleFeedback = (messageId: string, rating: "positive" | "negative") => {
    markFeedback(messageId, rating) // 乐观更新
    submitFeedback.mutate({ messageId, rating })
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b bg-white px-5 py-3">
        <div>
          <b className="text-base">{DEFAULT_CONVERSATION.name}</b>
          <span className="ml-2 text-xs text-neutral-400">{DEFAULT_CONVERSATION.headline} · DeepSeek 流式</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMemoryOpen(true)}>
          <BookMarked size={16} />
          记忆库
        </Button>
      </header>

      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-5">
        {loadingHistory ? <p className="text-center text-sm text-neutral-400">加载历史…</p> : null}
        {!loadingHistory && messages.length === 0 ? (
          <p className="text-center text-sm text-neutral-400">和 {DEFAULT_CONVERSATION.name} 说点什么吧</p>
        ) : null}
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id ?? `tmp-${i}`}
            message={m}
            onFeedback={m.id ? (rating) => handleFeedback(m.id as string, rating) : undefined}
          />
        ))}
      </div>

      <Composer disabled={sending} onSend={send} />
      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
    </div>
  )
}
