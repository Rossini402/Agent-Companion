"use client"

import { Trash2, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { useMemories, useUpdateMemory, useDeleteMemory } from "@/lib/queries"
import { Button } from "./ui/button"

export function MemoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: memories, isLoading } = useMemories()
  const update = useUpdateMemory()
  const del = useDeleteMemory()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-[380px] max-w-[90vw] flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <b>记忆库</b>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/5" aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {isLoading ? <p className="text-sm text-neutral-400">加载中…</p> : null}
          {!isLoading && (memories?.length ?? 0) === 0 ? (
            <p className="text-sm text-neutral-400">还没有长期记忆。聊几句、说说你的偏好，我会记下来。</p>
          ) : null}
          {memories?.map((m) => (
            <div key={m.id} className={cn("rounded-lg border border-neutral-200 p-3", m.status === "disabled" && "opacity-50")}>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-500">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5">{m.type}</span>
                <span>重要度</span>
                <select
                  value={m.importance}
                  onChange={(e) => update.mutate({ id: m.id, patch: { importance: Number(e.target.value) } })}
                  className="rounded border border-neutral-300 px-1 py-0.5"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm leading-relaxed">{m.content}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update.mutate({ id: m.id, patch: { status: m.status === "active" ? "disabled" : "active" } })}
                >
                  {m.status === "active" ? "停用" : "启用"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => del.mutate(m.id)}>
                  <Trash2 size={14} />
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
