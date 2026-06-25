"use client"

import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  useCarePlan,
  useUpdateCarePlan,
  useGenerateCare,
  useCareEvents,
  type CareScene,
  type CareFrequency,
  type CareTone,
} from "@/lib/queries"
import { Button } from "./ui/button"

const SCENES: { v: CareScene; label: string }[] = [
  { v: "morning", label: "早安" },
  { v: "night", label: "晚安" },
  { v: "long_absence", label: "久未出现" },
  { v: "stress_support", label: "压力支持" },
  { v: "relationship_warmup", label: "关系升温" },
  { v: "anniversary", label: "纪念日" },
]

export function CarePanel({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}) {
  const { data: plan } = useCarePlan()
  const update = useUpdateCarePlan()
  const generate = useGenerateCare()
  const { data: events } = useCareEvents()

  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState<CareFrequency>("daily")
  const [preferredTime, setPreferredTime] = useState("21:30")
  const [scenes, setScenes] = useState<CareScene[]>(["long_absence", "night"])
  const [tone, setTone] = useState<CareTone>("gentle")

  useEffect(() => {
    if (plan) {
      setEnabled(plan.enabled)
      setFrequency(plan.frequency)
      setPreferredTime(plan.preferredTime ?? "21:30")
      setScenes(plan.scenes.length ? plan.scenes : ["long_absence", "night"])
      setTone(plan.tone)
    }
  }, [plan])

  if (!open) return null

  const toggleScene = (s: CareScene) =>
    setScenes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  const save = () =>
    update.mutate({ enabled, frequency, preferredTime, scenes: scenes.length ? scenes : ["long_absence"], tone, customPrompt: null })
  const gen = async () => {
    await generate.mutateAsync(scenes[0])
    onGenerated()
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-[380px] max-w-[90vw] flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <b>主动关怀</b>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/5" aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            启用定时关怀（MVP 仅存档，不自动推送）
          </label>

          <div>
            <div className="mb-1 text-neutral-500">频率</div>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as CareFrequency)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            >
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-neutral-500">偏好时间</div>
            <input
              type="time"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1.5"
            />
          </div>

          <div>
            <div className="mb-1 text-neutral-500">场景</div>
            <div className="flex flex-wrap gap-2">
              {SCENES.map((s) => (
                <button
                  key={s.v}
                  onClick={() => toggleScene(s.v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    scenes.includes(s.v) ? "border-brand bg-brand/10 text-brand" : "border-neutral-300 text-neutral-600",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-neutral-500">语气</div>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as CareTone)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            >
              <option value="light">轻松</option>
              <option value="gentle">温柔</option>
              <option value="intimate">亲密</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={update.isPending}>
              保存计划
            </Button>
            <Button variant="outline" onClick={gen} disabled={generate.isPending}>
              <Sparkles size={14} />
              {generate.isPending ? "生成中" : "立即生成一条"}
            </Button>
          </div>
          {plan?.nextRunAtMs ? (
            <p className="text-xs text-neutral-400">下次计划时间：{new Date(plan.nextRunAtMs).toLocaleString("zh-CN")}</p>
          ) : null}

          <div>
            <div className="mb-2 border-t pt-3 text-neutral-500">最近关怀</div>
            <div className="space-y-2">
              {(events ?? []).length === 0 ? <p className="text-xs text-neutral-400">还没有生成过关怀消息</p> : null}
              {events?.map((ev) => (
                <div key={ev.id} className="rounded border border-neutral-200 p-2">
                  <div className="mb-0.5 flex justify-between text-xs text-neutral-400">
                    <span>{ev.scene}</span>
                    <span>{ev.status === "read" ? "已读" : "未读"}</span>
                  </div>
                  <p className="text-sm">{ev.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
