# 单元4 · LangGraph 实战

> 精读范围：文章 44-61（重点 45,46,47,48,49,50,52,53,58,60,61）
> 学习目标：StateGraph / 状态 Reducer / 条件路由 / Checkpointer / ReAct / 流式 / 中断 / HITL / Store / 运行时上下文 的工程落地。
> 代码均为 TypeScript（`@langchain/langgraph` + `@langchain/core` + `zod`）。

## 核心概念：每条一句话讲清

- **LangGraph 解决的事**：把"显式执行流程 + 结构化状态 + 持久化 + 回退/人工介入"从提示词和消息列表里拿回到代码里，补 `createAgent` 隐式循环撑不住的场景（文章44）。
- **三件套心智模型**：节点（读状态→算→返回部分更新）、边（流转关系）、状态（所有节点共享的有类型对象）——本质是一台显式状态机（文章44）。
- **与 LangChain 是分层不是替代**：LangChain 管"和模型打交道"（ChatModel/Tool/Prompt），LangGraph 管"把步骤串起来"（节点/边/状态/持久化），节点内部照样用 LangChain 组件（文章44）。
- **StateSchema**：用 `new StateSchema({...})` 声明状态结构；`MessagesValue` 是预置的消息字段（追加合并 + 自动反序列化），普通 Zod 字段默认覆盖（文章45）。
- **节点签名**：`(state, runtime?) => Partial<State>`，只返回想改的字段，没返回的保持不变；同步异步皆可，LangGraph 自动处理 Promise（文章45）。
- **GraphNode<typeof State>**：把节点输入输出类型和状态定义绑定，字段拼错编译期报错（文章45）。
- **Reducer = 字段级合并策略**：`(current, update) => merged`，只决定"这一个字段怎么合"；只有当默认覆盖不符合业务语义时才声明（文章46）。
- **三种字段声明**：裸 Zod（覆盖）/ `ReducedValue`（自定义合并，如追加、累加、去重、对象浅合并）/ `MessagesValue`（预置对话合并）（文章46）。
- **条件边 = 分叉 + 循环 + 提前终止**：`addConditionalEdges(源, 路由函数, [候选目标])`；条件边能指回前面的节点形成循环，这是 LangGraph 区别于纯 DAG 的核心（文章47）。
- **路由函数职责**：只读状态做判断、返回目标节点名或 `END`，不改状态、不做计算；可异步、可返回多目标（多目标并行 fan-out）（文章47）。
- **第三个参数是候选目标声明**，不是运行时映射表——真正决定去哪的是路由函数返回值（文章47）。
- **执行模型 = Message Passing / super-step**：一批可并行节点执行完算一个 super-step；无依赖的多条普通边在同一 super-step 并行推进（文章45）。
- **Checkpointer**：每个 super-step 结束后自动存一份完整状态快照，让状态跨越单次 `invoke` 生命周期（文章48）。
- **thread_id**：放在 `configurable` 里的会话标识；相同 ID 共享时间线（多轮记忆），不同 ID 完全隔离（文章48）。
- **时间旅行**：`getState`/`getStateHistory` 查快照，用历史 checkpoint 的 `config` 重新 `invoke`，类似 git checkout，可做"撤回/分叉"（文章48）。
- **ReAct Agent**：模型自主决定调不调/调哪个/传什么参/调几次/何时停；落到 LangGraph 就是 `callModel ⇄ callTools` 的条件边循环，核心图定义只有三行（文章49）。
- **createReactAgent**：`@langchain/langgraph/prebuilt` 的封装，等价于手搓那套两节点循环，不是黑魔法；需在循环里插步骤时才手搓（文章49）。
- **流式输出**：`graph.stream()` 返回异步迭代器，先 `await` 创建流、再 `for await` 逐段消费；真正决定内容的是 `streamMode`（文章50）。
- **streamMode 四选**：`updates` 看增量（执行到哪步）/ `values` 看全量快照（调试）/ `messages` 看模型 token 流（打字机）/ `streamEvents` 看更细的运行事件（工具起止、runnable 起止）（文章50）。
- **Command**：节点直接返回 `new Command({ update, goto })`，在更新状态的同时决定下一步去哪，把"决策上下文"和"路由执行"收进同一个节点（文章51）。
- **Send**：`new Send('节点', 子状态)`，让同一节点并行跑多份、每份不同输入，做 map-reduce / 扇出（fan-out）；并行写同字段必须配 reducer（文章51）。
- **interrupt()**：写在节点代码里的暂停函数，图跑到这行就停、带出提示信息；用 `Command({ resume })` 恢复，返回值即人工回复（文章52）。
- **HITL 审批流**：`interrupt() + Command + Checkpointer + 回退边`组合，落成多级审批（编辑→法务→发布），审批记录用 `ReducedValue` 追加留痕（文章53）。
- **子图**：一个节点背后跑的是另一张图；同状态可直接 `addNode('x', 子图)`，异状态写包装节点做字段映射，目的是模块化和复用（文章54）。
- **多 Agent 三态**：Supervisor（总控派活、收口）/ Handoff（把控制权和上下文交给另一角色连续对话）/ Swarm（角色之间彼此接力转交）（文章55-57）。
- **容错分层**：节点内 try/catch 兜底→把错误写进 `status`/`lastError` 状态→条件边/Command 决定重试或降级→并行分支各存自己的状态→必要时 `interrupt()` 转人工（文章59）。
- **Store**：跨线程的长期记忆，三层结构 `namespace / key / value`；`put/get/search` 三动作；和 Checkpointer 分工——前者记线程即时状态，后者记跨会话长期资料（文章58）。
- **运行时上下文 runtime**：节点第二个参数，承载 `runtime.context`（本次运行的背景，如 userId/teamId/locale）和 `runtime.store`（长期记忆能力）；用 `contextSchema` 在编译期声明边界（文章61）。

## 设计决策与"为什么"

- **把"非确定性推理"和"确定性流程控制"分开**：模型负责理解/生成并把结果写进状态字段，图负责按确定性路由函数流转。这是 LangGraph 全章贯穿的根本设计，避免用自然语言模拟控制流（文章44、47）。
- **状态用"部分更新"而非整体替换**：节点只返回改动字段，配合字段级 reducer，多节点/并行写同一字段才不会互相覆盖。把"这个字段的业务语义"前置思考，比记 API 更重要（文章45、46）。
- **路由逻辑与节点逻辑的取舍——条件边 vs Command**：简单读布尔/枚举用条件边（逻辑分离、清晰）；"算完就知道下一步去哪 + 同时要改状态"用 Command（逻辑集中、代码短）。两者可同图混用，按节点选（文章47、51）。
- **每个循环必须双出口**：业务条件（正常出口）+ 保底条件（最大次数/超时，安全出口）。只有业务条件可能死循环，只有保底会白跑到上限（文章47）。
- **多轮记忆交给 Checkpointer 而非手动拼历史**：同 thread_id 下只传本轮新增消息，历史由 Checkpointer 自动加载 + MessagesValue 追加。底层存储（InMemory/Postgres/Mongo）可无痛替换，因为 compile 接口统一（文章48）。
- **interrupt 选 `interrupt()` 函数而非 `interruptBefore/After`**：前者写在节点里、可条件暂停、能带信息能拿回复，适合生产人工介入；后者是 compile 期静态断点、每次必停、不带信息，仅适合调试（文章52）。
- **恢复时节点从头重跑**：`interrupt()` 之前的代码会再执行一遍，所以必须幂等——副作用（发请求/写库）要放在 `interrupt()` 之后或用状态做幂等检查（文章52、53）。
- **审批信息用结构化字段而非塞进一段文本**：后续要查"第几版谁打回""某关通过率"时，结构化的 `reviewLogs` 才好统计；文本会很快变得无法处理（文章53）。
- **State 与 Context 的边界**：会随流程被节点读写、参与后续决策、需被 checkpoint 记住的→放 `state`（messages/status/draft/reviewLogs）；本次运行附带、节点只读、不属于流程数据的→放 `context`（userId/teamId/locale）。userId 放 context 而非 state，避免状态变胖、避免被当流程字段处理（文章61）。
- **Store 与 Checkpointer 分层**：checkpointer 围绕 thread_id 记"图跑到哪了"，Store 围绕 namespace 记"这个用户长期该被记住什么"。换 thread 不丢长期偏好，靠的是 Store（文章58）。
- **长期记忆"开头读、中间用、结尾写"**：不每轮都写，找专门节点只在真正值得长期保留时写回，Store 才干净；namespace 一开始就要规划好，别 `['user_001']` 和 `['users','user_001']` 混用（文章58、60）。
- **多 Agent 不比谁高级，按需求选**：要统一收口对外回复→Supervisor；要让用户进入某角色上下文连续对话→Handoff；角色之间继续接力→Swarm。Supervisor 比"一个 Agent 挂十几个工具"更稳，因为每层看到的上下文更干净、提示词更短（文章55-57）。
- **容错要从结构里留位置，不是出事后打补丁**：值得重试的是超时/抖动/偶发空；不值得重试的是参数错/权限错/输入本身不成立（直接降级）；灰区交人工。错误必须写进状态，否则图无从决策（文章59）。
- **系统级拆分思路**：复杂 AI 伴侣不是"一次模型调用"，而是一条状态管线——读长期记忆→判意图→进角色子图→调工具/检索→生成回复→写回长期信息→失败走降级。每种能力各回各层，结构才不会越加越乱（文章60）。

## 关键代码/片段

### 最小 StateGraph（定义状态→节点→边→编译运行）
```typescript
import { StateGraph, StateSchema, MessagesValue, START, END } from '@langchain/langgraph'
import type { GraphNode } from '@langchain/langgraph'
import { z } from 'zod'

const State = new StateSchema({
  messages: MessagesValue,                       // 追加合并
  currentStep: z.string().default('init'),       // 默认覆盖
})

const greet: GraphNode<typeof State> = (state) => ({
  messages: [{ role: 'assistant', content: '你好' }],
  currentStep: 'greeted',
})

const graph = new StateGraph(State)
  .addNode('greet', greet)
  .addEdge(START, 'greet')
  .addEdge('greet', END)
  .compile()

const result = await graph.invoke({ messages: [{ role: 'user', content: '小明' }] })
```

### ReducedValue：自定义字段合并（追加 / 累加 / 去重）
```typescript
import { StateSchema, MessagesValue, ReducedValue } from '@langchain/langgraph'
import { z } from 'zod'

const State = new StateSchema({
  messages: MessagesValue,
  totalTokens: new ReducedValue(z.number().default(0), { reducer: (c, u) => c + u }),          // 累加
  results: new ReducedValue(z.array(z.string()).default([]), { reducer: (c, u) => [...c, ...u] }), // 追加
  tags: new ReducedValue(z.array(z.string()).default([]), { reducer: (c, u) => [...new Set([...c, ...u])] }), // 去重
  finalAnswer: z.string().default(''),           // 覆盖
})
```

### ReAct Agent 核心图（手搓版，三行图定义）
```typescript
const model = new ChatOpenAI({ model: 'gpt-4.1-mini' }).bindTools(tools)
const toolsByName = Object.fromEntries(tools.map(t => [t.name, t]))

const callModel: GraphNode<typeof State> = async (state) => ({
  messages: [await model.invoke(state.messages)],
})

const callTools: GraphNode<typeof State> = async (state) => {
  const toolCalls = state.messages.at(-1)!.tool_calls ?? []
  const results = await Promise.all(toolCalls.map(async (tc) => {
    try {
      const result = await toolsByName[tc.name].invoke(tc.args)
      return { role: 'tool' as const, content: result, tool_call_id: tc.id }
    } catch (err) {                              // 工具失败也把错误回给模型，让它自己应对
      return { role: 'tool' as const, content: `工具执行失败: ${err}`, tool_call_id: tc.id }
    }
  }))
  return { messages: results }
}

const shouldContinue: ConditionalEdgeRouter<typeof State, 'callTools'> = (state) => {
  const last = state.messages.at(-1)!
  return last.tool_calls?.length ? 'callTools' : END
}

const graph = new StateGraph(State)
  .addNode('callModel', callModel)
  .addNode('callTools', callTools)
  .addEdge(START, 'callModel')
  .addConditionalEdges('callModel', shouldContinue, ['callTools'])
  .addEdge('callTools', 'callModel')             // 循环回路
  .compile({ checkpointer: new InMemorySaver() })
```

### Checkpointer + 多轮对话（只传本轮新消息）
```typescript
const graph = builder.compile({ checkpointer: new InMemorySaver() })
const config = { configurable: { thread_id: 'chat-001' } }
await graph.invoke({ messages: [{ role: 'user', content: '我叫小明' }] }, config)
await graph.invoke({ messages: [{ role: 'user', content: '我叫什么？' }] }, config) // 记得住
// 生产环境：const checkpointer = PostgresSaver.fromConnString(url); await checkpointer.setup()
```

### 流式三种模式
```typescript
// updates：看执行进度
for await (const chunk of await graph.stream(input, { ...config, streamMode: 'updates' })) {
  if ('callTools' in chunk) console.log('工具结果', chunk.callTools.messages)
}
// messages：打字机
for await (const [msgChunk, meta] of await graph.stream(input, { ...config, streamMode: 'messages' })) {
  if (meta.langgraph_node === 'callModel' && typeof msgChunk.content === 'string')
    process.stdout.write(msgChunk.content)
}
// streamEvents：最细事件
for await (const e of graph.streamEvents(input, { version: 'v2', ...config })) {
  if (e.event === 'on_tool_start') console.log('开始', e.name)
}
```

### Command + Send：一步完成状态更新 + 并行扇出
```typescript
const dispatcher: GraphNode<typeof State> = (state) => new Command({
  update: { status: `处理 ${state.topics.length} 个主题` },
  goto: state.topics.map((t) => new Send('summarize', { topics: [t] })), // 扇出
})
const graph = new StateGraph(State)
  .addNode('dispatcher', dispatcher, { ends: ['summarize'] })  // ends 声明动态目标
  .addNode('summarize', summarize)
  .addEdge(START, 'dispatcher')
  .addEdge('summarize', END)
  .compile()
// summaries 字段必须用 ReducedValue 追加，否则并行写入互相覆盖
```

### interrupt + 恢复（HITL 审核节点）
```typescript
import { interrupt, Command, MemorySaver } from '@langchain/langgraph'

const review: GraphNode<typeof State> = (state) => {
  const decision = interrupt({ message: '请审核', draft: state.draft }) // 图暂停在这一行
  return decision.approved
    ? new Command({ update: { status: 'approved' }, goto: 'publish' })
    : new Command({ update: { feedback: decision.feedback }, goto: 'generate' })
}
const graph = builder.compile({ checkpointer: new MemorySaver() }) // 必须配 checkpointer

const config = { configurable: { thread_id: 'review-001' } }
await graph.invoke({ topic: '...' }, config)                       // 跑到 interrupt 暂停
const info = (await graph.getState(config)).tasks[0]?.interrupts   // 查暂停信息
await graph.invoke(new Command({ resume: { approved: true } }), config) // 恢复
```

### Store + 运行时上下文（跨会话长期记忆）
```typescript
import { InMemoryStore } from '@langchain/langgraph'
const store = new InMemoryStore()
const ContextSchema = z.object({ userId: z.string(), locale: z.string().default('zh-CN') })

const respond: GraphNode<typeof State> = async (state, runtime) => {
  const ns = ['users', runtime.context.userId, 'profile']  // userId 来自 context，不进 state
  const item = await runtime.store?.get(ns, 'preferences') // 跨线程长期资料
  return { notes: [`语气：${item?.value?.tone ?? 'warm'}`] }
}

const graph = builder.compile({ store, contextSchema: ContextSchema })
await graph.invoke({ messages: [...] }, { context: { userId: 'user_001', locale: 'zh-CN' } })
// store.put(ns, key, value) 写 / store.get(ns, key) 取 / store.search(ns, { query }) 找相关
```

## 踩坑点

- **并行写同字段不配 reducer → 互相覆盖**：`Send` 扇出、多条 `addEdge(START, x)`、条件边返回多目标，凡多分支写同一字段都必须用 `ReducedValue`，否则只剩最后一个值（文章46、51、57）。
- **Command 的 goto 是"追加动态出边"，不是"替换出边"**：若同一节点既有普通 `addEdge` 又用 Command goto，两个目标都会执行。要完全交给 Command 路由就别再留普通出边（文章51）。
- **用 Command 路由必须写 `addNode(name, fn, { ends: [...] })`**：goto 运行时才定，编译期靠 ends 做结构校验和可视化，漏写会编译/校验失败（文章51）。
- **interrupt 必须配 checkpointer**：没有持久化就无处保存暂停状态，谈不上恢复（文章52、53）。
- **不要用 try/catch 包裹 interrupt()**：它靠抛 `GraphInterrupt` 实现暂停，被 catch 吞掉就失效；若必须 catch，要 `if (isGraphInterrupt(e)) throw e` 重新抛出（文章52）。
- **interrupt() 之前的代码要幂等**：恢复时节点从头重跑，副作用（发通知/写库/调三方）会重复执行；副作用放到拿到 resume 之后（文章52、53）。
- **恢复时必须沿用同一 thread_id**：换了线程就接不回原审批流（文章52、53）。
- **路由函数里别调 API / 别做随机决策 / 别改状态**：状态字段是路由唯一依据；复杂计算放节点、把结果写进状态，路由函数只做字段判断；同一条边每次经过都会执行路由函数（文章47）。
- **`messages` 流模式下要按 `meta.langgraph_node` 过滤**：一张图可能多个节点吐消息，不过滤会把非模型节点的输出混进打字机流（文章50）。
- **`stream(...)` 前的 `await` 不是冗余**：第一步异步创建可消费的流对象，第二步 `for await` 才逐段读取——两步分离（文章50）。
- **子图异状态要写包装节点**：父子图状态不同时，直接 addNode 子图会污染父图状态，应写节点做字段映射并把 `config` 透传给子图 invoke（文章54）。
- **容错最常见三坑**：只在日志记错误不写进状态（图无从决策）；重试没有出口（无最大次数/无降级，原地打转）；所有失败塞进同一个 `error` 字段（后续无法分类处理）（文章59）。
- **Store 三误用**：短期状态塞进 Store（越堆越脏）；namespace 设计随意（`['user_001']` vs `['users','user_001']` 混用）；把 Store 当数据库替代品（复杂跨表查询应走业务库）（文章58）。
- **Context 误用反向**：会被流程修改/影响后续/需 checkpoint 记住的值（draft/审批状态/已调用工具/失败信息）应留 state，别塞 context（文章61）。
- **runtime 只在节点执行时作为第二参数传入**，图外拿不到（文章61）。
- **API 命名提示**：文中 checkpointer 出现 `InMemorySaver` 与 `MemorySaver` 两种写法，注意按所读章节/版本核对实际导出名（见 problems）。

## 与本项目(AI-Companion)的关联 + 下一步动手建议

**关联**：文章60直接给出了 AI 伴侣的目标管线骨架，与本项目(`/Users/yichen/Desktop/01-active/AI-Companion`)高度对齐：
- 线程级 `StateSchema`（messages/intent/activeRole/retrievedMemories/toolNotes/draftReply/lastError/status）承载单轮对话流转；
- `loadLongTermMemory → routeIntent → 角色子图(schedule/writing/companion) → persistLongTermMemory` 的阶段拆分，对应"陪聊 + 日程 + 写作"多能力；
- `Store` 按 `['users', userId, 'profile']` 存跨会话长期偏好（语气/语言/常用称呼），`Checkpointer` 续接当前会话，`runtime.context.userId` 决定取哪段 namespace；
- `fallbackReply` 容错节点保证某个角色/工具/子图出错时仍有一条可用回复路径。

**下一步动手建议（按依赖顺序）**：
1. **搭主干骨架**：先用 `createReactAgent` + `InMemorySaver` + 一个 `thread_id` 跑通"陪聊 + 多轮记忆"，确认基础闭环；再逐步替换为手搓 StateGraph 以便插入自定义节点。
2. **接长期记忆**：编译时传 `store` 和 `contextSchema({ userId })`，加 `loadLongTermMemory`（开头读）和 `persistLongTermMemory`（结尾按需写）两个节点，验证换 thread_id 后偏好仍在。
3. **意图路由分角色**：用 `routeIntent` 节点 + `Command` 把"日程/写作/陪聊"路由到各自子图，子图内部各挂工具，保持父图只管大阶段。
4. **加 HITL**：对"发邮件/改文案/删数据"这类高风险动作，在子图里用 `interrupt()` 暂停等确认，注意副作用放 resume 之后、保证幂等。
5. **流式接前端**：后端用 `streamMode: 'messages'` 推 token 做打字机、`updates`/`streamEvents` 推"正在调用 XX 工具"的阶段提示；前端按 `meta.langgraph_node` 分流。
6. **补容错层**：每个工具/外部调用节点 try/catch 把错误写进 `lastError`/`status`，对超时/抖动配重试计数 + 回边，对参数/权限错直接走 `fallbackReply`，并行分支各存自己的 status。
7. **生产化 Checkpointer/Store**：开发期 `InMemorySaver`/`InMemoryStore`，上线换 `PostgresSaver`（先 `setup()`），compile 接口统一、迁移成本低。
8. **状态边界自检**：按"流程跑出来的数据→state，运行附带的背景→context"复查现有字段，避免 userId/locale 等混进 state 导致状态膨胀。