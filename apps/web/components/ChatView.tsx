"use client"

import { useEffect, useRef } from "react"
import { useAgentChat } from "@/lib/useAgentChat"
import { DEFAULT_CONVERSATION } from "@/lib/api"
import { MessageBubble } from "./MessageBubble"
import { Composer } from "./Composer"

export function ChatView() {
  const { messages, sending, loadingHistory, send } = useAgentChat()
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="border-b bg-white px-5 py-3">
        <b className="text-base">{DEFAULT_CONVERSATION.name}</b>
        <span className="ml-2 text-xs text-neutral-400">{DEFAULT_CONVERSATION.headline} · DeepSeek 流式</span>
      </header>

      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-5">
        {loadingHistory ? <p className="text-center text-sm text-neutral-400">加载历史…</p> : null}
        {!loadingHistory && messages.length === 0 ? (
          <p className="text-center text-sm text-neutral-400">和 {DEFAULT_CONVERSATION.name} 说点什么吧</p>
        ) : null}
        {messages.map((m, i) => (
          <MessageBubble key={m.id ?? `tmp-${i}`} message={m} />
        ))}
      </div>

      <Composer disabled={sending} onSend={send} />
    </div>
  )
}
