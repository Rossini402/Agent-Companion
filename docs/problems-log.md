# 问题记录（学习单元精读中需人工确认的点）

> 由 workflow 各单元 agent 在精读时标注，按单元汇总。

## 单元00 · 认知校准

1. **技术选型为 DeepSeek/GPT/Claude，但全局指令默认 Anthropic 上下文，需确认实际项目用哪家模型**
   - 文章02/03 提到围绕 DeepSeek/GPT/Claude API 构建，体验示例用 DeepSeek 网页聊天，基础设施层用 CloudFlare Workers AI 做 Embedding。项目实际落地时用哪家 LLM 作主模型、哪家做 Embedding 文章未明确锁定（仅说 Workers AI 做向量化），需在动手前与项目实际配置核对，避免成本/可用区/合规上的偏差。属信息缺失，非矛盾。
