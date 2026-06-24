-- 阶段4 · 用户反馈闭环（189）：一用户 × 一消息唯一一条，点赞/点踩切换走 update
CREATE TABLE IF NOT EXISTS agent_message_feedbacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  reason TEXT,
  note TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_message_feedbacks_user_message_unique
  ON agent_message_feedbacks(user_id, message_id);
CREATE INDEX IF NOT EXISTS idx_agent_message_feedbacks_agent_recent
  ON agent_message_feedbacks(user_id, agent_id, updated_at_ms);
