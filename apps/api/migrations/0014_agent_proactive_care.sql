-- 阶段4 · 主动关怀（190）：计划（一用户×一Agent 唯一）+ 事件（绑定真实 assistant 消息）
CREATE TABLE IF NOT EXISTS agent_care_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
  preferred_time TEXT,
  scenes_json TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('light', 'gentle', 'intimate')),
  custom_prompt TEXT,
  next_run_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_care_plans_user_agent_unique
  ON agent_care_plans(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_care_plans_next_run
  ON agent_care_plans(enabled, next_run_at_ms);

CREATE TABLE IF NOT EXISTS agent_care_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  care_plan_id TEXT,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  scene TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('generated', 'read')),
  message TEXT NOT NULL,
  metadata_json TEXT,
  generated_at_ms INTEGER NOT NULL,
  read_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_care_events_agent_generated
  ON agent_care_events(user_id, agent_id, generated_at_ms);
CREATE INDEX IF NOT EXISTS idx_agent_care_events_message
  ON agent_care_events(message_id);
