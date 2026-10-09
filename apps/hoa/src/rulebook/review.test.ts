import { describe, expect, it } from "vitest"
import type * as T from "@/schema/types"
import { validateRulebook } from "@/schema/validate"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookRecords } from "./assemble"
import {
  answerQuestion,
  approvalBlockers,
  approvalContext,
  coverageOf,
  questionsIn,
  resolveIssue,
  reviewedRulebook,
  reviewRecords,
  termKeysOf
} from "./review"

const by = "admin"
const at = "2026-10-09T00:00:00Z"
const approved: T.Review = { status: "approved", by, at, note: null }

function sampleRecords(): RulebookRecords {
  const file = sampleRulesFile()
  return { ...file, terms: [...file.terms, ...file.proposedCore] }
}

/** The sample with every term approved, so rules are blocked only by what a test sets up. */
function withTermsApproved(records = sampleRecords()): RulebookRecords {
  return { ...records, terms: records.terms.map((term) => ({ ...term, review: approved })) }
}

const ruleOf = (records: RulebookRecords, key: string) => {
  const rule = records.rules.find((item) => item.key === key)
  if (!rule) {
    throw new Error(`The sample has no rule ${key}.`)
  }
  return rule
}

const leaseQuestion = "question-2-1"
const keptReading = "declaration:3.1(c)/p2#declarant-units-term-exempt"
const droppedReading = "declaration:3.1(c)/p2#declarant-units-exempt"
const ageRule = "declaration:3.1(a)#age-55-occupant"

describe("termKeysOf", () => {
  it("collects the statement's links and every term key in the rule's fields, not its bookkeeping", () => {
    const rule: T.Rule = {
      ...ruleOf(sampleRecords(), ageRule),
      statement: "Each {{lot}} needs {{lot.occupants:plural}}.",
      provenance: { by: "extraction", at },
      review: { status: "approved", by: "someone", at, note: null }
    }
    const keys = termKeysOf(rule)
    expect(keys).toContain("lot")
    expect(keys).toContain("lot.occupants")
    expect(keys).not.toContain("extraction")
    expect(keys).not.toContain("someone")
    expect(keys).not.toContain(rule.domain)
  })

  it("reads an aggregate's properties as terms and a constant's value as a constant", () => {
    const rule: T.Rule = {
      ...ruleOf(sampleRecords(), ageRule),
      statement: "Plain.",
      appliesWhen: {
        type: "compare",
        left: { type: "sum-of", path: ["lot.pets"], value: ["pet.weight"], where: null },
        op: "<=",
        right: { type: "date", value: "2025-01-01" }
      }
    }
    const keys = termKeysOf(rule)
    expect(keys).toContain("lot.pets")
    expect(keys).toContain("pet.weight")
    expect(keys).not.toContain("2025-01-01")
  })
})

describe("approvalBlockers", () => {
  it("blocks a rule that reads a proposed term until the term is approved", () => {
    const records = sampleRecords()
    expect(approvalBlockers(approvalContext(records), { type: "rule", key: ageRule })).toEqual([
      expect.stringMatching(/^It reads terms still to review: /)
    ])
    expect(approvalBlockers(approvalContext(withTermsApproved(records)), { type: "rule", key: ageRule })).toEqual([])
  })

  it("blocks a candidate reading of an open question", () => {
    expect(approvalBlockers(approvalContext(withTermsApproved()), { type: "rule", key: keptReading })).toEqual([
      "It's a candidate reading of an open question; answer the question instead."
    ])
  })

  it("blocks on open blocking issues and on problems validation finds, but not on advisory issues", () => {
    const records = withTermsApproved()
    const issue = (code: T.IssueCode): T.Issue => ({ code, message: code, related: [], resolution: null })
    const withIssues = {
      ...records,
      rules: records.rules.map((rule) =>
        rule.key === ageRule
          ? { ...rule, appliesTo: "residense", issues: [issue("conflict"), issue("avoided-label")] }
          : rule
      )
    }
    expect(approvalBlockers(approvalContext(withIssues), { type: "rule", key: ageRule })).toEqual([
      "1 open issue needs resolving.",
      "1 problem needs fixing: residense isn't a term."
    ])
    expect(approvalBlockers(approvalContext(records), { type: "rule", key: "missing#rule" })).toEqual([
      "The rule no longer exists."
    ])
  })

  it("checks terms, the settings and no-rule reasons", () => {
    const context = approvalContext(sampleRecords())
    const [term] = context.records.terms
    const withReason = context.records.provisions.find((provision) => provision.noRule !== null)
    const withoutReason = context.records.provisions.find((provision) => provision.noRule === null)
    expect(approvalBlockers(context, { type: "term", key: term?.key ?? "" })).toEqual([])
    expect(approvalBlockers(context, { type: "settings" })).toEqual([])
    expect(approvalBlockers(context, { type: "provision", key: withReason?.key ?? "" })).toEqual([])
    expect(approvalBlockers(context, { type: "provision", key: withoutReason?.key ?? "" })).toEqual([
      "The provision has no reason to approve."
    ])
  })
})

describe("reviewRecords", () => {
  it("approves what nothing blocks, skips the rest with why, and always rejects", () => {
    const records = sampleRecords()
    const [term] = records.terms
    const reason = records.provisions.find((provision) => provision.noRule !== null)
    const approvals = reviewRecords(
      records,
      [
        { type: "rule", key: ageRule },
        { type: "term", key: term?.key ?? "" },
        { type: "settings" },
        { type: "provision", key: reason?.key ?? "" }
      ],
      { status: "approved", by, at, note: null }
    )
    expect(approvals.rules).toEqual([])
    expect(approvals.skipped.map((skip) => skip.ref)).toEqual([{ type: "rule", key: ageRule }])
    expect(approvals.terms.map((item) => item.review.status)).toEqual(["approved"])
    expect(approvals.settings?.review).toEqual(approved)
    expect(approvals.provisions[0]?.noRule?.review).toEqual(approved)

    const rejections = reviewRecords(records, [{ type: "rule", key: ageRule }], {
      status: "rejected",
      by,
      at,
      note: "Not ours."
    })
    expect(rejections.rules[0]?.review).toEqual({ status: "rejected", by, at, note: "Not ours." })
  })
})

describe("answerQuestion", () => {
  it("approves the chosen reading, rejects the other and keeps the file valid", () => {
    const records = withTermsApproved()
    const result = answerQuestion(records, { questionId: leaseQuestion, option: 0, text: null, by, at })
    expect(result.question.answer).toEqual({ option: 0, text: null, by, at })
    expect(Object.fromEntries(result.rules.map((rule) => [rule.key, rule.review.status]))).toEqual({
      [keptReading]: "approved",
      [droppedReading]: "rejected"
    })
    expect(result.notApproved).toEqual([])

    const answered: RulebookRecords = {
      ...records,
      rules: records.rules.map((rule) => result.rules.find((item) => item.key === rule.key) ?? rule),
      questions: records.questions.map((question) => (question.id === leaseQuestion ? result.question : question))
    }
    const issues = validateRulebook(reviewedRulebook(answered))
    expect(issues.filter((issue) => issue.code === "undefined-rule")).toEqual([])
  })

  it("leaves a kept reading proposed when something else blocks it", () => {
    const result = answerQuestion(sampleRecords(), {
      questionId: leaseQuestion,
      option: 0,
      text: "Only the term.",
      by,
      at
    })
    expect(result.notApproved.map((skip) => skip.ref)).toEqual([{ type: "rule", key: keptReading }])
    expect(result.rules.map((rule) => rule.key)).toEqual([droppedReading])
  })

  it("resolves a conflict's issues on the rules it's about", () => {
    const records = withTermsApproved()
    const conflict: T.Issue = { code: "conflict", message: "They disagree.", related: [], resolution: null }
    const question: T.Question = {
      id: "conflict-1",
      kind: "conflict",
      question: "Which wins?",
      citations: [],
      about: { rules: [ageRule], terms: [] },
      options: [{ label: "The age rule", keeps: [ageRule] }],
      answer: null
    }
    const result = answerQuestion(
      {
        ...records,
        rules: records.rules.map((rule) => (rule.key === ageRule ? { ...rule, issues: [conflict] } : rule)),
        questions: [...records.questions, question]
      },
      { questionId: "conflict-1", option: 0, text: null, by, at }
    )
    expect(result.rules[0]?.issues[0]?.resolution).toEqual({ note: "Answered: The age rule", by, at })
    expect(result.rules[0]?.review.status).toBe("approved")
  })

  it("refuses an option that doesn't exist", () => {
    expect(() => answerQuestion(sampleRecords(), { questionId: leaseQuestion, option: 9, text: null, by, at })).toThrow(
      "doesn't exist"
    )
  })
})

describe("questionsIn", () => {
  it("names only the rules the file has, keeping every option and the answer", () => {
    const [question] = sampleRecords().questions
    if (!question) {
      throw new Error("The sample has questions.")
    }
    const [pruned] = questionsIn([question], new Set([question.options[0]?.keeps[0] ?? ""]))
    expect(pruned?.options).toHaveLength(question.options.length)
    expect(pruned?.options[1]?.keeps).toEqual([])
    expect(pruned?.about.rules).toEqual([question.options[0]?.keeps[0]])
  })
})

describe("coverageOf", () => {
  it("lists what cites each provision, and uncovers one whose only rule is rejected", () => {
    const records = sampleRecords()
    const rule = ruleOf(records, ageRule)
    const cited = rule.citations[0]?.provisionKey ?? ""
    expect(coverageOf(records).byProvision.get(cited)?.rules).toContain(ageRule)
    expect(coverageOf(records).uncovered).toEqual([])

    const onlyRule = {
      ...records,
      rules: records.rules
        .filter((item) => item.key === ageRule || !item.citations.some((citation) => citation.provisionKey === cited))
        .map((item) =>
          item.key === ageRule ? { ...item, review: { ...approved, status: "rejected" as const } } : item
        ),
      terms: records.terms.filter((term) => !JSON.stringify(term).includes(`"${cited}"`)),
      questions: []
    }
    expect(coverageOf(onlyRule).uncovered).toEqual([cited])
  })
})

describe("resolveIssue", () => {
  it("resolves one issue with a note", () => {
    const record = { issues: [{ code: "conflict" as const, message: "x", related: [], resolution: null }] }
    expect(resolveIssue(record, 0, { note: "Fine.", by, at }).issues[0]?.resolution).toEqual({ note: "Fine.", by, at })
    expect(() => resolveIssue(record, 3, { note: "Fine.", by, at })).toThrow("doesn't exist")
  })
})
