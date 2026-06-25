"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiSend, AGENT_ID } from "./api"

export type MemoryItem = {
  id: string
  type: string
  content: string
  importance: number
  status: "active" | "disabled" | "deleted"
  updatedAtMs: number
}

export function useMemories() {
  return useQuery({
    queryKey: ["memories", AGENT_ID],
    queryFn: async () => {
      const data = await apiGet<{ memories: MemoryItem[] }>(`/agent/memories?agentId=${AGENT_ID}`)
      return data.memories
    },
  })
}

type MemoryPatch = Partial<Pick<MemoryItem, "importance" | "status" | "content" | "type">>

export function useUpdateMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; patch: MemoryPatch }) =>
      apiSend<{ ok: boolean }>("PATCH", `/agent/memories/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories", AGENT_ID] }),
  })
}

export function useDeleteMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>("DELETE", `/agent/memories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories", AGENT_ID] }),
  })
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (args: { messageId: string; rating: "positive" | "negative" }) =>
      apiSend<{ ok: boolean }>("POST", `/agent/messages/${args.messageId}/feedback?agentId=${AGENT_ID}`, {
        rating: args.rating,
      }),
  })
}

// ===== 主动关怀（190） =====

export type CareScene = "morning" | "night" | "long_absence" | "stress_support" | "relationship_warmup" | "anniversary"
export type CareFrequency = "daily" | "weekly" | "custom"
export type CareTone = "light" | "gentle" | "intimate"

export type CarePlan = {
  id: string
  agentId: string
  enabled: boolean
  frequency: CareFrequency
  preferredTime: string | null
  scenes: CareScene[]
  tone: CareTone
  customPrompt: string | null
  nextRunAtMs: number | null
}

export type CareEvent = {
  id: string
  scene: string
  status: "generated" | "read"
  message: string
  generatedAtMs: number
  readAtMs: number | null
}

export function useCarePlan() {
  return useQuery({
    queryKey: ["care-plan", AGENT_ID],
    queryFn: () => apiGet<CarePlan>(`/agent/care/${AGENT_ID}/plan`),
  })
}

export type CarePlanInput = {
  enabled: boolean
  frequency: CareFrequency
  preferredTime: string | null
  scenes: CareScene[]
  tone: CareTone
  customPrompt: string | null
}

export function useUpdateCarePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CarePlanInput) =>
      apiSend<{ ok: boolean; nextRunAtMs: number | null }>("PATCH", `/agent/care/${AGENT_ID}/plan`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care-plan", AGENT_ID] }),
  })
}

export function useGenerateCare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scene?: CareScene) =>
      apiSend<{ eventId: string; message: string }>("POST", `/agent/care/${AGENT_ID}/generate`, scene ? { scene } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care-events", AGENT_ID] }),
  })
}

export function useCareEvents() {
  return useQuery({
    queryKey: ["care-events", AGENT_ID],
    queryFn: async () => (await apiGet<{ events: CareEvent[] }>(`/agent/care/${AGENT_ID}/events`)).events,
  })
}
