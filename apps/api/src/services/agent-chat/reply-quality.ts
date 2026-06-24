import { ReplyQualityGuardSchema, type ReplyQualityGuard, type ReplyPolicy } from "@ai-companion/contracts"
import { normalizeStoredMessage } from "./build-prompt"
import { fallbackReplyPolicy } from "./understanding/reply-policy"

type ViolationCode = ReplyQualityGuard["violations"][number]["code"]

export const fallbackReplyQualityGuard: ReplyQualityGuard = {
  status: "pass",
  score: 1,
  sentenceCount: 0,
  questionCount: 0,
  adviceCount: 0,
  violations: [],
}

const advicePatterns = [/建议你/g, /你可以/g, /不妨/g, /最好/g, /应该/g, /试着/g, /尝试/g, /可以先/g]
const internalLabels = [
  "intent",
  "emotion",
  "route",
  "policy",
  "replyPolicy",
  "relationshipStage",
  "意图判断",
  "情绪路由",
  "回复策略",
  "metadata",
]
const immersionBreakers = [
  "作为一个 AI",
  "作为一个AI",
  "作为AI",
  "我只是 AI",
  "我只是AI",
  "我是语言模型",
  "我是一个语言模型",
  "我没有真实情感",
  "我没有身体",
]

/** forbiddenMoves（阶段2 ReplyPolicy 的枚举）→ 检测正则 */
const FORBIDDEN_MAP: Partial<Record<ReplyPolicy["forbiddenMoves"][number], { code: ViolationCode; patterns: RegExp[] }>> = {
  lecture: { code: "forbidden_lecture", patterns: [/你要明白/, /你必须/, /正确的做法是/] },
  over_explain: { code: "forbidden_over_explain", patterns: [/换句话说/, /也就是说/, /进一步解释/] },
  premature_advice: { code: "forbidden_premature_advice", patterns: [/你应该立刻/, /马上去/] },
  intense_flirt: { code: "forbidden_intense_flirt", patterns: [/我好爱你/, /没有你我活不下去/] },
  diagnose_user: { code: "forbidden_diagnosis", patterns: [/你这是抑郁/, /你有焦虑症/] },
  take_sides_aggressively: { code: "forbidden_aggressive_siding", patterns: [/他就是渣/, /必须分手/] },
  pressure_to_disclose: { code: "forbidden_pressure", patterns: [/你一定要告诉我/, /必须说清楚/] },
  promise_real_world_action: { code: "forbidden_real_world_promise", patterns: [/我会去找你/, /我帮你处理现实/] },
}

function countSentences(t: string): number {
  return t
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean).length
}
function countMatches(t: string, ps: RegExp[]): number {
  return ps.reduce((n, p) => n + (t.match(p)?.length ?? 0), 0)
}

/**
 * 回复质量守卫（纯代码规则，文章186）。零额外模型调用、只记录不拦截。
 * 检测：句数 / 问号 / 建议 / 内部标签泄露 / 破坏沉浸感 / forbidden moves。
 */
export function evaluateReplyQuality(params: {
  assistantText: string
  replyPolicy?: ReplyPolicy | null
}): ReplyQualityGuard {
  const text = normalizeStoredMessage(params.assistantText)
  if (!text) return fallbackReplyQualityGuard
  const policy = params.replyPolicy ?? fallbackReplyPolicy

  const sentenceCount = countSentences(params.assistantText)
  const questionCount = countMatches(text, [/？/g, /\?/g])
  const adviceCount = countMatches(text, advicePatterns)
  const violations: ReplyQualityGuard["violations"] = []
  const push = (v: ReplyQualityGuard["violations"][number]) => {
    if (violations.length < 12) violations.push(v)
  }

  if (sentenceCount > policy.sentenceBudget.max) {
    push({
      code: "too_many_sentences",
      severity: sentenceCount > policy.sentenceBudget.max + 2 ? "high" : "medium",
      evidence: `回复 ${sentenceCount} 句，超过策略上限 ${policy.sentenceBudget.max} 句。`,
    })
  }
  if (questionCount > policy.questionLimit) {
    push({
      code: "too_many_questions",
      severity: "medium",
      evidence: `回复含 ${questionCount} 个问句，超过上限 ${policy.questionLimit}。`,
    })
  }
  if (adviceCount > policy.adviceLimit) {
    push({
      code: "too_many_suggestions",
      severity: "low",
      evidence: `回复含 ${adviceCount} 处建议型表达，超过上限 ${policy.adviceLimit}。`,
    })
  }
  for (const label of internalLabels) {
    if (text.includes(label)) {
      push({ code: "internal_label_leak", severity: "high", evidence: `泄露内部标签：${label}` })
      break
    }
  }
  for (const phrase of immersionBreakers) {
    if (text.includes(phrase)) {
      push({ code: "breaks_immersion", severity: "high", evidence: `破坏沉浸感：${phrase}` })
      break
    }
  }
  for (const move of policy.forbiddenMoves) {
    const def = FORBIDDEN_MAP[move]
    if (def && def.patterns.some((p) => p.test(text))) {
      push({ code: def.code, severity: "medium", evidence: `命中禁止动作：${move}` })
    }
  }

  const high = violations.filter((v) => v.severity === "high").length
  const mid = violations.filter((v) => v.severity === "medium").length
  const low = violations.filter((v) => v.severity === "low").length
  const score = Math.max(0, 1 - high * 0.35 - mid * 0.18 - low * 0.08)
  const status: ReplyQualityGuard["status"] = high > 0 || score < 0.5 ? "fail" : violations.length > 0 ? "warn" : "pass"

  return ReplyQualityGuardSchema.parse({ status, score, sentenceCount, questionCount, adviceCount, violations })
}
