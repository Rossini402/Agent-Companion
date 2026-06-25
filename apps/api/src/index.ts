import { Hono } from "hono"
import { cors } from "hono/cors"
import type { AppEnv } from "./env"
import { agentChatRoutes } from "./routes/agent-chat"
import { TEST_PAGE } from "./test-page"

const app = new Hono<AppEnv>()

app.get("/health", (c) => c.json({ ok: true }))

// 本地 SSE 流式测试页（同源，免 CORS）
app.get("/", (c) => c.html(TEST_PAGE))

// 跨源放行 Next 前端（dev :3000）；置于鉴权之前，让 OPTIONS 预检不被拦
app.use(
  "/agent/*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ],
    allowHeaders: ["Content-Type", "x-user-id"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
)

// TODO: 替换为真实鉴权中间件（验证 token → 写入 userId）
app.use("/agent/*", async (c, next) => {
  const userId = c.req.header("x-user-id")
  if (!userId) return c.json({ error: "unauthorized" }, 401)
  c.set("userId", userId)
  await next()
})

app.route("/agent", agentChatRoutes)

export default app
