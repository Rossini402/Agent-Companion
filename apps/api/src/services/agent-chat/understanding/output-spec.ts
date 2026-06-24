// DeepSeek json_object 模式不强制 schema，必须在 prompt 里明确字段与枚举候选，
// 否则模型自由发挥导致 Zod 校验失败、退回 fallback。以下规格与 contracts 的 schema 一一对应。

export const INTENT_OUTPUT_SPEC = [
  "只输出如下结构的 JSON，所有枚举字段的值必须从给定候选里选，不得自创：",
  "{",
  '  "primary": 从 [casual_chat, emotional_support, relationship_advice, romantic_flirt, companionship_presence, roleplay, life_sharing, memory_update, preference_setting, agent_feedback, conversation_repair, date_or_activity_planning, creative_request, meta_question, unclear] 选一个,',
  '  "secondary": 上述候选组成的数组（0-3 个，可为空数组）,',
  '  "confidence": 0 到 1 的小数,',
  '  "userNeed": 从 [be_heard, be_comforted, get_advice, get_reply_draft, play_along, feel_connected, set_boundary, update_memory, adjust_agent, unknown] 选一个,',
  '  "requestedAgentAction": 从 [answer_directly, comfort_first, ask_follow_up, draft_message, analyze_situation, roleplay_response, remember_fact, adjust_style, repair_misunderstanding, continue_topic] 选一个,',
  '  "relationshipSignal": 从 [neutral, warming_up, seeking_closeness, testing_boundary, feeling_hurt, pulling_away, dependency_risk, conflict] 选一个,',
  '  "replyExpectation": { "depth": [short|medium|deep] 之一, "warmth": [low|medium|high] 之一, "directness": [gentle|balanced|direct] 之一, "shouldAskQuestion": true 或 false },',
  '  "shouldClarify": true 或 false,',
  '  "clarifyingQuestion": 字符串或 null,',
  '  "promptGuidance": 给回复模型的简短中文指导（不超过 200 字）',
  "}",
].join("\n")

export const EMOTION_OUTPUT_SPEC = [
  "只输出如下结构的 JSON，所有枚举字段的值必须从给定候选里选，不得自创：",
  "{",
  '  "primaryEmotion": 从 [neutral, happy, tired, lonely, sad, anxious, angry, jealous, embarrassed, affectionate, playful, confused, disappointed, stressed, hurt] 选一个,',
  '  "secondaryEmotions": 中文情绪词数组（0-3 个，可为空数组）,',
  '  "intensity": 0 到 1 的小数,',
  '  "valence": 从 [positive, neutral, negative, mixed] 选一个,',
  '  "arousal": 从 [low, medium, high] 选一个,',
  '  "needsComfort": true 或 false,',
  '  "needsDeescalation": true 或 false,',
  '  "needsClarification": true 或 false,',
  '  "emotionalCue": 简短中文情绪线索描述,',
  '  "replyTone": 从 [light, warm, soft, playful, calm, serious, reassuring, apologetic] 选一个',
  "}",
].join("\n")

export const RELATIONSHIP_OUTPUT_SPEC = [
  "只输出如下结构的 JSON，所有枚举字段的值必须从给定候选里选，不得自创：",
  "{",
  '  "stage": 从 [new_connection, warming_up, comfortable_chat, trusted_companion, close_bond, repairing, boundary_sensitive, dependency_watch] 选一个,',
  '  "displayName": 该阶段的简短中文名,',
  '  "closenessScore": 0 到 100 的整数,',
  '  "trustLevel": 从 [low, medium, high] 选一个,',
  '  "stability": 从 [new, warming, stable, deepening, fragile, repairing] 选一个,',
  '  "boundaryMode": 从 [open, warm, careful, firm] 选一个,',
  '  "intimacyPermission": 从 [low, medium, high] 选一个,',
  '  "pacing": 从 [slow_down, hold, advance_gently, repair_first] 选一个,',
  '  "riskSignals": 从 [low_history, dependency_risk, boundary_testing, conflict, pulling_away, sexual_boundary, emotional_volatility] 取的数组（0-5 个，可为空数组）,',
  '  "relationshipGuidance": 给回复模型的简短中文关系指导',
  "}",
].join("\n")
