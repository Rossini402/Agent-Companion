# 问题记录（学习单元精读中需人工确认的点）

> 由 workflow 各单元 agent 在精读时标注，按单元汇总。

## 单元00 · 认知校准

1. **技术选型为 DeepSeek/GPT/Claude，但全局指令默认 Anthropic 上下文，需确认实际项目用哪家模型**
   - 文章02/03 提到围绕 DeepSeek/GPT/Claude API 构建，体验示例用 DeepSeek 网页聊天，基础设施层用 CloudFlare Workers AI 做 Embedding。项目实际落地时用哪家 LLM 作主模型、哪家做 Embedding 文章未明确锁定（仅说 Workers AI 做向量化），需在动手前与项目实际配置核对，避免成本/可用区/合规上的偏差。属信息缺失，非矛盾。

## 单元01 · 记忆与调度

1. **文章06 的 Embedding 模型语言不匹配（中文场景用英文模型）**
   - 文章06 全程对中文记忆（如'用户生日去 Blue Note 听爵士'）调用 `@cf/baai/bge-base-en-v1.5`——这是英文 embedding 模型，处理中文语义质量会明显下降。本项目是中文陪伴 Agent，落地时应改用多语言/中文模型（如 bge-m3 或 multilingual-e5），需人工确认课程是笔误还是确实计划用英文模型。

2. **文章04 的'两个限制'实际列了三条**
   - 文章04 第32行'主要有两个限制'，下面却列了 3 点（Token 有限、成本与延迟、不区分重要与闲聊）。表述与内容不一致，属原文小瑕疵，不影响理解但读时会卡一下。

3. **项目 agent_memories.status 的 deleted 与课程'遗忘权硬删'冲突**
   - 文章04 强调遗忘权必须物理硬删（Hard Delete）向量库+关系库；而本项目 `agent_memories` 用 `status='deleted'` 做逻辑删除。两者在合规语义上冲突，需确认阶段1是有意先做逻辑删除（后续补硬删流程），还是会被误当成已满足遗忘权。

4. **课程把情绪/摘要归到 KV，本项目尚无 KV 层**
   - 文章09 明确情绪快照/短期上下文存 CloudFlare KV、摘要/画像存 D1；但本项目阶段1 只见 D1（migrations + drizzle schema），未见 KV 绑定。落地情绪状态机和短期上下文缓存时，是沿用课程的 KV 方案还是全部压到 D1，需要架构层面确认（影响热数据读取延迟）。

## 单元02 · 编排选型

1. **createAgent 的 API 形态在文章内部不一致，需核对当前 LangChain JS 版本**
   - 文章21 首例 `agent.invoke("告诉我今天天气怎么样")` 传纯字符串，而文章22/23 用 `agent.invoke({ messages: [{ role, content }] })` 传消息数组对象。两种调用签名混用，落地前需确认所用 LangChain JS 版本下 createAgent/invoke 的确切入参形态（字符串简写是否仍支持），以免运行时报错。

2. **文章05 与文章10/21-24 的三层定位措辞存在张力，需统一心智模型**
   - 文章05 把 LangChain 比作'器官/肢体/砖块'、LangGraph 比作'大脑/神经中枢/工头'，强调 LangGraph 是调度宿主、LangChain 是原子能力执行者；而文章21-24 的框架是 core(接口)→LangChain(组装单 Agent)→LangGraph(流程与多 Agent)，强调 LangGraph'先解决流程编排再解决多 Agent'。两套比喻方向一致但侧重不同（一个偏'调度大脑'、一个偏'流程编排'），初学者易混淆 LangGraph 到底是'决策大脑'还是'流程图'。建议以 21-24 的较新框架为准（文章21 开头注明是重新梳理的体系），把05 当作早期版本理解。

3. **文章10 第2节并行串行延迟示例的具体数字与第4/5节表格不完全自洽**
   - 第5节文字算例用'查询理解200ms + 记忆检索100ms + 情绪读取10ms'，而第4节节点表给出查询理解100-300ms、记忆检索50-150ms、情绪读取5-15ms。数字是举例区间取值，不影响结论（并行价值在可扩展性而非省这10ms），但若直接引用具体数值需注意它们是示意而非测得基准。

## 单元03 · LangChain 实战

1. **createAgent 的 model 入参形态在文章内不一致，需确认 v1 真实签名**
   - 文章26/27/28 把 ChatOpenAI 实例传给 createAgent({ model })；文章35/38/39/40/41/42/43 又直接传字符串 'openai:gpt-4.1-mini' 或 'gpt-4.1'。两种写法散落各处未统一说明，且字符串形态依赖 OPENAI_API_KEY 而示例多用 DeepSeek。落地时需核对 LangChain.js v1 中 createAgent 对 model 字段到底接受实例、字符串还是两者皆可，避免照抄报错。

2. **summarizationMiddleware 的参数结构未在正文给出依据**
   - 文章35 用 summarizationMiddleware({ model, trigger: { tokens: 4000 }, keep: { messages: 20 } })，但 trigger/keep 的字段语义和单位（tokens vs messages）未展开，也未说明触发后保留策略细节。这是新 API，建议对照官方文档核实字段名再用。

3. **RunnableWithMessageHistory 依赖 classic 包，与'新代码优先'存在张力**
   - 文章35 把 RunnableWithMessageHistory 列为'LCEL 链优先选择'，但其历史存储 ChatMessageHistory 来自 @langchain/classic/stores/message/in_memory；同时文章又反复强调 classic 仅作旧资料对照。LCEL 链的短期记忆方案在 v1 里是否仍推荐、是否有非 classic 的替代，需确认。

4. **withStructuredOutput 示例临时切到 OpenAI，DeepSeek 可用性未明确**
   - 文章30 指出 withStructuredOutput 可用性取决于 provider/model，示例切到 gpt-4o-mini。本项目若主用 DeepSeek，需实测 deepseek-chat 是否支持结构化输出；不支持则必须走 JsonOutputParser + zod 退路，文档应明确这一项目级结论。

5. **Callbacks 事件方法签名为简化版，runId 等参数顺序需以源码为准**
   - 文章43 的 handleChatModelStart/handleToolStart 等只列了 (serialized, input, runId) 三个参数，但 LangChain 实际回调通常还带 parentRunId、tags、metadata、extraParams 等。自建 handler 落地时应以 BaseCallbackHandler 真实方法签名为准，文中签名为教学简化。

## 单元04 · LangGraph 实战

1. **Checkpointer 导出名两处不一致（InMemorySaver vs MemorySaver）**
   - 文章48（Checkpointer）通篇用 `import { InMemorySaver } from '@langchain/langgraph'`，而文章52（中断机制）、53（HITL）改用 `MemorySaver`。两者在文中均未说明是别名还是不同 API。落地前需对照实际安装的 @langchain/langgraph 版本核对真实导出名（很可能其一为旧名/别名），否则会 import 报错。

2. **节点第二参数命名在不同文章里不统一（config vs runtime）**
   - 文章45/54 把节点第二参数叫 `config`，从 `config.configurable.user_id` 读运行时参数；文章58/61/60 改叫 `runtime`，从 `runtime.context.userId` 和 `runtime.store` 读。同时调用侧也有 `{ configurable: { user_id } }`（文章45/48）与 `{ context: { userId } }`（文章58/61）两套传参写法并存。读者容易混淆——这可能是 LangGraph.js 新旧 API 演进（configurable → runtime context）的过渡，需确认当前版本到底用哪一套，避免 context 传进去却在节点里读不到。

3. **消息内容读取属性不一致（.content vs .text）**
   - 大部分文章用 `msg.content` 读消息内容，但文章58/60/61 多处用 `state.messages.at(-1)?.text` 和 `message.text`。.text 是否为当前版本 LangChain 消息对象的有效属性需核对，否则可能取到 undefined。

4. **StateSchema/MessagesValue/ReducedValue 等 API 名称偏新，需与官方对齐**
   - 文中大量使用 `new StateSchema({...})`、`MessagesValue`、`new ReducedValue(schema, { reducer })`、`GraphNode`、`ConditionalEdgeRouter` 等。这套是较新的 LangGraph.js 写法，与早期官方文档常见的 `Annotation.Root`/`Annotation` API 差异较大。落地时建议先以实际安装版本的类型定义为准，确认这些符号确实从 `@langchain/langgraph` 导出。

## 单元05 · 工程底座

1. **中文 embedding 模型选型需结合实际效果定**
   - 文章96指出 Workers AI 自带的 bge 系列对中文'凑合'，推荐 bge-m3 或 text-embedding-3-large。AI-Companion 的长期记忆/RAG 检索精度依赖中文 embedding 质量，最终选型（自托管 vs 第三方付费）需根据真实语料做检索精度评测后确认，本笔记无法替项目决策。

2. **群聊场景是否上 Durable Objects 需架构层确认**
   - 文章97的 DO+WebSocket 方案非常契合群聊底座(191-195)与主动关怀(190)，但 DO 有计费、并发瓶颈（单实例每秒几千请求即瓶颈）与运维复杂度。是否用 DO、还是沿用无状态 + LangGraph 编排，需结合群聊并发量与现有 LangGraph 实现做架构权衡。

3. **密码哈希算法在本项目的实际实现待核实**
   - 文章93明确 SHA-256 加盐仅教学用，生产应用 PBKDF2。需确认 AI-Companion 现有认证实现(155「服务端 token 签发与算法」、160「jwt.ts」)是否已用 PBKDF2/合规算法，避免沿用教学示例的弱哈希。

4. **Zod 版本以 v3 为准，落地前需确认项目实际依赖版本**
   - 专栏明确基于 Zod v3（^3.24.1），并指出 v4 有破坏性差异：z.string().email() → 顶层 z.email()、错误格式化 API 变化、.deepPartial() 被移除（需手工逐层 partial）。若 AI-Companion 项目实际安装的是 Zod v4，文中部分 API（尤其 email/deepPartial/错误格式化）需相应调整，建议先 `pnpm list zod` 确认版本再照搬代码。

5. **Hono RPC + monorepo 结构是否采用待项目确认**
   - 文章113/115 的端到端类型链路（hc<AppType>、packages/shared、packages/server-types）假定 monorepo + Hono RPC client 架构。AI-Companion 若是单体或前端用其他框架（如 Vue，按全局规范现役为 Vue3+TS 而非文中的 React+react-hook-form），zodResolver 表单与 RPC client 部分需替换为对应生态方案（Vue 可用 vee-validate 的 zod 适配或 @tanstack 系列），不能直接照搬 React 代码。

## 单元06 · Vercel AI SDK 与 Agent 大脑

1. **模型版本号为课程虚构，落地时需替换**
   - 文章中出现 claude-opus-4-6 / claude-sonnet-4-5 / gpt-5 / 课程日期 2026-04-01 等版本号与时间，属课程设定的「未来」命名，并非真实可用模型 ID。在 AI-Companion 实际接入时需替换为当前真实可用的模型（如对应的 Claude/GPT/Gemini/DeepSeek 实际 modelId），并以各 Provider 官方文档为准。

2. **部分 API 仍标 experimental，需核对最新 SDK 版本**
   - experimental_createMCPClient、experimental_useObject、ai/rsc（streamUI/createStreamableUI）等在文章成文时为 experimental，API 可能调整。落地前建议核对项目实际安装的 ai / @ai-sdk/react 版本与官方 changelog，避免按笔记直接抄到的签名与实际不符。

3. **Workers MCP 与 OAuth 包名需确认**
   - 文章用 @cloudflare/mcp-agent（提到也叫 workers-mcp）、resumable-stream、langfuse-vercel 等包，Cloudflare MCP/OAuth 生态变动较快。实际选型时需确认这些包的当前维护状态与正确包名（Cloudflare 官方 agents/MCP 方案可能已更名或合并）。

4. **文章166-168、171-172、174-175 未逐篇精读，可能遗漏细节**
   - 本次重点精读了 137-165、169、170、173。未逐字通读的有：166头像存储、167角色管理、168订阅与套餐、171结果逐字输出、172 GitHub 授权登录、174部署Next、175部署Hono。其中 172(GitHub OAuth) 属于认证链路，本文档基于 152/154 的 OAuth 设计原则做了概括，但未覆盖 172 的具体实现代码。若需要 OAuth 登录/绑定的逐步代码细节，建议补读 172。

5. **原文存在笔误，已沿用但需确认**
   - 文章137 正文里 web/admin 端口在不同段落出现 3000/3001 与 3005/3006 两种说法(脚手架默认 vs 实际改后)，文档采用后文一致的 3005/3006；migration 文件名原文写作 0001_admin_atuh.sql(疑似 auth 拼写笔误)，文档按原文保留。落地时以实际仓库为准。

## 阶段2设计 · 对话理解链

1. **用户消息落库时机后移，与阶段1「LLM 前先落库」原则的取舍**
   - 阶段1 明确「用户消息先落库（LLM 调用前，失败也不丢）」。但文章 183/184/185/187 都把理解结果写在 user 消息的 metadata 上，要求落库时已有分析结果。本设计把落库点从「LLM 前」后移到「理解链后、生成前」。理解链全程兜底（最坏拿 fallback、不抛错），所以仍能保证落库不被阻塞——但严格来说，若理解链耗时较长（3 次串行 LLM 调用）期间进程崩溃，用户消息会丢。备选方案A：先落库 content（无 metadata），理解链结束后 UPDATE 回填 metadata（多一次写，但完全保留'先落库'语义）。备选方案B（本文采用）：理解链后一次性落库。需确认走 A 还是 B。

2. **理解链串行 3 次 LLM 调用带来的首字延迟**
   - intent→emotion→relationshipStage 三个 LLM 节点串行执行，叠加在用户发消息到首个 SSE delta 之间，会显著增加首字延迟（推理模型 deepseek-v4-flash 单次判断可能 1-3s，三次累计可能 3-9s）。文章用 LangGraph 也是串行，但本项目是陪伴聊天，延迟敏感。需确认是否接受，或 v1 先只上 intent+route+policy（砍掉 emotion/stage 的 LLM 调用，用规则近似），后续再补。

3. **deepseek-v4-flash 是推理模型，response_format:json_object 支持度未实测**
   - DeepSeek 推理模型（带思维链）对 response_format:json_object 的支持，以及是否会在 content 前混入推理过程文本，需真实联调确认。若 content 夹带思维链，extractJson 的'截取首个 {...}'可能误截。退路已设计（剥围栏+截子串+重试+去 response_format），但实际行为需在验证步骤6前先单独打一次真实调用确认 content 形态。

4. **agentGuardrails 复用 default_prompt，无独立边界字段**
   - 文章中意图/情绪/关系阶段判断都吃 agentGuardrails（Agent 自定义边界规则），来自 agentPrompt.guardrailsPrompt。但阶段1 user_agent_companions 只有 default_prompt，无独立 guardrails 列。本设计用 default_prompt 兼任 agentGuardrails。若需要真正的边界规则隔离，需在 Agent 资产表加字段（属阶段1/资产侧改动，本阶段未纳入）。

5. **安全边界（safety）在 v1 缺位，理解链顺序与文章不完全一致**
   - 文章链路是 safety→intent→emotion→stage→route→policy，且 safety 结果会喂给后续每个节点、并在 soft_boundary 时强制 route=calm_deescalation。阶段1 无安全层，本设计 safety 全程置 null（metadata 占位、route/policy 里 safety 分支短路为不触发）。这意味着 v1 缺少'高风险输入先拦截/降温'能力。需确认安全边界是放在阶段2补齐，还是单列阶段（建议单列，避免本阶段范围膨胀）。

6. **记忆候选判断（文章188）归属阶段划分**
   - 188 的记忆候选判断属于回复'后'处理（在 §⑧ 记忆抽取前加闸门），与本阶段'生成前理解链'目标正交。本文将其列为可选 commit 并给出落点（复用现有 fastRejectMemory 扩成 judgeMemoryCandidate），但是否纳入阶段2、还是与阶段3'记忆抽取 LLM 化'一起做，需确认。

## 阶段3设计 · 安全与质量护栏

1. **user_agent_companions 是否真有 guardrails_prompt 列需核实**
   - 文章182 依赖 Agent 的 guardrails_prompt 做自定义边界规则，本设计在读 default_prompt 时一并 SELECT guardrails_prompt。但阶段1 代码只 SELECT default_prompt，未确认该列在本项目 user_agent_companions 表中实际存在。若不存在需先加迁移，或安全判断的 agentGuardrails 暂传 null（功能可降级运行，但失去 Agent 级边界差异）。落地前请核对 D1 schema。

2. **deepseek-v4-flash 推理模型可能返回 reasoning 内容污染 JSON**
   - 推理模型常在 message.content 前混入思考过程或 ```json 包裹。设计已用正则抠取第一个 {…} + zod 兜底 + 2 次重试缓解，但若中转 API 把 reasoning 也塞进 content 且含 { }，正则可能抠错片段。需在真实联调中观察首条返回原文，必要时改用「抠最后一个完整对象」或要求模型用特定分隔符。属需实测确认的风险点。

3. **前置短路分支是否要更新 summary 与 messageCount 的口径**
   - 短路（refuse/crisis）时本设计把预设 assistant 文本计入 messageCount 并推进 lastMessageAt，但未滚动 summary（避免把危机原话写进长期摘要、与 allowMemoryExtraction=false 的保守取向一致）。这是有意取舍：好处是危机内容不污染摘要，代价是该轮上下文不进摘要、后续对话衔接可能略生硬。是否接受需产品确认；若要衔接更自然，可只把『助手给出了安全提示』这类中性占位写入 summary。

4. **安全判断为同步前置，给首字延迟增加一次非流式 LLM 往返**
   - S1 是阻塞式（必须在写用户消息和流式回复之前完成），deepseek-v4-flash 作为推理模型的非流式补全可能有数百毫秒到数秒延迟，直接抬高聊天首字时间。文章182 接受此代价（安全 > 体验）。若延迟不可接受，备选：对明显低风险输入做本地 fast-pass 跳过 LLM（但会牺牲部分判断质量），需权衡。

## 阶段4设计 · 主动与成长

1. **反馈注入 vs 长期记忆抽取的语义重叠未消歧**
   - 阶段1的记忆抽取会把『以后回复我直接一点』这类显式偏好抽成 agent_memories(type=偏好) 注入 prompt；阶段4 的负反馈(too_long/too_cold)同样注入 prompt。两者可能对同一偏好重复施压、甚至措辞冲突。v1 文档将反馈段与记忆段并列放在 system，但未定义优先级或去重。需确认：是否容忍这种轻微重复（与 stage1 默认风格一致，简单优先），还是要在 v2 做『反馈→偏好画像』归一。

2. **流式刚结束的回复无法立即反馈（messageId 时序）**
   - 189 明确指出流式输出结束瞬间，前端持有的可能是临时 ID 而非 D1 messageId，因此只对『服务端历史返回过的 assistant 消息』开放反馈按钮（persistedAssistantMessageIds）。但 stage1 的 /chat SSE done 事件已回传 assistantMessageId（agent-chat.ts:167-170），理论上可让刚生成的回复也能立即反馈。需确认 v1 是沿用 189 的保守策略（仅历史消息可点），还是利用 done 事件的 assistantMessageId 放开即时反馈——前者体验差一点但绝不误提交，后者需前端把 done.assistantMessageId 写回当前消息。

3. **care 端点鉴权层级与现有 /agent 前缀的归属**
   - 190 原文关怀路由在 /rpc/agent/my/:agentId/care-*，且 repository 放在 auth/repository.ts；本项目 stage1 是 agentChatRoutes(/agent 前缀)+services/agent-chat。文档已对齐到本项目结构(/agent/care/:agentId/*)，但需确认 Agent 归属校验：stage1 /chat 里用裸 SQL 查 user_agent_companions(agent-chat.ts:78-82) 验证归属，care 端点是否复用同一查询，避免用户给不属于自己的 agentId 生成关怀消息。
