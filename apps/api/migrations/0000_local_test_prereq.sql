-- 本地测试前置：最小 users / user_agent_companions + 种子数据
-- 生产环境这两张表由「认证篇 / Agent 资产篇」提供，本文件仅供本地联调，勿用于线上。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_agent_companions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  default_prompt TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO users (id, created_at_ms) VALUES ('test-user', 0);
INSERT OR IGNORE INTO user_agent_companions (id, user_id, name, default_prompt, created_at_ms)
VALUES ('test-agent', 'test-user', '小雨', '你是温柔体贴的陪伴助手小雨，说话简短自然。', 0);
