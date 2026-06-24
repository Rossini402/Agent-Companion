# 单元3 · LangChain 实战

> 精读范围：文章 25-43（重点 27,28,30,31-34,35,36,39,40,41）
> 主线：**单个 Agent 怎样在一轮请求里调用多个工具，把事情做完**——所有概念都挂在这条线上，不是零散 API 百科。
> 技术栈：LangChain.js v1（`langchain` / `@langchain/core` / `@langchain/{provider}` / `@langchain/classic`），示例多用 DeepSeek（OpenAI 兼容接口）。

---

## 核心概念：每条一句话讲清

- **包分层**：`@langchain/core` 是协议抽象层（Message/Prompt/Runnable/Parser），`langchain` 是应用入口层（`createAgent/tool/initChatModel/middleware`），`@langchain/{provider}` 接具体厂商，`@langchain/classic` 放旧能力（老 Memory、老 chain、`MemoryVectorStore`）（文章25）。
- **四件核心**：`initChatModel()` 接模型、`tool()` 包能力、`createAgent()` 组装、`agent.invoke()/stream()` 接任务，整章围绕这四件展开（文章25）。
- **invoke vs stream**：`invoke()` 一次性拿结果，`stream()` 边生成边拿；Agent 流式要配 `streamMode: 'messages'` 才拿到可直接打印的消息流（文章26）。
- **消息协议**：Agent 真正的输入单位是 `messages`（一组带角色上下文），不是字符串；四种角色 `system`（定身份）/`user`（本轮需求）/`assistant`（自己说过的）/`tool`（工具结果）（文章27）。
- **systemPrompt vs messages**：长期人设/规则放 `systemPrompt`，本轮动态上下文（用户输入、历史、工具结果）放 `messages`（文章27）。
- **Prompt Template**：把输入拆成"固定结构"和"变化变量"，`ChatPromptTemplate.fromMessages` 定结构、`formatMessages()` 填变量产出消息数组；多轮历史用 `MessagesPlaceholder` 占位（文章28）。
- **Few-Shot**：规则告诉模型"该做什么"，示例告诉模型"做出来长什么样"，用 `FewShotChatMessagePromptTemplate` 解决风格/格式/判断粒度不稳，而非补知识（文章29）。
- **Output Parser**：给用户看的输出直接取文本即可，只有"程序要继续消费"的结果才需要结构化；`JsonOutputParser`（文本→JSON）和 `withStructuredOutput()`（模型直接产出 schema）是两条路（文章30）。
- **LCEL / Runnable**：LCEL 是把节点接成管线的写法，Runnable 是统一接口（`invoke/stream/batch`），任何遵守它的节点都能 `.pipe()` 串起来（文章31）。
- **RunnablePassthrough.assign() vs RunnableParallel**：前者"保留原始输入 + 追加派生字段"，后者"只收并行结果对象、丢掉原始输入"；接 Agent 场景几乎都用 `assign()`，因为 Agent 还要看用户原话（文章31,32）。
- **RunnableBranch**：把"不同输入走不同链"写成 `if/else if/else` 结构的路由，最后一个是兜底链，从上到下命中即停（文章33）。
- **withRetry vs withFallbacks**：偶发抖动用 `withRetry()`，整条路不通用 `withFallbacks()`，顺序固定"先 retry 再 fallback"（文章34）。
- **短期记忆两条路**：LCEL 链用 `RunnableWithMessageHistory`（靠 sessionId），Agent 用 `createAgent + checkpointer + thread_id`（文章35）。
- **短期 vs 长期记忆**：短期=会话线程状态（`thread_id`+`checkpointer`），长期=跨会话的用户画像/偏好/事件（单独存数据库，如 D1 的 `user_profiles`/`memories`），两者更新频率不同，不能混在一个线程里滚（文章36）。
- **知识准备链**：Loader 读成 `Document[]` → Splitter 切块 → embedding → 向量库，发生在 Agent 回答之前（文章37,38）。
- **embedDocuments vs embedQuery**：建索引时对文档用 `embedDocuments`，运行时对用户问题用 `embedQuery`，进同一向量空间比相似度（文章38）。
- **RAG 三步**：检索 → 组上下文 → 交给 Agent；检索层和 Agent 层职责必须分开，便于定位"是检索问题还是回答问题"（文章39）。
- **查询重写**：多轮追问常省略主语（"那超过30天呢"），先结合历史补成独立完整问题再检索，但**重写只用于检索，交给 Agent 的 user 消息仍是原话**（文章39）。
- **Tool**：给模型看的"外部能力说明书"（name/description/schema），模型返回 `tool_calls` ≠ 工具已执行，真正执行的是你的程序；Agent 把"请求→执行→回传"循环接管（文章40）。
- **单 Agent 多工具**：一句话里多件事，一个 Agent 在同一轮内可连续调多个工具；对外只暴露一次 `agent.invoke()`（文章41）。
- **Middleware**：贴着 Agent 循环外层的薄壳，用于"这一轮的运行规则"（动态 system prompt、工具过滤、工具错误兜底），不接管具体业务逻辑（文章42）。
- **Tracing / Callbacks**：LangChain 核心组件运行时自动发出 start/end/error 事件，`BaseCallbackHandler` 自动采集，等价于手搭 TraceContext 的 `span()`，区别只在"谁来触发"；LangSmith/LangFuse 都是 `BaseCallbackHandler` 的实现（文章43）。

---

## 设计决策与"为什么"：列出关键取舍及理由

- **为什么 Agent 吃消息数组而非字符串**：长字符串会让"系统规则/用户输入/模型上一轮/工具结果"角色混淆且难维护；结构化消息让上下文分层、可稳定追加（文章27）。
- **systemPrompt 与模板不要写重复**：人设固定在一处、动态上下文交模板管，避免两边冲突或重复维护（文章28）。
- **不是所有输出都 parse**：给用户看的自然语言就是终态，硬过 parser 是过度设计；只有程序要判断/落库的结果才结构化（文章30）。
- **JSON 解析后还要 schema 校验**：JSON 只保证"像对象"，不保证"符合业务约束"（`{emotion:123}` 也是合法 JSON），所以加 zod 一层（文章30）。
- **优先 withStructuredOutput，退回 JsonOutputParser**：支持的 provider 直接产出结构化更稳；不支持时才走"文本 JSON + parser + 校验"（文章30）。
- **LCEL 放在 Agent 前后做"前置链"，而非替代 Agent**：清洗/补字段/分类/并行分析这些确定性逻辑用管线表达，Agent 只负责需要推理的最终回复，分工清晰、可观测（文章31,32,33）。
- **接 Agent 优先用 assign() 而非 RunnableParallel**：Agent 几乎总要继续读用户原话，`RunnableParallel` 丢原始输入会逼你手动透传（文章32）。
- **路由优先 RunnableBranch 而非裸 if/else**：裸 if/else 把路由逻辑甩到链外、断开管线、入口退化成普通函数，不能继续 `.pipe()`/`assign()`/fallback；分支动态来自配置/DB 时才用 RunnableLambda（文章33）。
- **容错分三层、各兜各的**：模型抖动用 `safeModel`(retry+fallback)、前置分析失败给默认值、整条回复链失败给固定保底文案——不把所有失败堆到同一层；面向用户的回复链值得准备纯函数兜底（文章34）。
- **新代码记忆优先级**：先 `RunnableWithMessageHistory` → 再 `createAgent + checkpointer` → classic Memory 只当旧资料对照；理由是新体系把短期状态收进线程层，比手动拼历史更可维护（文章35,36）。
- **长期记忆不塞进线程**：长期资料更新频率低、跨会话复用，塞进线程会无限滚动且 token 涨；正确闭环是"会话前读、会话中 checkpointer 接、会话后提取写回数据库"（文章36）。
- **切块目标是"每块自己能说清一件事"**：太粗检索不准、太碎检索不完整；不同文档用不同 splitter（通用 `RecursiveCharacterTextSplitter`、Markdown 沿标题、代码用 `fromLanguage`）（文章37）。
- **检索层与 Agent 层解耦**：让 Agent"吃已缩小范围的上下文"而非"自己会检索"，出问题能分清是检索还是回答（文章38,39）。
- **RAG 先拉直再加料**：先做最小"检索→回答"，再按需补查询重写/重排/多路/引用，避免一上来堆复杂度（文章39）。
- **工具粒度要窄**：一个工具只做一类明确动作；"万能工具"(`action`+`payload`)让模型更难选工具、更难填参、还要函数内二次分发（文章40,41）。
- **schema 的 .describe() 是给模型看的**：不是注释，是参数说明，直接影响模型能否调对、填对（文章40）。
- **Middleware 边界判据**：删掉这段逻辑后工具仍能独立成立 → 适合 middleware；删掉后工具不完整 → 应回工具函数写。运行规则（深夜模式/权限/工具暴露/错误兜底）横跨整链，不属于单个工具（文章42）。
- **深夜过滤工具 > 只改 prompt**：模型根本看不到高风险工具就不会调，比靠 prompt 劝阻更硬（文章42）。
- **Callbacks vs 手搭 TraceContext**：纯 LangChain 管线用 Callbacks 即可（框架自动埋点）；管线含大量非 LangChain 自定义逻辑时两者混用最务实（用 `traceable` 包自定义函数）（文章43）。

---

## 关键代码/片段

### 最小 Agent（createAgent + tool + invoke）
```ts
import * as z from 'zod'
import { createAgent, initChatModel, tool } from 'langchain'

const model = await initChatModel('gpt-4.1-mini', { modelProvider: 'openai' })

const getWeather = tool(
  async ({ city }) => `${city} 明天有小雨，记得带伞`,
  {
    name: 'get_weather',
    description: '查询某个城市未来的天气情况',
    schema: z.object({ city: z.string().describe('要查询天气的城市名') }),
  },
)

const agent = createAgent({
  model,
  tools: [getWeather],
  systemPrompt: '你是一名细心、自然的生活助手。',
})

const result = await agent.invoke({
  messages: [{ role: 'user', content: '查一下上海明天会不会下雨' }],
})
console.log(result.messages.at(-1)?.text)
```

### DeepSeek（OpenAI 兼容）显式建模型 + 流式
```ts
import { ChatOpenAI } from '@langchain/openai'
const model = new ChatOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1' }, // baseURL 必须带 /v1
})
const stream = await model.stream([{ role: 'user', content: '一句话验证流式' }])
for await (const chunk of stream) process.stdout.write(chunk.text)
```

### Prompt Template + 多轮历史占位
```ts
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
const prompt = ChatPromptTemplate.fromMessages([
  new MessagesPlaceholder({ variableName: 'history', optional: true }),
  ['user', ['用户昵称：{nickname}', '当前场景：{scene}', '本轮输入：{input}'].join('\n')],
])
const messages = await prompt.formatMessages({ history: [], nickname: '小林', scene: '下班路上', input: '今天有点烦' })
await agent.invoke({ messages })
```

### Output Parser：JSON + zod 校验
```ts
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'
const parser = new JsonOutputParser()
// prompt 里拼 parser.getFormatInstructions() 强制模型只输出 JSON
const chain = prompt.pipe(model).pipe(parser)
const raw = await chain.invoke({ input: '今天越改越乱，有点烦。' })

const emotionSchema = z.object({
  emotion: z.enum(['calm', 'anxious', 'sad', 'angry']),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
})
const safe = emotionSchema.safeParse(raw) // 业务约束在这一层兜
```
模型支持时直接用结构化输出：`const structured = model.withStructuredOutput(emotionSchema)`。

### LCEL 前置链（assign 补字段 → 交给 Agent）
```ts
import { RunnableLambda, RunnablePassthrough } from '@langchain/core/runnables'
const preProcess = RunnablePassthrough
  .assign({ trimmedInput: ({ input }: { input: string }) => input.trim() })
  .pipe(RunnableLambda.from(({ trimmedInput }: { trimmedInput: string }) => ({
    trimmedInput,
    priority: trimmedInput.includes('线上') ? 'high' : 'normal',
  })))
const p = await preProcess.invoke({ input: '  线上刚出故障  ' })
await agent.invoke({ messages: [{ role: 'user', content: `priority=${p.priority}\ninput=${p.trimmedInput}` }] })
```
> 注意：LCEL 子链 prompt 里写字面 JSON 要双花括号转义 `{{"emotion":""}}`，否则被当模板变量。

### 分类 + 路由（RunnableBranch）
```ts
import { RunnableBranch, RunnablePassthrough } from '@langchain/core/runnables'
const routeByIntent = RunnableBranch.from([
  [({ intent }: { intent: string }) => intent.trim() === 'tech', techPrefilter],
  [({ intent }: { intent: string }) => intent.trim() === 'emotional', emotionalPrefilter],
  casualPrefilter, // 兜底
])
const preProcess = RunnablePassthrough.assign({ intent: classifyChain }).pipe(routeByIntent)
```

### 容错：先 retry 再 fallback
```ts
const safeModel = primaryModel
  .withRetry({ stopAfterAttempt: 2 })          // 总共 2 次
  .withFallbacks([backupModel.withRetry({ stopAfterAttempt: 2 })])
// 顺序反过来语义就错了
```

### 短期记忆（Agent + checkpointer + thread_id）
```ts
import { createAgent, summarizationMiddleware } from 'langchain'
import { MemorySaver } from '@langchain/langgraph'
const agent = createAgent({
  model: 'gpt-4.1', tools: [],
  middleware: [summarizationMiddleware({ model: 'gpt-4.1-mini', trigger: { tokens: 4000 }, keep: { messages: 20 } })],
  checkpointer: new MemorySaver(), // 仅本地调试，重启即丢
})
const config = { configurable: { thread_id: 'companion-user-001' } }
await agent.invoke({ messages: [{ role: 'user', content: '我今天加班到很晚' }] }, config)
```

### 知识准备：Loader → Splitter
```ts
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
const rawDocs = await new PDFLoader('./data/handbook.pdf').load()
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 })
const chunks = await splitter.splitDocuments(rawDocs) // splitDocuments 保留原 metadata
```
起步参数：通用 700~1000/80~150，代码 1000~1500/120~200，FAQ 200~500/20~60。

### 最小 RAG（检索 → 组上下文 → Agent）
```ts
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { OpenAIEmbeddings } from '@langchain/openai'
const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' })
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings)

async function runRAG(question: string) {
  const docs = await vectorStore.similaritySearch(question, 3) // 内部对 question 做 embedQuery
  const context = docs.map((d, i) => `资料 ${i + 1}：${d.pageContent}`).join('\n\n')
  const result = await agent.invoke({
    messages: [
      { role: 'system', content: `只依据下面资料回答，资料没有就说不知道。\n参考资料：\n${context}` },
      { role: 'user', content: question },
    ],
  })
  return result.messages.at(-1)?.text ?? ''
}
```
返回太重复换 `maxMarginalRelevanceSearch`（MMR，调 `k/fetchK/lambda`）。

### Tool 手动循环（理解 tool_calls 本质）
```ts
const modelWithTools = model.bindTools(tools)       // 只交说明，不执行
const ai = await modelWithTools.invoke(messages)
messages.push(ai)
for (const call of ai.tool_calls ?? []) {
  const toolMsg = await toolMap.get(call.name)!.invoke(call) // 真正执行，返回带 tool_call_id 的 ToolMessage
  messages.push(toolMsg)
}
const final = await modelWithTools.invoke(messages) // 用 Agent 时这套循环交给 createAgent
```

### Middleware：动态 system prompt + 工具过滤 + 错误兜底
```ts
import { createAgent, createMiddleware, dynamicSystemPromptMiddleware, ToolMessage } from 'langchain'
// 1. 按运行时 context 切换说话方式
dynamicSystemPromptMiddleware((state, runtime) =>
  runtime.context.isQuietHours ? '深夜模式：先安抚，高风险操作让用户白天再确认' : '正常生活助理')
// 2. 深夜过滤高风险工具
const filter = createMiddleware({
  name: 'QuietHoursToolFilter',
  wrapModelCall: (req, handler) => req.runtime.context.isQuietHours
    ? handler({ ...req, tools: req.tools.filter(t => t.name !== 'cancel_schedule') })
    : handler(req),
})
// 3. 工具报错转成 ToolMessage，不撞断对话
const handleErr = createMiddleware({
  name: 'HandleToolErrors',
  wrapToolCall: async (req, handler) => {
    try { return await handler(req) }
    catch (e) { return new ToolMessage({ content: `工具失败：${String(e)}`, tool_call_id: req.toolCall.id! }) }
  },
})
// 调用时传 context：agent.invoke(input, { context: { isQuietHours: true } })
```

### Tracing：挂 CallbackHandler
```ts
// 自建：继承 BaseCallbackHandler，覆盖 handleChatModelStart/handleLLMEnd/handleToolStart/... 用 runId 配对 span
// 接入：构造时传 callbacks（向下传播全局生效）或调用时传（单次生效），可同时挂多个
const result = await agent.invoke(input, { callbacks: [traceHandler, langfuseHandler] })
// LangSmith 设环境变量 LANGSMITH_TRACING=true 即零代码自动接入
```

---

## 踩坑点：易错点与边界

- **DeepSeek baseURL 必须带 `/v1`**，少了直接报错（文章26）。
- **Agent 流式忘了 `streamMode: 'messages'`**：拿到的是运行时事件结构，不能直接打印文字（文章26）。
- **systemPrompt 与 Prompt Template 重复写 system**：人设固定一处，动态上下文交模板，否则冲突难调（文章28）。
- **Few-Shot 堆例子比赛**：无关样例多了会淹没当前输入；few-shot 与 history 争上下文长度，历史多就减 few-shot（文章29）。
- **以为 JSON 合法就能用**：`{emotion:123,confidence:"high"}` 是合法 JSON 但业务不可用，必须 zod 校验（文章30）。
- **兜底当正常结果**：解析失败的默认值只是失败分支，别当通用默认策略，有些节点更该重试或中断（文章30）。
- **LCEL 子链 prompt 里的字面 JSON 没转义**：`{emotion}` 会被当模板变量，必须写 `{{...}}`（文章32）。
- **RunnableParallel 丢原始输入**：接 Agent 时几乎都该用 `assign()`（文章32）。
- **retry/fallback 顺序写反**：必须先 retry 再 fallback，反了语义就错（文章34）。
- **MemorySaver 当生产持久化**：它只是内存版，服务重启数据全丢，生产要换数据库型 checkpointer（文章35,36）。
- **长期记忆塞进会话线程**：会无限滚动、token 暴涨；应单独存数据库并"会话后提取写回"，否则长期记忆永不更新（文章36）。
- **切块太粗/太碎**：检索"总缺半句"通常块太小或 overlap 不够，"什么都沾一点"通常块太大话题混了；用 5~10 个真实问题跑检索来判断（文章37）。
- **embedDocuments / embedQuery 混用**：建索引用前者、查询用后者（文章38）。
- **MemoryVectorStore 当持久化**：重启即丢，迁移时切块/embedding 代码基本不动，只换 vector store 层（Pinecone/Chroma/Vectorize）（文章38）。
- **查询重写后用重写问题当 user 消息**：重写只用于检索，交给 Agent 的 user 仍是原话，否则回答语气生硬（文章39）。
- **tool 的 description 太空 / schema 太宽 / 万能工具**：模型选不对、填不稳；`.describe()` 不能省（文章40,41）。
- **以为 bindTools 后自动执行**：`tool_calls` 只是请求，没用 Agent 就得自己跑工具循环（文章40）。
- **只盯最终回复不看中间消息**：怀疑 Agent 漏调/调错工具时，打 `result.messages`（看 `getType()`）比改 prompt 更有效（文章41）。
- **多件事漏处理**：systemPrompt 没写"按顺序处理"，模型可能只做第一件（文章41）。
- **把业务逻辑写进 Middleware**：middleware 只放运行规则，具体业务回工具函数；判据=删掉后工具是否仍独立成立（文章42）。
- **Serverless 下 Callbacks 来不及上报**：函数销毁前后台回调没跑完；设 `LANGCHAIN_CALLBACKS_BACKGROUND=false` 同步执行，或配 `waitUntil` 异步刷新；LangFuse 记得 `flushAsync()`（文章43）。

---

## 与本项目(AI-Companion)的关联 + 下一步动手建议

**强关联点（这门课就是按本项目"AI 电子伴侣"场景写的）**
- 场景完全对口：陪伴助手、情绪识别、查天气/建提醒/查日程工具、深夜模式、长期记忆（用户画像/偏好/事件），可直接照搬到本项目（文章25,40,42,36）。
- 部署栈对齐：课程明确假设主系统跑在 Cloudflare，长期资料放 D1（`conversations`/`user_profiles`/`memories`），线程状态交持久化 checkpointer——与本知识库 06-Hono.js与Cloudflare、07-Zod 单元能串成完整后端（文章36）。
- 单元 04-LangGraph 是本单元的自然延伸：`checkpointer`/`thread_id`/`MemorySaver` 已来自 `@langchain/langgraph`，多角色/审批/回退场景从单 Agent 升级到 LangGraph（文章35,41 结尾）。
- 单元 01 的可观测性（TraceContext/采样/分层存储）与文章43 的 Callbacks 一一映射，可用 Callbacks 重写自建埋点（文章43）。

**建议的动手顺序（从能跑到能上线）**
1. **跑通三连**：建 `playgrounds/langchain-first-call`，按文章26 跑 `first-call / first-stream / first-agent`，确认 DeepSeek 连通（注意 baseURL 带 `/v1`）。
2. **搭情绪识别判定节点**：用文章30 的 `JsonOutputParser + zod`（或 `withStructuredOutput`）做一个独立结构化节点，输出 `{emotion, confidence, summary}`，作为 Agent 前置分析。
3. **拼 Agent 前置链**：文章31-33，用 `assign()` 并行补 emotion/keywords/risk，再用 `RunnableBranch` 按意图路由（tech/emotional/casual），交给陪伴 Agent。
4. **加三层容错**：文章34，模型层 retry+fallback、前置分析失败给默认值、回复链给纯函数保底文案（陪伴产品面向用户，这层值得做）。
5. **接记忆双层**：文章35-36，短期用 `createAgent + checkpointer + thread_id`，长期用 D1 + "会话前读 / 会话后提取写回"闭环；本地用 MemorySaver，上线换持久化 checkpointer。
6. **接 RAG（按需）**：文章37-39，把用户日记/产品手册做 Loader→Splitter→embedding→向量库，最小"检索→组上下文→Agent"先跑通，多轮加查询重写。
7. **接多工具 + Middleware**：文章40-42，定义窄粒度工具（查天气/建提醒/查日程），用 `dynamicSystemPromptMiddleware` 做深夜模式、`wrapModelCall` 过滤高风险工具、`wrapToolCall` 兜工具错误。
8. **接 Tracing**：文章43，本地挂自建 `TraceCallbackHandler` 做采样决策，平台侧设 `LANGSMITH_TRACING=true` 或挂 LangFuse `CallbackHandler`；Cloudflare 记得 `LANGCHAIN_CALLBACKS_BACKGROUND=false` + `waitUntil`。
