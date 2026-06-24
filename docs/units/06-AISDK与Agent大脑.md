# 单元6 · Vercel AI SDK 与 Agent 大脑

## AI SDK 基础

> 子主题覆盖文章 116-136，对应 Vercel AI SDK 从「定位/架构」到「核心能力」「前端集成」「后端集成」「生态协同」「端到端实战」的完整链路。本笔记面向「已会 LLM/LangChain 基础、要在 AI-Companion 项目落地」的工程师。

### 单元地图（先建立心智模型）
- **定位与选型**（116, 119）：AI SDK 是「前端↔后端的 AI 胶水层」，与 LangChain 分层互补。
- **架构与协议**（117, 120, 122）：三层（Provider/Core/UI）+ 两协议（LanguageModelV2、UIMessageStream），两套消息（UIMessage/ModelMessage）。
- **Core 核心能力**（118, 121, 122, 123, 124, 125）：`generateText/streamText`、`generateObject/streamObject`、`tool`、`stopWhen` Agent 循环、Prompt 工程。
- **前端集成**（126, 127, 128, 129）：`useChat`/`useObject`/`ai/rsc` + UI Parts 分片渲染。
- **后端工程化**（130, 131, 132）：Hono on Workers、中间件（缓存/限流/Fallback）、可观测性。
- **生态协同**（133, 134, 135）：MCP 客户端/服务端、与 LangChain/LangGraph 桥接。
- **实战**（136）：把端到端 AI Chat 用 AI SDK 重构落地。

---

## 核心概念：每条一句话讲清

- **Vercel AI SDK**：面向 TS/React 生态的 AI 应用工具链，提供「模型调用→前端 UI」的端到端统一协议，让前端工程师少写胶水代码（文章116）。
- **三层架构**：Provider（抹平各家模型 API 差异）、Core（统一调用能力）、UI（React Hook），靠两个协议串联（文章117）。
- **LanguageModelV2 协议**：每个 Provider 必须实现的接口（`doGenerate`/`doStream`），Core 不关心你接的是哪家模型；AI SDK 5.x = v2（文章117）。
- **UIMessageStream 协议**：建在 SSE 之上的结构化事件流（`text-delta`/`reasoning`/`tool-*`/`source`/`file`/`data-*`），后端 `toUIMessageStreamResponse()` 产出、前端 `useChat` 消费（文章117,122）。
- **UIMessage vs ModelMessage**：前者服务前端渲染（`parts` 数组，含 state/metadata），后者服务 LLM 调用（贴近 OpenAI Chat API，多一个 `tool` 角色），靠 `convertToModelMessages` 转换（文章120）。
- **generateText / streamText**：非流式一次拿完整文本 / 流式逐 token；后者同步返回 `result`，流挂在 `textStream`/`fullStream` 上（文章118,122）。
- **generateObject / streamObject**：用 Zod schema 约束 LLM 输出结构化对象 / 流式逐字段填充 UI（文章123,128）。
- **tool()**：`description`（指导 LLM 何时调）+ `inputSchema`（Zod）+ `execute`（异步执行），塞进 `tools` 对象给 `streamText`（文章124）。
- **stopWhen + Agent 循环**：一个参数把「单次调用」升级成「执行→观察→再决策」的多步 Agent，无需手写 while 循环（文章125）。
- **useChat**：手写 `useStreamChat` 的工业版，核心返回 `messages`/`sendMessage`/`status`，内置四态状态机（ready/submitted/streaming/error）（文章126）。
- **UI Message Parts**：一条消息是 part 数组，按 `type` 分发渲染（text/reasoning/tool-*/source/file/data-*/step-start）（文章127）。
- **useObject**：把 `streamObject` 变 React Hook，返回流式填充的 `DeepPartial<T>`，适合评分卡/报告/表单预填等结构化流式 UI（文章128）。
- **ai/rsc**：让 LLM 直接 stream 出 React Server Component 树（Generative UI），本项目不用但需识别其适用场景（文章129）。
- **wrapLanguageModel + 中间件**：在模型层挂插拔逻辑（缓存/限流/重试/Fallback/默认参数），包出的新 model 仍是标准 `LanguageModelV2`（文章131）。
- **experimental_telemetry**：每次调用的标准埋点入口，产出含 token/model/prompt 版本/工具链的 OpenTelemetry trace（文章132）。
- **MCP（Model Context Protocol）**：让「工具」像 REST API 一样标准接入，`experimental_createMCPClient` 消费、`@cloudflare/mcp-agent` 自建（文章133,134）。
- **协同模式 C**：LangGraph 做后端管线编排，AI SDK 做胶水和前端，靠桥接层缝合（文章135）。

---

## 设计决策与"为什么"

- **为什么单独切出 Provider 层**：否则 `streamText` 内部会变成一坨 `if(model==='openai')` 的分支，生态无法扩展。独立后任意模型只要实现 `LanguageModelV2`，Core 一行不改，换 Provider 只动 `import` + `model` 两行（文章117,118）。
- **为什么两套消息模型不合并**：UIMessage 关心「怎么分段渲染」（文本/思考/工具/引用各有 UI），ModelMessage 关心「怎么准确表达对话语义喂给 LLM」。一条 assistant UIMessage（含 reasoning+tool+text）在 ModelMessage 里会被展平成 assistant(tool-call)+tool(result)+assistant 多条。强行合并两头别扭（文章120）。
- **为什么 system 推荐用参数而非消息**：各家 Provider 对 system 处理不同（OpenAI 当 messages[0]、Anthropic 独立字段、Gemini 用 systemInstruction），SDK 用 `system` 参数帮你抹平；且语义更清晰、便于集中管理（文章121）。
- **prompt 是 messages 的语法糖**：`{system,prompt}` 等价于 `{messages:[{role:'system'},{role:'user'}]}`，二者互斥；多轮或带 tool 必须用 messages（文章121）。
- **为什么 streamObject 用 toTextStreamResponse 而非 UIMessageStream**：`streamObject` 协议是纯 JSON 片段流，和对话型的 UIMessageStream 不同，前端配 `useObject` 消费（文章128）。
- **stopWhen 的核心价值是「防死循环」**：LLM 会陷入「调工具→不满意→再调」死循环，`stepCountIs(N)` 是硬保险；简单任务 3 步、中等 5-7、复杂 10+（文章125）。
- **为什么本项目用模式 C 而非纯 AI SDK**：伴侣需要情绪状态机（5态）、混合记忆（6类）、多步管线、HITL——这些是 LangGraph 的地盘；而前端流式 UI + 思考态指示只有 AI SDK 有现成协议。A→C 是非破坏性升级，A→B 不是，所以早期可从 A 起步（文章116,135）。
- **为什么 Workers 上 onFinish 必须配 ctx.waitUntil**：Workers 请求返回后实例可能立刻被回收，`onFinish` 里裸 await 的写库/埋点会被中途杀掉——典型坑：本地正常、线上偶发「消息没落库」查不到原因（文章122,130）。
- **为什么中间件数组越靠前越外层**：cache 要靠外（尽早命中返回）、rate limit 放 cache 之后（命中缓存不占额度）。顺序错会导致缓存不生效或限流误判（文章131）。
- **为什么 Provider 基线集中到 shared/models.ts**：让每篇示例焦点不被 Provider 选择干扰，且支持无损切换（OpenAI→Workers AI），符合「早期不纠结 Provider、后期无损换」原则（文章119）。
- **为什么 MCP 工具用工厂函数 + dynamic-tool**：MCP 工具运行时才确定，前端编译期不知道 toolName，故 part type 是 `dynamic-tool`；自家工具有确定 type 做定制 UI，MCP 工具走通用 JSON 展示（文章133）。
- **Dogfooding：自家后端也走自家 MCP**：保证内部调用和第三方调用同一代码路径/认证/埋点，不用维护「内部版/外部版」两套；代价是多一跳 HTTP（Workers 上 <10ms 可接受）（文章134）。

---

## 关键代码/片段

**1. 最小后端 + 前端（文章116,126）**
```ts
// 后端 Hono
import { Hono } from 'hono'
import { streamText, convertToModelMessages } from 'ai'
const app = new Hono()
app.post('/api/chat', async (c) => {
  const { messages } = await c.req.json()
  const result = streamText({ model: models.chat, messages: convertToModelMessages(messages) })
  return result.toUIMessageStreamResponse()
})
```
```tsx
// 前端
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
const { messages, sendMessage, status, stop } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})
```

**2. 三种流消费方式（文章118,122）**
```ts
// 纯字符串（只能消费一次）
for await (const chunk of result.textStream) process.stdout.write(chunk)
// 细粒度事件
for await (const part of result.fullStream) {
  if (part.type === 'text-delta') { /* part.delta */ }
  if (part.type === 'tool-call')  { /* part.toolName, part.input */ }
  if (part.type === 'finish')     { /* part.finishReason, part.usage */ }
}
// 给前端
return result.toUIMessageStreamResponse()
```

**3. 注入系统提示 + 消息转换（文章120）**
```ts
const modelMsgs: ModelMessage[] = [
  { role: 'system', content: buildSystemPrompt(userProfile) },
  ...convertToModelMessages(messages),
]
const result = streamText({ model: models.chat, messages: modelMsgs, tools })
return result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) =>
    part.type === 'finish' ? { sessionId: id, intimacy: userProfile.intimacy } : undefined,
})
```

**4. generateObject 结构化输出（文章123）**
```ts
import { generateObject } from 'ai'; import { z } from 'zod'
const EmotionSchema = z.object({
  primary: z.enum(['happy','sad','angry','calm','neutral']),
  intensity: z.number().min(0).max(1),
  reason: z.string().describe('一句话解释为什么做出这个判断'), // describe 嵌入 JSON Schema，质量+30%
})
const { object } = await generateObject({ model: models.structured, schema: EmotionSchema, prompt: '...' })
```

**5. tool 定义 + Agent 循环（文章124,125）**
```ts
import { streamText, tool, stepCountIs } from 'ai'; import { z } from 'zod'
const searchMemory = tool({
  description: '从长期记忆库检索相关回忆',
  inputSchema: z.object({ query: z.string(), topK: z.number().int().min(1).max(10).default(3) }),
  execute: async ({ query, topK }) => { /* ... */ },
})
const result = streamText({
  model: models.chat, messages, tools: { searchMemory },
  stopWhen: stepCountIs(5),  // 多步循环上限，防死循环
})
```

**6. data part 注入业务数据（文章122）**
```ts
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    writer.write({ type: 'data-emotion', data: { primary: 'calm', intensity: 0.6 } })
    const result = streamText({ model: models.chat, messages })
    writer.merge(result.toUIMessageStream())
    writer.write({ type: 'data-memories-used', data: { count: 3 } })
  },
})
return createUIMessageStreamResponse({ stream })
```

**7. UI Parts 分发渲染（文章127）**
```tsx
function Part({ part }: { part: UIMessage['parts'][number] }) {
  switch (part.type) {
    case 'text':      return <TextPart part={part} />       // Markdown + 流式光标
    case 'reasoning': return <ReasoningPart part={part} />  // <details> 流式展开/完成折叠
    case 'data-emotion': return <EmotionBadge data={part.data} />
    default:
      if (part.type.startsWith('tool-')) return <ToolPart part={part} />
      if (part.type === 'dynamic-tool')  return <DynamicToolPart part={part} /> // MCP 工具
      return null
  }
}
```

**8. Workers 上的 streamText 全套（文章130,136）**
```ts
const result = streamText({
  model, system,
  messages: convertToModelMessages(messages),
  tools: createCompanionTools(c.env, sessionId),
  stopWhen: stepCountIs(5),
  abortSignal: c.req.raw.signal,                 // 端到端中止
  onFinish: ({ text, usage }) => {
    c.executionCtx.waitUntil(saveMessage(c.env.DB, sessionId, text)) // 必须 waitUntil
  },
})
return result.toUIMessageStreamResponse()
```

**9. wrapLanguageModel 中间件栈（文章131）**
```ts
const model = wrapLanguageModel({
  model: primary,
  middleware: [             // 越靠前越外层
    rateLimitMiddleware({ kv, keyFn: () => userId, limit: 120, windowSec: 60 }),
    retryMiddleware(2),
    fallbackMiddleware(openai('gpt-4o-mini')),
    defaultSettingsMiddleware({ settings: { temperature: 0.7 } }),
  ],
})
```

**10. MCP 客户端消费 + 合并工具（文章133）**
```ts
import { experimental_createMCPClient as createMCPClient } from 'ai'
const client = await createMCPClient({ transport })
const mcpTools = await client.tools()
const result = streamText({
  model, messages,
  tools: { ...companionTools, ...prefixTools(mcpTools, 'fs') }, // 加前缀防命名冲突
  onFinish: () => c.executionCtx.waitUntil(client.close()),     // 流结束后才关
})
```

---

## 踩坑点

- **textStream/fullStream 只能消费一次**：消费完即耗尽，要复用得自己缓存；想同时拿文本和 usage 用 `fullStream` 或先消费再 `await result.text`（文章118,122）。
- **prompt 与 messages 不能同时传**：互斥，会报错；有 tool 调用必须用 messages（tool 角色只能出现在 messages）（文章121）。
- **Workers 上 onFinish/onAbort 的 await 必须放 ctx.waitUntil**：否则副作用被提前杀，表现为「本地正常、线上偶发丢数据」（文章122,130）。
- **无参工具也要 `z.object({})`**：不能用 `z.null()` 或省略 inputSchema，协议要求 schema 必须是 object（文章124）。
- **流式 Fallback 的半截流**：主 model 已 emit 前半段再挂，切 fallback 会从头重来，用户看到「文字闪一下重写」；解决：只对前几个 chunk 做 fallback，或业务层保留已生成文字（文章131）。
- **Cache key 要把 tools 指纹算进去**：相同 prompt 但 tools 不同结果差很多，否则缓存命中错误结果（文章131）。
- **中间件不要吞错误**：除非是明确的降级（Fallback），try/catch 返回假结果会让上层完全不知情（文章131）。
- **useObject 返回 DeepPartial 必须防御式判空**：字段全 optional，数组可能 undefined、元素可能只完成一半；用 `?.` / `!= null` 层层保护，别假设字段到位（文章128）。
- **convertToModelMessages 默认忽略 data-* part**：业务 data part（如 data-emotion）不会喂给 LLM；想注入 system prompt 需自己写转换（文章120）。
- **schema 嵌套不要超 3 层**：超过模型出错率明显上升，拆成多次 generateObject 或用 streamObject（文章123）。
- **MCP client.close() 必须在流结束后**：中途关掉会导致 tool 执行失败；放 `onFinish + ctx.waitUntil` 最安全；Web 服务每请求独立连接、勿全局共享（文章133）。
- **MCP userId 不要作为工具参数**：身份类参数交给认证层（`this.ctx.userId`），LLM 无法伪造（文章134）。
- **每次请求默认发整个会话历史**：长会话越来越重，用 `prepareSendMessagesRequest` 实现「只发最新一条 + 后端从 D1 加载历史」（文章120,126）。
- **AI SDK v5 与 v4 差异**：v5 的 `useChat` 不再管 input 状态（自己用 useState）；协议从 LanguageModelV1 升到 v2，部分社区 Provider 需跟进（文章117,126）。
- **Workers 限制**：默认 50ms CPU（Free），onChunk 里只做轻量统计、重计算放 onFinish；同实例 6 个 subrequest（Free），tool 内并行 fetch 要自己限流（文章130）。

---

## 与本项目(AI-Companion)的关联 + 下一步动手建议

**关联（本项目就是这套体系的「实战甲方」）：**
- 项目走**模式 C**：LangGraph 编排情绪状态机/混合记忆/HITL，末端 LLM 节点用 `streamText + stopWhen` 做 tool 调用，前端 `useChat` + UI Parts（文章116,135）。
- 后端真实部署目标是 **Cloudflare Workers**，主力 Provider 用 Workers AI、回退用 OpenAI（`buildCompanionModel` 中间件栈）（文章119,130,131）。
- 伴侣专属 data part：`data-emotion`（情绪标签）、`data-memories-used`（记忆命中数）、`data-intimacy-delta`（亲密度变化）；tool：`searchMemory`/`updateEmotion`/`checkIntimacy`（文章122,124,127）。
- Prompt 走**代码版本化**路线（`packages/prompts` 独立包 + 版本号 + telemetry 埋点），后期可接 Langfuse（文章121,132）。
- `useObject` 用在非对话式结构化场景：每周情感报告、关系画像、纪念卡片、Profile 预填（文章128）。
- 自建 MCP Server 发布「记忆检索/情绪轨迹/关系画像」给 Claude Desktop 等第三方消费（文章134）。

**下一步动手建议（从易到难）：**
1. **先搭沙盒**（文章118）：`pnpm add ai @ai-sdk/openai zod tsx`，用 `--env-file=.env` 跑通 `generateText` → 改 `streamText` 看逐 token → 用 `fullStream` 看事件流。无 OpenAI key 可换 OpenRouter。
2. **建 Provider 基线**：照 `shared/models.ts` 模式集中管理 `chat/chatPro/reasoning/structured`，并写好 `getWorkersAIModels(binding)`，为后期切 Workers AI 做无损准备（文章119）。
3. **落地消息约定**：实现「前端只发最新一条 + 后端从 D1 加载历史」的 `prepareSendMessagesRequest` + 后端拼 system prompt + `convertToModelMessages`（文章120,126）。
4. **跑通 Workers 端**：照文章130 配 `wrangler.jsonc`（nodejs_compat、AI/DB/KV/Vectorize binding），把 `onFinish` 持久化全部包进 `ctx.waitUntil`，用 `wrangler dev --remote` 验证最接近生产。
5. **接情绪分类**：用 `generateObject` + `EmotionSchema`（带 `.describe()`、enum、optional），作为 LangGraph 的 emotionClassifier 节点（文章123,135）。
6. **建中间件栈**：rate limit + retry + fallback + telemetry，尽早接 Langfuse（哪怕最粗糙的接入也比不接强百倍），监控 Fallback 触发率（>5% 排查）和长尾消耗用户（文章131,132）。
7. **桥接 LangGraph**：实现三个桥接函数（LangGraph event→UIMessageStream、tool.execute 内用 LangChain Retriever、UIMessage↔BaseMessage），参照文章135 的 `runCompanionPipeline` 骨架，在 `llm` 节点用 `writer.merge(result.toUIMessageStream())` 合流。
8. **重构端到端**：以文章136 的 monorepo 结构（shared/api/web）为蓝本，把现有手写 SSE 版 AI Chat 替换为 AI SDK 版，验证类型安全 + 流式 + 工具可视化 + Workers 部署全链路。


## 项目脚手架与认证链路

> 精读范围：137-175（重点 141、144-146、148-160 认证、170 DeepSeek、173 LLM 配置化）。本子主题覆盖「monorepo 三子站起步 → 前后端共享契约 → 环境变量与请求层 → JWT + refresh token 认证全链路 → LLM 接通与配置化」。技术栈：Turborepo + pnpm catalog + Next.js(web/admin) + Hono(api, Cloudflare Worker) + D1 + Drizzle + jose + TanStack Query。

---

## 核心概念：每条一句话讲清

- **三子站 monorepo**：`apps/web`(用户端 Next)、`apps/admin`(后台 Next)、`apps/api`(Hono on Cloudflare Worker)，加 `packages/ui`、`packages/contracts` 共享包（文章137）。
- **pnpm catalog**：在 `pnpm-workspace.yaml` 集中声明公共依赖版本，各包用 `"react": "catalog:"` 引用，升级只改一处（文章137）。
- **共享 UI 走源码导出**：`@repo/ui` 直接导出 TSX，不预编译；每个前端应用各自跑 Tailwind 编译，用 `@source` 把共享包源码纳入扫描（文章138、139）。
- **设计令牌三层**：基础令牌(色阶/字号/圆角/阴影) → 语义令牌(surface/content/border/brand/state) → 组件约束(Button/Card/Input)，全部写进 `theme.css` 的 `@theme`（文章140）。
- **Hono RPC 类型共享**：API 侧 `export type AppType = typeof routes`，前端 `hc<AppType>()` 直接拿到 route 的参数与返回值类型推导（文章141）。
- **统一响应 envelope**：所有接口返回 `ApiSuccess<T>` 或 `ApiFailure`，固定带 `ok / data|error / meta(requestId+timestamp)`，并用 `buildSuccess/buildFailure` 拼装（文章141、144）。
- **双层环境变量边界**：服务端读 `process.env.X`(Next)/`c.env.X`(Worker)，客户端只能读 `NEXT_PUBLIC_*`（编译期内联），各端用 zod 校验一次（文章142）。
- **zValidator**：用 `@hono/zod-validator` 替代手写 `safeParse`，并通过自定义失败回调保持项目既有 failure 结构（文章143）。
- **API 按域拆 route + contract 按域拆**：`routes/<domain>/*.route.ts` 与 `contracts/src/<domain>/*.contract.ts` 一一对应；web 侧页面/`api.ts`/`http` 分层（文章144、145）。
- **统一 http 模块**：单入口封装 baseURL 解析(服务端/客户端自动判定)、query/body 序列化、异常兜底成 `ApiResponse`，页面只关心调哪个接口（文章145）。
- **TanStack Query 管客户端状态**：在 `http` 之上叠加，负责 loading/error/缓存/失效重拉；`QueryClient` 必须在 client provider 里用 `useState` 创建（文章146）。
- **uuidv7**：高位时间戳 + 低位随机，分布式可本地生成、索引插入接近顺序追加，作认证系统主键（user/session/refresh_token id）（文章147）。
- **事务**：把「一组必须一起成败」的多步写操作打包，Drizzle 用 `db.transaction(async (tx) => {...})`，回调正常返回即提交、抛错即回滚（文章148）。
- **session**：服务端对「一次登录状态」的记录（非用户、非 token），是 access/refresh token 的归属锚点，支持单设备下线（文章149、150）。
- **access vs refresh token**：access 短期无状态(JWS)、随业务请求高频传输；refresh 长期有状态、必须落库存 hash、只出现在刷新链路、每次刷新 rotation（文章150、155）。
- **客户端 token 方案**：access token 放内存、refresh token 放 `httpOnly cookie`；页面刷新靠 refresh 恢复；401 时做 refresh 合并(`refreshOnce`)（文章151）。
- **认证架构分工(Cloudflare)**：D1 存认证主数据、Worker Secrets 存密钥配置、JWT 承载短期 access、refresh 落库、Durable Objects 做高并发串行控制(可选)、KV/R2 不做认证真相源（文章152）。
- **认证数据库拆分原则**：用户主体/登录方式/子站策略/角色权限/会话与 refresh token 各自独立成表（文章153）。
- **认证接口分层**：`/auth/admin/*` 与 `/auth/web/*` 管登录链路、`/account/*` 管登录后账号管理；OAuth 登录与 OAuth 绑定分家（文章154）。
- **token 签发算法**：access 走 JWS(签名防篡改)，refresh 走「随机串 + SHA-256 hash 存库」，jose 管 JWT、Web Crypto 管随机数/哈希；HS256(对称)/RS256/ES256(非对称) 按服务拓扑选（文章155）。
- **本地 D1 + migration/seed**：本地通过 Wrangler 提供 D1 binding 与 SQLite 文件；migration 定结构+系统基础配置(可进生产)，dev seed 喂测试账号(不进生产)（文章156、157）。
- **service 用例层**：route 变薄(收参/调 service/回响应)，每个完整用例(login/refresh/logout)一个 service 文件，下层 repository/jwt/password 兜底（文章158、162-165）。
- **tsconfig 别名**：Hono+Wrangler 运行链短，只配 `tsconfig.json` 的 `paths`(`@/*`→`./src/*`)即可，无需再配 bundler 别名（文章159）。
- **无感刷新**：先用旧 access token 试探，只在「access token 失效」这一具体信号下才 refresh；admin 在 middleware 改写 cookie，web 在 http 模块带 token+失败重试（文章164、169）。
- **接通 DeepSeek**：DeepSeek 走 OpenAI-compatible endpoint，API 子站用 LangChain `ChatOpenAI`(只改 baseURL) + `model.stream`，转成 `text/plain` 流配合前端 `TextStreamChatTransport`（文章170）。
- **LLM 配置化**：用户在浏览器 `localStorage` 存 OpenAI-compatible 配置(不落库)，聊天请求级临时带 `llmConfig`；后端「用户配置优先，平台 DeepSeek 兜底」（文章173）。

---

## 设计决策与"为什么"：关键取舍及理由

- **为什么 monorepo + 三子站而不是单 Next**：web/admin 权限边界与登录方式不同、api 独立部署到 Worker；共享 `contracts`/`ui` 让类型与组件不分裂。代价是 catalog/transpilePackages/端口冲突等配置成本（文章137）。
- **为什么共享 UI 源码导出而非预编译**：把实现权交还应用、改样式/交互直接改源码；代价是每个应用必须各自配 Tailwind 编译并显式 `@source` 扫描共享包，否则类名丢失（文章138、139）。
- **为什么不一开始上 Dialog/Popover 等重组件**：一旦引入会牵出主题变量、客户端边界、Portal、焦点管理、可访问性，复杂度骤升；先把 Button/Card/Input/cva/cn/Radix 链路跑通更值（文章139）。
- **为什么响应分两层语义(HTTP status + error.code)**：传输层结果与业务语义解耦，前端依赖 `error.code` 而非中文文案；`meta.requestId/timestamp` 给日志串联与链路追踪留锚点（文章141、154）。
- **为什么不建共享 env package**：api 读 `c.env`、web/admin 读 `process.env`，运行时入口本就不同；统一键名比统一读取代码更重要（文章142）。
- **为什么 access 无状态、refresh 有状态**：access 高频暴露需短命快验，无状态省去查库；refresh 要支持注销/单设备下线/rotation/replay 检测，这些能力只靠纯无状态 JWT 做不到，所以必须落库且只存 hash（文章150、152、155）。
- **为什么 access 放内存、refresh 放 httpOnly cookie**：内存随页面关闭即清，暴露时间短，契合 access 短命角色；refresh 长期敏感，放 httpOnly 让浏览器自动带上但 JS 读不到，避免 XSS 直接窃取(故不放 localStorage)（文章151）。
- **为什么 admin 与 web 登录入口拆开**：admin 只认密码且要查后台角色，web 还要并列接 GitHub/Google，两边回调地址/cookie path/错误处理不同；外层路径拆开、内部 service 复用最顺手（文章154）。
- **为什么不拆两套用户表(admin_users/web_users)**：同一真实用户可能同时出现在两端，且 OAuth 绑定天然围绕「用户主体」；拆双表会带来第三方绑定同步、同邮箱去重、主体归属等难题。正解是「用户主体 / 登录方式 / 子站策略 / 角色绑定」横向拆（文章152、153）。
- **为什么 refresh 用随机串+hash 而非 bcrypt/argon2**：refresh 是服务端生成的高熵随机值，威胁模型与人类弱口令不同，SHA-256 / HMAC-SHA-256 摘要已足够；只存 hash 是为了库泄漏时攻击者拿不到可用明文（文章155）。
- **为什么 migration 里可以放 INSERT**：`admin`/`password`/`admin_owner` 这类是「系统基础配置」而非业务数据，只要系统存在就该存在，属于初始化一部分；但 dev 临时账号不该进 migration（文章157）。
- **为什么旧 migration 不回改**：被执行过的 migration 是「已发生的历史」，回改会让新老环境同名文件内容不一致；字段变更应新增 `0002_*.sql`，且 NOT NULL/唯一/外键等收紧动作分步上(先加可空→回填→再收紧)（文章157）。
- **为什么 refresh rotation 写入顺序固定**：必须「先抢占旧 token 的 used 标记 → 签新 token → 插新 token 记录 → 回写 old→new 替换关系」；`markRefreshTokenUsed` 是并发竞争点，只有抢到 used 标记的请求才有资格续，其余并发请求直接撤销整条 session 并报 replay（文章148、163）。
- **为什么 logout 撤销 session 而非删 token**：服务端真正关心的是会话状态是否失效；撤销 session 会连带其下整条 refresh token 链一起收掉，只删前端 token 等于没真正退出（文章154、165）。
- **为什么无感刷新先试探再刷新**：避免每进受保护页就刷一次；只认「access token is invalid」这一具体 401 信号才 refresh，防止误刷；admin 放 middleware 是因为它天然卡在请求/响应之间，能一次性改写 access/refresh/session 三个 cookie（文章164）。
- **为什么 DeepSeek 走 OpenAI-compatible + LangChain ChatOpenAI**：DeepSeek 兼容 OpenAI 协议，只需把 `baseURL` 指过去即可复用 `ChatOpenAI`；API 统一写在 api 子站(不走 Next API Route)，保持项目边界（文章170）。
- **为什么 LLM 配置 Key 不落库、只 localStorage**：产品决策「不持久化用户 Key」；折中点是 Key 仍会请求级发到自家 api 子站做代理(解决 CORS/流式协议差异/上下文集中维护)，但不写库、不写日志、不透传上游正文(防敏感信息泄漏)（文章173）。
- **为什么聊天代理接口必须鉴权**：它能代理三方 LLM，且可能借平台默认 DeepSeek 消耗资源，未登录调用风险大；故 transport 显式带 `Authorization`，后端 `requireWebAccessToken` 校验(`expectedApp: 'web'`)（文章173）。

---

## 关键代码/片段（可直接粘贴的最小代码）

### 1. 统一响应 envelope 与契约（文章141、144）
```ts
// packages/contracts/src/common/response.ts
export type ApiMeta = { requestId: string; timestamp: string }
export type ApiSuccess<T> = { ok: true; data: T; meta: ApiMeta }
export type ApiError = { code: BizCode; message: string; details?: unknown }
export type ApiFailure = { ok: false; error: ApiError; meta: ApiMeta }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
export function buildSuccess<T>(data: T, meta: ApiMeta): ApiSuccess<T> {
  return { ok: true, data, meta }
}
export function buildFailure(error: ApiError, meta: ApiMeta): ApiFailure {
  return { ok: false, error, meta }
}
```

### 2. Hono RPC 类型导出 + 前端消费（文章141）
```ts
// apps/api/src/app.ts —— AppType 必须在所有子路由挂载完成后导出
import routes from './routes'
app.route('/', routes)
export type AppType = typeof routes
export default app

// apps/web 前端拿到真实类型推导
import type { AppType } from '@repo/api'
import { hc } from 'hono/client'
const client = hc<AppType>(apiBaseUrl)
const res = await client.rpc.system.ping.$post({ json: { name: 'web' } })
```

### 3. 双层 env helper（文章142）
```ts
// apps/web/src/env.server.ts —— 仅服务端，禁止被 "use client" 组件引用
const schema = z.object({
  APP_ENV: z.enum(['development','test','production']),
  API_BASE_URL: z.string().url(),
})
export const getWebServerEnv = () => schema.parse({
  APP_ENV: process.env.APP_ENV, API_BASE_URL: process.env.API_BASE_URL,
})
// 客户端版只读 NEXT_PUBLIC_*，编译期内联
```

### 4. 单入口 http 模块（文章145）
```ts
// apps/web/src/http.ts —— 关键是 resolveBaseURL 自动判定运行端
function resolveBaseURL() {
  if (typeof window === 'undefined') return getWebServerEnv().API_BASE_URL
  return getWebClientEnv().NEXT_PUBLIC_API_BASE_URL
}
async function request<T>(method, path, options): Promise<ApiResponse<T>> {
  try {
    const url = new URL(`${path}${buildSearchParams(options?.query)}`, resolveBaseURL()).toString()
    const r = await fetch(url, createRequestInit(method, options?.payload, options?.init))
    return await r.json()
  } catch (e) {
    return { ok: false, error: { code: BizCode.SYSTEM_UPSTREAM_TIMEOUT,
      message: e instanceof Error ? e.message : 'API request failed' },
      meta: { requestId: 'unavailable', timestamp: new Date().toISOString() } }
  }
}
export const http = {
  get: <T>(p, o?) => request<T>('GET', p, { query: o?.query, init: o?.init }),
  post: <Req, T>(p, payload: Req, o?) => request<T>('POST', p, { payload, init: o?.init }),
}
```

### 5. jwt.ts 令牌工具（文章155、160）
```ts
import { SignJWT, jwtVerify } from 'jose'
import { uuidv7 } from 'uuidv7'
const enc = new TextEncoder()
const toSecret = (s: string) => enc.encode(s)

export async function signAccessToken(p: { claims; secret: string; ttlSec: number }) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sid: p.claims.sid, app: p.claims.app, roles: p.claims.roles })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(p.claims.sub).setIssuedAt(now).setExpirationTime(now + p.ttlSec)
    .sign(toSecret(p.secret))
}
// refresh token 额外生成 jti(uuidv7) 并一并返回，作为可追踪/可撤销的状态记录
export async function signRefreshToken(p: { claims; secret: string; ttlSec: number }) {
  const now = Math.floor(Date.now() / 1000); const jti = uuidv7()
  const token = await new SignJWT({ sid: p.claims.sid, app: p.claims.app, jti })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(p.claims.sub).setIssuedAt(now).setExpirationTime(now + p.ttlSec)
    .sign(toSecret(p.secret))
  return { token, jti }
}
```

### 6. refresh token 随机串 + hash（文章155）
```ts
const sha256Hex = async (v: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2,'0')).join('')
}
const generateRefreshToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2,'0')).join('')
```

### 7. refresh rotation 的并发竞争点（文章163）
```ts
// 抢占旧 token used 标记：只有第一个抢到的请求才有资格续签
const markedUsed = await markRefreshTokenUsed({ db, tokenId: currentToken.tokenId, usedAtMs: nowMs })
if (!markedUsed) {
  await revokeSession({ db, sessionId: currentToken.sessionId, revokedAtMs: nowMs, reason: 'refresh_token_replay' })
  throw refreshTokenReplayedError()
}
// 顺序：抢 used → 签新对 → insertRefreshToken(parentTokenId=旧) → updateRefreshRotation(old→new)
```

### 8. Drizzle 事务里的 rotation（文章148）
```ts
await db.transaction(async (tx) => {
  const old = await tx.query.refreshTokens.findFirst({ where: eq(refreshTokens.id, oldId) })
  if (!old || old.usedAtMs || old.revokedAtMs) throw new Error('Refresh token is invalid')
  await tx.update(refreshTokens).set({ usedAtMs: now, replacedByTokenId: newId }).where(eq(refreshTokens.id, oldId))
  await tx.insert(refreshTokens).values({ id: newId, sessionId: old.sessionId, jtiHash: newHash,
    issuedAtMs: now, expiresAtMs: newExp, parentTokenId: oldId })
  await tx.update(authSessions).set({ lastSeenAtMs: now }).where(eq(authSessions.id, old.sessionId))
})
```

### 9. admin 无感刷新 middleware 核心（文章164）
```ts
// apps/admin/middleware.ts —— 先试探，只认具体失效信号才 refresh
const initial = await fetchUserProfileStatus(accessToken, env.API_BASE_URL)
if (!shouldTryRefresh(initial.payload, initial.status)) return NextResponse.next()
// status===401 && payload.error.code==='AUTH.UNAUTHORIZED' && message==='Access token is invalid'
const refreshResponse = await fetch(`${env.API_BASE_URL}/auth/admin/token/refresh`,
  { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }), cache: 'no-store' })
// 成功 → response.cookies.set(三个 cookie)；失败 → response.cookies.delete(三个)，交页面层重定向
```

### 10. LLM 配置后端「用户优先、平台兜底」（文章173）
```ts
function resolveChatProviderConfig({ payload, env }) {
  if (payload.llmConfig) {
    return { apiKey: payload.llmConfig.apiKey, baseURL: payload.llmConfig.baseURL, model: payload.llmConfig.model }
  }
  if (!env.DEEPSEEK_API_KEY) throw new AppError(BizCode.SYSTEM_INTERNAL_ERROR, 'LLM API key is not configured', 500)
  return { apiKey: env.DEEPSEEK_API_KEY,
    baseURL: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    model: env.DEEPSEEK_MODEL ?? 'deepseek-chat' }
}
// 调上游：fetch(`${baseURL.replace(/\/$/,'')}/chat/completions`, { stream:true, signal: c.req.raw.signal })
// 再把 SSE 的 choices[0].delta.content 抽出来 enqueue 成 text/plain 流
```

---

## 踩坑点：易错点与边界

- **catalog/transpilePackages 漏配**：共享包没加进 `transpilePackages`、或 catalog 版本没在子包用 `catalog:` 引用，会导致解析失败（文章137、138）。
- **Tailwind 扫不到共享包类名**：`@source "./**/*.{ts,tsx}"` 路径写错、或共享组件里动态拼接类名，会让组件渲染出来但无样式（文章138、139）。
- **AppType 导出时机**：`export type AppType = typeof routes` 必须在所有子路由挂载之后，否则前端 `hc<AppType>()` 类型链丢失（文章144）。
- **env 边界越界**：把 `env.server.ts` 引进 `"use client"` 组件会泄漏私有变量；客户端依赖非 `NEXT_PUBLIC_*` 变量取不到值；读取要 `process.env.X` 直接属性访问，勿先解构（文章142）。
- **Turbo 未声明 env**：`turbo.json` 各 task 没列环境变量会触发 `no-undeclared-env-vars` 告警且缓存感知不到变化；真实 env 文件要 gitignore，只提交 `.example`（文章142）。
- **本地 D1 四类坑**：binding 名写错(`env.DB` vs `env.DATABASE`)、命令漏 `--local` 打到远程、改了 SQL 没重新执行、把「binding 名」当成「数据库名」（文章156）。
- **seed 顺序不能反**：必须先跑 migration 建结构再跑 seed，否则 seed 因表不存在失败；dev seed 绝不进生产，生产管理员单独一次性脚本创建（文章157）。
- **事务被拆坏**：前几步用 `tx`、后几步又用外层 `db`，等于事务失效；事务里要「先校验再写」，别只写不查（文章148）。
- **refresh 错误码糊成一团**：要分清 `AUTH_REFRESH_MISSING/EXPIRED`、`AUTH_SESSION_REVOKED`、`AUTH_REFRESH_REUSED`(撤销整 session)、`AUTH_APP_MISMATCH`，前端文案统一在展示层（文章154、163）。
- **OAuth callback 上下文丢失**：`state` 要带 `intent(login/bind)`、`app`、`returnTo`、防 CSRF nonce、绑定场景的 `currentUserId`；解绑时要检查「解绑后是否还剩可用登录方式」，否则账号失去入口（文章154）。
- **401 并发刷新风暴**：多个请求同时 401 会并发消费同一 refresh token，必须用 `refreshOnce` 把同一时刻的 refresh 合并成一个 Promise（文章151）。
- **页面刷新 access token 丢失**：这是「放内存」的设计结果不是 bug，正确做法是启动时 `bootstrapSession()` 走一次 refresh 恢复（文章151）。
- **AI SDK 的 parts 不只 text**：`UIMessage.parts` 可能含 `step-start`/tool/data/file part，contract 用 `z.object({type}).passthrough()` 宽松透传，进 LangChain/上游前再 `filter(part.type==='text')`，否则校验失败或发空消息（文章170、173）。
- **Transport 与返回协议要匹配**：用 `TextStreamChatTransport` 后端必须返回 `text/plain; charset=utf-8`；若改 `DefaultChatTransport` 则要返回 AI SDK UI message stream（文章170）。
- **baseURL 尾斜杠**：拼 `/chat/completions` 前要 `replace(/\/$/, '')`，否则出现 `//chat/completions`（文章173）。
- **React setState updater 取 event 值**：不要在 updater 回调里读 `event.currentTarget.value`(可能已 null)，要先同步取值再 setState（文章173）。
- **上游 LLM 错误不透传**：三方错误正文可能含敏感上下文，只记 HTTP status，不记正文、不透传前端（文章173）。
- **DeepSeek/用户 API Key 不入仓库/不入库/不入日志**：Key 放 `.dev.vars`(本地，gitignore) 或 Wrangler secret(线上)；用户 Key 只在 localStorage + 请求级临时使用（文章170、173）。

---

## 与本项目(AI-Companion)的关联 + 下一步动手建议

**关联**：本子主题就是 AI-Companion 第 6 单元「Vercel AI SDK 与 Agent 大脑」落地前的工程地基。它把「多子站 monorepo + 共享契约 + 双层 token 认证 + LLM 接通/配置化」这条主干跑通，后续单元的 Agent 记忆系统(176-177)、聊天历史 API(178)、Prompt 组装(179) 都直接接在这套 `contracts → http → service → repository` 分层与 `/rpc/chat/inbox` 鉴权聊天入口之上。认证链路的 admin/web 拆分与「平台 DeepSeek 兜底 + 用户配置优先」也决定了 Agent 后续如何承接登录态与多模型。

**下一步动手建议（按落地顺序）**：
1. **先复刻地基三步**：`create-turbo` 起 monorepo → catalog 统一依赖 → web/admin/api 跑通(端口 3005/3006/8787)，用首页一次 `ping` 验证 Hono RPC 类型链(文章137、141)。
2. **铺好契约与请求层**：建 `packages/contracts` 的统一 envelope + 业务码，落 `http.ts` 单入口与 TanStack Query Provider，后续所有接口都按「contract→route→api.ts→页面」加(文章144-146)。
3. **认证按推荐顺序推进**：admin 密码登录 → web 密码登录 → refresh → logout → session 列表/revoke → GitHub 登录 → 绑定/解绑 → Google；先用 D1+事务，并发刷新出现问题再考虑 Durable Objects(文章154、152)。
4. **认证落地时严守边界**：access 内存/refresh httpOnly cookie、refresh 只存 hash、rotation 写入顺序固定、logout 撤 session、无感刷新只认具体失效信号(文章150-165)。
5. **接通模型**：先 `ChatOpenAI` 指向 DeepSeek 跑通 `/rpc/chat/inbox` 纯文本流 + `useChat`，再做 LLM 配置化(可选 `llmConfig` + localStorage + 用户优先/平台兜底)，并给聊天接口加 `requireWebAccessToken`(文章170、173)。
6. **建议先写一份本地 `seed-admin.sql` + `.dev.vars` 模板**，让登录/刷新/聊天链路本地可一键联调，避免每次手搓测试数据(文章157、170)。

## Agent 大脑（核心）

> 精读范围：文章 176-195（记忆系统 → 安全/意图/情绪/路由/策略/质检 → 关系阶段 → 记忆候选 → 反馈闭环 → 主动关怀 → 群聊）。面向"已会基础、要落地"的工程师，提炼"为什么这么做 + 最小可用代码"。

这一子主题本质是回答一个问题：**怎么把一个"会调 LLM 的聊天接口"做成一个有记忆、有边界、会回应、有关系、能主动、能多人协作的 Agent 大脑。** 它的核心架构思想可以一句话概括：**用 LangGraph 把"对话理解"拆成可观察、可降级、可替换的节点链；用 LangChain structured output 让 LLM 输出稳定 JSON；再用代码规则做"产品策略治理"，最后把每一步分析结果写进消息 `metadata_json` 做可观测闭环。**

---

### ## 核心概念：每条一句话讲清

- **三层记忆结构**：最近 18 条消息（短期/现场）+ `conversation.summary` 滚动摘要（中期/脉络）+ `agent_memories` 结构化记忆（长期/稳定偏好与边界），各司其职而非堆叠。（文章176）
- **第一版只追求"产品闭环"不追求"复杂算法"**：先做到历史可恢复、上下文可注入、记忆可管理，向量检索/LLM 抽取/多会话都留到数据量真正上来再做。（文章176、181）
- **三张记忆表**：`agent_conversations`（会话容器+摘要+计数）、`agent_conversation_messages`（完整消息流水+`metadata_json`）、`agent_memories`（结构化长期记忆，含 type/importance/status/source_message_id）。（文章177）
- **Contracts 先行**：前后端共用 zod schema 包，杜绝 `createdAtMs` vs `created_at_ms` 这类字段漂移。（文章177）
- **打开 Agent 即获取或创建默认会话**：读取接口顺手 `getOrCreate`，靠 `user_id+agent_id` 唯一索引 + `onConflictDoNothing` 防并发重复。（文章178）
- **游标分页（非页码）**：用最早一条消息的 `createdAtMs` 做 cursor 向前翻，聊天场景下比页码稳。（文章178）
- **用户消息先落库，再调 LLM**：上游失败也不丢用户输入；`message_count` 用 `sourceUserMessageId` 判断 +1 还是 +2。（文章179、180）
- **服务端 D1 历史才是上下文真相**：前端只提交最近 ≤20 条 UI 消息，真正 prompt 组装以 D1 为准，前端只是"必要字段提交者"。（文章179、181）
- **流式返回 + 流结束统一落库**：一边 `enqueue` 给前端，一边累积 `assistantMessageText`，流结束在 `saveAssistantTurn` 收口（写 assistant 消息/更新摘要计数/同步列表预览/触发记忆抽取）。（文章180）
- **v1 摘要是规则滚动而非 LLM**：拼接既有摘要+最近 8 条+本轮，压缩空白后取**尾部** 1600 字（越靠后越接近当前）。（文章180）
- **安全边界是"前置护栏"**：回复生成前先用 LangChain structured output 做分类，按 `boundaryAction` 分流（continue/soft_boundary/redirect 注入策略继续聊；refuse/crisis_support 直接返回固定回复不进聊天模型）。（文章182）
- **意图识别答"用户想要什么"**：15 类陪伴向意图 + userNeed + requestedAgentAction + relationshipSignal + replyExpectation，作为隐藏策略注入 prompt。（文章183）
- **情绪路由答"该怎么回应"**：LLM 识别情绪 → 代码规则选路线（如 `quiet_presence`/`warm_comfort`/`calm_deescalation`），意图决定做什么、情绪决定怎么做。（文章184）
- **Reply Policy 是"理解转执行"最后一层**：把路线转成可执行行为准则（句数预算/允许动作/禁止动作/追问上限/建议上限），模板化的是**行为边界**不是话术。（文章185）
- **Reply Quality Guard 是"回复后质检"**：生成后用纯规则检查句数/问号/建议词/内部标签泄露/沉浸感破坏，v1 只记录进 metadata 不拦截。（文章186）
- **关系阶段是"动态会话状态"**：8 阶段（new_connection→close_bond + repairing/boundary_sensitive/dependency_watch），给情绪路由和回复策略叠加"关系节奏"。（文章187）
- **记忆候选判断是"抽取前闸门"**：fast reject（本地正则秒拒寒暄/重复/敏感）+ LangChain 结构化判断 + 关键词兜底，只让有长期价值的对话进抽取器。（文章188）
- **用户反馈闭环是"偏好记事本"**：点赞/点踩绑定到具体 assistant 消息，最近反馈注入下一轮 prompt 影响风格，不做微调。（文章189）
- **主动关怀是"聊天消息来源"而非"通知系统"**：主动关怀必须写入真实 `agent_conversation_messages`，靠 `agent_care_plans`/`agent_care_events` 管配置与已读，`next_run_at_ms` 给 Cron 留位。（文章190）
- **群聊底座 = 受控多 Agent 空间**：3 张表（群/成员/消息），`sender_type` 扩成 user/agent/system，1 群 ≤6 Agent、1 轮 ≤3 回复。（文章191）
- **群聊 v1 选 Agent 用可解释规则**：点名优先 → "你们/大家"群体提问触发多人 → 默认仅 1 个回复，且串行生成让后者看到前者。（文章192）
- **群聊 LangGraph 编排**：classifyIntent→selectAgents→generateReplies(single/serial/parallel)→checkQuality，每个节点可降级回旧规则。（文章193）
- **Agent 互相回应有硬上限**：首轮回复后最多追加 1 轮、≤2 条补充回应，必须指向首轮 Agent，规划器默认倾向"不说"。（文章194）
- **智能发言权 = 多信号调度**：综合 Agent 人设 + 关系阶段（从一对一消息数推导）+ 最近发言频率（新鲜度降权）+ 用户情绪，从"谁被点名"升级为"谁最该接话"。（文章195）

---

### ## 设计决策与"为什么"：列出关键取舍及理由

- **为什么不一上来用向量库**：一对一聊天数据规模小，长期记忆是结构化短文本，按 `importance desc, updatedAtMs desc` 取前几条已够；D1 迁移/部署/调试成本低。表里预留 `embedding_id` 等字段，等记忆数多了再接 Vectorize。（文章176）
- **为什么会话表冗余 `user_id` 和 `message_count`**：归属明确便于权限校验（任何查询都回到登录用户）、查询方便、排查清楚；冗余计数避免高频 count。（文章177）
- **为什么用户消息先落库**：等 LLM 成功再一起存看似整齐，但上游失败会丢用户输入，破坏历史可信度。先存用户消息，失败也能在历史和首页列表里看到。（文章179、181）
- **为什么 v1 摘要用规则不用 LLM**：不额外耗 token、不拖慢回复链路、确定性强（输入即输出，不受模型质量波动影响）；升级时也建议每 N 轮才调一次 LLM 而非每轮。（文章180）
- **为什么安全判断放在回复"之前"且复用用户配置的 LLM**：普通聊天模型擅长顺着用户往下生成，不会先判风险；复用用户 OpenAI-compatible 配置可让安全判断与聊天行为一致、便于复现。代价是判断质量依赖用户模型，所以补保守降级。（文章182）
- **为什么 structured output 要多 method 重试**：三方中转对 jsonSchema/functionCalling/jsonMode 支持不一；responses 协议优先 jsonSchema，chat_completions 优先 functionCalling，全失败才用保守 fallback（注意 fallback 不退回关键词规则，而是不同 structured method 或保守对象）。（文章182、183）
- **为什么"LLM 判断 + 代码归一化"组合**：LLM 负责理解语义（情绪/意图/关系含蓄表达），代码负责守住产品策略（低置信降级 unclear、crisis 强制 crisis_support、依赖风险自动克制）。模型不可全信。（文章183、184、187）
- **为什么情绪识别交 LLM、情绪路由交代码**：识别是语义理解问题（中文很含蓄），路由是产品策略问题（什么时候降温/不追问要稳定可控）。（文章184）
- **为什么要 Reply Policy 而不只靠情绪路由**："知道该安慰"≠"能稳定安慰"，没有强约束模型仍会输出一堆建议或连续追问。Reply Policy 用 `sentenceBudget`/`questionLimit`/`adviceLimit`/`forbiddenMoves` 把风险压住。（文章185）
- **为什么质检 v1 只记录不拦截**：先建可观察闭环、不增加额外 LLM 成本、不影响流式速度，看清问题类型频率后再决定拦截或自动重写。（文章186）
- **为什么关系阶段/记忆候选/质检都不新增 D1 表**：它们是"每轮运行时分析结果"而非长期业务实体，写进 `metadata_json` 即可，避免过早固化数据模型。要做审计统计再加 `agent_relationship_states`/`agent_memory_candidate_logs`。（文章186、187、188）
- **为什么记忆候选要 fast reject 在前**：降成本（明显寒暄/重复不调 LLM）、减脏记忆、保护敏感信息（密码/验证码/银行卡正则直接拒）。"少记一点"优于"记满垃圾"。（文章188）
- **为什么反馈不能暴露给模型说出来**：用户在和电子伴侣聊天不是操作调参面板，反馈应影响行为但不破坏沉浸感（prompt 明确"不要提到评分/点赞/点踩"）。（文章189）
- **为什么主动关怀写进聊天历史而非做通知系统**：通知系统重心在推送渠道/点击率；当作聊天消息重心在关系连续性/上下文/未读，能被记忆/摘要/反馈复用。抽象选错会做歪整个功能。（文章190）
- **为什么群聊串行生成、每 Agent 只注入自己的记忆**：串行让后者看到前者避免撞车/重复；只注入本 Agent 一对一记忆避免角色边界污染（不同 Agent 与用户有不同熟悉度）。（文章192、193）
- **为什么群聊 LangGraph 全程保留旧规则做 fallback**：LangGraph 是体验增强不能成为单点风险；任一节点失败回退 `selectAgentsForReply`，开发时也便于判断问题来自模型还是业务。（文章193、195）
- **为什么 Agent 互相回应要硬上限**：放开会进入 A→B→A→C 无限自说自话，用户被挤出对话中心。`groupCrossReplyLimit=2`/`Round=1` 是产品边界，LLM 想继续也不准。（文章194）
- **为什么发言权升级为多信号而非只看关键词**：真实群聊里谁说话取决于情绪匹配（难过→温柔熟络的）、关系深度、最近发言频率（连说多次降权），关键词太笨重。（文章195）
- **统一优先级原则**：`安全边界 > 意图判断 > 情绪路由 > 回复生成 > 记忆抽取`；高风险输入不被包装成普通情绪陪伴。（文章182、184）

---

### ## 关键代码/片段：可直接粘贴的最小代码

**1. Prompt 注入分层（所有理解层都注入同一个 system message，标签化、要求不暴露内部标签）**（文章179、183、184、189）

```ts
const messages: ChatCompletionMessage[] = [{
  role: 'system',
  content: [
    agentPrompt?.defaultPrompt || '你是 AI 聊天陪伴助手。',
    '请用简洁、自然的中文回答，尊重双方边界，避免操控式话术。',
    getSafetySystemInstruction(safety),        // 安全策略
    getIntentSystemInstruction(intent),        // 意图：隐性策略，不暴露分类标签
    getEmotionRouteSystemInstruction({ emotion, route }), // 情绪路由
    getRelationshipStageSystemInstruction(relationshipStage), // 关系节奏
    getReplyPolicySystemInstruction(replyPolicy), // 行为准则（句数/允许/禁止动作）
    getFeedbackSystemInstruction(recentFeedbacks), // 用户反馈
    activeMemories.length
      ? '以下是长期记忆，请优先尊重：\n' +
        activeMemories.map(m => `- [${m.type} / 重要度 ${m.importance}] ${m.content}`).join('\n')
      : '',
    summary ? `此前对话摘要：${summary}` : '',
  ].filter(Boolean).join('\n'),
}]
```

**2. LangChain structured output 通用调用骨架（安全/意图/情绪/候选/群聊全部复用此模式）**（文章182、183）

```ts
function buildLangChainChatModel(p: ChatProviderConfig) {
  return new ChatOpenAI({
    model: p.model, apiKey: p.apiKey, temperature: 0,         // 判断类任务 temperature=0
    useResponsesApi: p.wireApi === 'responses',
    configuration: { baseURL: p.baseURL.replace(/\/$/, '') },
    ...(p.reasoningEffort ? { reasoning: { effort: p.reasoningEffort } } : {}),
    ...(p.wireApi === 'responses' ? { zdrEnabled: true } : {}),
  })
}
// 兼容不同中转：按协议选 method 优先级，多 method 重试，全失败用保守 fallback
function getStructuredOutputMethods(p: ChatProviderConfig) {
  return p.wireApi === 'responses'
    ? ['jsonSchema', 'functionCalling', 'jsonMode'] as const
    : ['functionCalling', 'jsonSchema', 'jsonMode'] as const
}
const structuredModel = model.withStructuredOutput(MySchema, { name: 'xxx', method })
const result = await prompt.pipe(structuredModel).invoke(vars, { signal }) // 支持 AbortSignal
```

**3. 安全结果业务一致性归一化（structure 合法 ≠ 业务合理）**（文章182）

```ts
function normalizeConversationSafety(s: ConversationSafety): ConversationSafety {
  const n = { ...s }
  if (n.safetyLevel === 'crisis') { n.boundaryAction = 'crisis_support'; n.allowMemoryExtraction = false }
  if (n.safetyLevel === 'block' && n.boundaryAction !== 'crisis_support') {
    n.boundaryAction = 'refuse'; n.allowMemoryExtraction = false
  }
  if (n.boundaryAction === 'refuse' || n.boundaryAction === 'crisis_support') n.allowMemoryExtraction = false
  if (n.boundaryAction === 'continue' && n.safetyLevel !== 'safe') n.boundaryAction = 'soft_boundary'
  if (!n.responseGuidance) n.responseGuidance = '用温和、克制、尊重边界的方式回复。'
  return n // 原则：安全等级越高，系统越保守
}
```

**4. 记忆候选 fast reject（本地秒拒，先省 LLM 成本）**（文章188）

```ts
// 空内容 / 短寒暄 / 确认语 / 完全重复 / 敏感凭证 直接跳过
if (/^(好|嗯|哦|哈+|谢谢|好的|可以|ok|晚安|拜拜)[。！!~～\s]*$/.test(userText))
  return { shouldExtract: false, category: 'small_talk' }
if (/(密码|验证码|身份证|银行卡|手机号|token|api ?key|secret|密钥)/i.test(userText))
  return { shouldExtract: false, category: 'unsafe' }
// 通过后才进 LangChain 候选判断；模型返回再 normalize 强制跳过 small_talk/temporary_emotion/duplicate/unsafe
```

**5. LangGraph 节点链 + 失败兜底（单聊对话理解图）**（文章184、185、187）

```ts
const graph = new StateGraph(ConversationUnderstandingState)
  .addNode('normalizeInput', normalizeInputNode)
  .addNode('classifyIntent', classifyIntentNode)
  .addNode('detectEmotion', detectEmotionNode)
  .addNode('analyzeRelationshipStage', analyzeRelationshipStageNode)
  .addNode('routeEmotion', routeEmotionNode)      // 纯代码规则，不调 LLM
  .addNode('buildReplyPolicy', buildReplyPolicyNode) // 纯代码规则
  .addEdge(START, 'normalizeInput')
  .addEdge('normalizeInput', 'classifyIntent')
  .addEdge('classifyIntent', 'detectEmotion')
  .addEdge('detectEmotion', 'analyzeRelationshipStage')
  .addEdge('analyzeRelationshipStage', 'routeEmotion')
  .addEdge('routeEmotion', 'buildReplyPolicy')
  .addEdge('buildReplyPolicy', END)
  .compile()
// 整图 try/catch：失败时用 fallbackIntent/fallbackEmotion 重建，保证主聊天永不中断
```

**6. 群聊受控选 Agent（v1 规则，后续降级用同一函数）**（文章192、193）

```ts
function selectAgentsForReply({ agents, userText }) {
  const lower = userText.toLowerCase()
  const mentioned = agents.filter(a => lower.includes(a.name.toLowerCase()))
  if (mentioned.length) return mentioned.slice(0, groupReplyAgentLimit) // 点名优先
  if (/(你们|大家|一起|分别|都说|怎么看|意见)/.test(userText))
    return agents.slice(0, Math.min(groupReplyAgentLimit, agents.length)) // 群体提问
  return agents.slice(0, 1) // 默认仅 1 个，防刷屏
}
```

**7. 群聊记忆按 Agent 隔离注入（防角色污染）**（文章192、193）

```ts
const memoryText = activeMemories.length
  ? '你与用户的一对一长期记忆：\n' +
    activeMemories.map(m => `- [${m.type} / 重要度 ${m.importance}] ${m.content}`).join('\n')
  : '暂无可用长期记忆。'
// 每个 Agent 只拿自己的 listActiveAgentMemories，绝不混入其他 Agent 的私有记忆
```

---

### ## 踩坑点：易错点与边界

- **新表上线必须先跑迁移**：前端已请求新接口、后端已部署，但 D1 还是旧 schema → "Agent 列表加载失败"。本地 `db:migrate:local` 和远程 `--remote` 要分别确认。（文章181）
- **`message_count` 不能固定 +2**：边缘路径可能只写了 assistant 没写 user，要用 `sourceUserMessageId` 判断 +1 还是 +2，否则计数与真实消息数越偏越大。（文章180）
- **分页 cursor 单用 `createdAtMs` 的极端漏洞**：同一毫秒多条消息可能漏取/重复，需要时升级为 `{createdAtMs, id}` 组合游标。（文章178）
- **前端消息 ID 是临时 ID，不能直接提交反馈**：流式刚结束时 message.id 还是 AI SDK 临时 ID，要用 `persistedAssistantMessageIds` 校验确实从服务端返回过才允许反馈。（文章189）
- **切换 Agent 用 `key={conversationId}` 重建组件**：否则 React 复用旧实例，上一个 Agent 的 messages 状态会残留到下一个。（文章181）
- **历史 assistant 消息不要重新逐字播放**：只有新回复逐字显示，历史消息初始化 `visibleAssistantTextById` 直接完整呈现，否则加载历史很拖沓。（文章181）
- **高风险场景禁止抽取长期记忆**：`allowMemoryExtraction=false` 时不能把"我谁都不想见了"误存成"用户不喜欢现实社交"，短时情绪≠长期偏好。安全判断失败也保守禁抽。（文章182）
- **structured output 合法 ≠ 业务合理**：必须有归一化层（crisis 却 continue、低置信却高意图、次要意图与主意图重复都要纠）。（文章182、183）
- **关系阶段：历史太少即使语气亲密也要拉回 new_connection**：`messageCount<6` 强制初识、压低 closenessScore，防止刚认识就过度亲密显得油腻。（文章187）
- **PATCH 接口要在 CORS allowMethods 里加 PATCH**：否则浏览器预检失败，保存关怀计划/编辑记忆会报错。（文章190）
- **路由顺序**：`/:agentId/care-plan` 这类更具体路由要放在 `/:agentId` 动态路由之前，否则被提前匹配。（文章190）
- **主动关怀只写 event 不写 message 是错的**：那样只是后台事件，用户聊天里看不到，也不能成为后续上下文，必须同时写 `agent_conversation_messages`。（文章190）
- **增强能力要与主流程解耦容错**：未读统计/已读标记用 `try/catch`，关怀表不可用时不能拖垮首页列表和聊天历史接口。（文章190）
- **群聊质检 revision 不能按 agentId 全量覆盖**：同一 Agent 一轮可能有首轮+补充两条消息，只在该 Agent 本轮仅 1 条时才用 revision 覆盖，避免改混。（文章194）
- **群聊不允许把别人的 Agent 混进群**：创建/加成员都要 `listOwnedAgentCompanionsByIds` 校验归属并 `dedupe + slice(0,6)`，前后端都要兜成员上限。（文章191）
- **JSON 字段读出要二次清洗**：`scenes_json` 没有 enum 约束，读出来要按白名单过滤再用。（文章190）

---

### ## 与本项目(AI-Companion)的关联 + 下一步动手建议

**与本项目的关联**：这 20 篇就是 AI-Companion 后端 Agent 大脑的完整骨架，代码主要落在 `apps/api/src/routes/chat/inbox.route.ts`（单聊全链路）、`apps/api/src/routes/chat/group.route.ts`（群聊编排）、`apps/api/src/auth/repository.ts`（记忆/关怀/群聊查询）、`packages/contracts`（前后端契约）、`apps/web/app/(dashboard)/`（聊天窗口/记忆库/群聊/关怀 UI）。技术栈是 Cloudflare D1 + Drizzle + Hono + LangChain/LangGraph + Next.js + React Query，与 CLAUDE.md 里 Vue3 现役不同，这里是 React/Next 学习线，可结合 `agent-dev` 与 `frontend` 两个 Skill 落地。

**单聊链路全貌（务必记牢这条主线）**：
`安全边界 → 意图 → 情绪 → 关系阶段 → 情绪路由 → Reply Policy → LLM 生成 → Reply Quality Guard → 落库 → 记忆候选 → 记忆抽取`，全程把 `safety+intent+emotion+relationshipStage+route+replyPolicy` 写进用户消息 `metadata_json`（版本号 `conversation-understanding-v2`），assistant 消息写 `reply-quality-guard-v1`。

**下一步动手建议（按优先级）**：
1. **先打通最小记忆闭环**：建 3 张表 + Contracts，实现"用户消息先落库 / 历史恢复 / 游标分页 / 规则摘要 / 规则记忆抽取 / 记忆库 CRUD"，按文章181 的 10 步手动验证清单跑一遍（含刷新后历史还在、记忆能注入下一轮）。这是后面一切的地基。
2. **加一层安全边界前置**：哪怕只接 `ConversationSafety` 这一个 schema，先把 `先判断再回复` + `refuse/crisis_support 分流` + `allowMemoryExtraction` 联动记忆抽取做出来，这是产品底线。
3. **用 LangGraph 搭对话理解图**：即使初期只有 normalizeInput+classifyIntent 两个节点也用 LangGraph，预留节点扩展位，避免后面堆成巨型 if-else。每个节点必须有 fallback 对象，整图 try/catch 保主链路。
4. **把可观测性当一等公民**：所有分析结果写 `metadata_json` + `analysisVersion`，尽早做一个 admin 调试页查看每条消息的 safety/intent/emotion/route/replyPolicy/guard，这是后续调 prompt、做 A/B、做质量统计的唯一数据基础。
5. **群聊作为单聊能力的扩展而非重写**：复用 LLM 配置、记忆、structured output 骨架，坚持"受控群聊"（默认单回复、≤3 多回复、串行、记忆按 Agent 隔离、互相回应硬上限），先跑通 LangGraph 编排再谈智能发言权。
6. **升级路径已被原文标好接口**：规则抽取→LLM JSON 抽取、自动 active→pending 记忆确认、importance 排序→向量检索、单会话→多会话、手动关怀→Cloudflare Cron、关键词发言权→多信号调度。每一步都"留好接口再升级"，不要第一版铺太大。
