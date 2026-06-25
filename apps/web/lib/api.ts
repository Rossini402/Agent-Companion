export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787"
export const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER ?? "test-user"
export const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? "test-agent"

/** 占位鉴权头（真实认证前） */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "x-user-id": DEV_USER, ...(extra ?? {}) }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}`)
  return res.json() as Promise<T>
}

/** 聊天对象静态资料（占位；真实项目从 Agent 资产读取） */
export const DEFAULT_CONVERSATION = {
  id: AGENT_ID,
  name: "小雨",
  handle: "@xiaoyu",
  headline: "日常陪伴",
  lastActive: "刚刚",
  status: "在线",
  relationship: "comfortable_chat",
  topic: "职业",
  chemistry: "72",
  chemistryLabel: "心动",
  rhythm: "自然",
  profileNote: "温柔体贴的陪伴助手",
}
