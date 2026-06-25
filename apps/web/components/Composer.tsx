"use client"

import { useState, type KeyboardEvent } from "react"
import { Button } from "./ui/button"

export function Composer({ disabled, onSend }: { disabled?: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("")
  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText("")
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <footer className="flex gap-2 border-t bg-white p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
        className="h-11 flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-[15px] outline-none focus:border-brand"
      />
      <Button onClick={submit} disabled={disabled}>
        {disabled ? "回复中" : "发送"}
      </Button>
    </footer>
  )
}
