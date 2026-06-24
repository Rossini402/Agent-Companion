import { Hono } from "hono"
import type { AppEnv } from "./env"
import { agentChatRoutes } from "./routes/agent-chat"

const app = new Hono<AppEnv>()

app.get("/health", (c) => c.json({ ok: true }))

// TODO: 替换为真实鉴权中间件（验证 token → 写入 userId）
app.use("/agent/*", async (c, next) => {
  const userId = c.req.header("x-user-id")
  if (!userId) return c.json({ error: "unauthorized" }, 401)
  c.set("userId", userId)
  await next()
})

app.route("/agent", agentChatRoutes)

export default app
