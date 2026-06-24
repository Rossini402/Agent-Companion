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
