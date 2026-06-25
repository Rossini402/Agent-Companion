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
