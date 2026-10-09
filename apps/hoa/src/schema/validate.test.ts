import { describe, expect, it } from "vitest"
import { exampleRulebook } from "./exampleRulebook.test-data"
import * as ex from "./examples.test-data"
import type { Condition, Operand, ValueType } from "./types"
import { type Rulebook, validateRulebook } from "./validate"
import { questionDraft, type RuleDraft, ruleDraft, type TermDraft, termDraft } from "./zod"

// Each test changes the examples' rulebook, which is valid as it stands, and expects exactly the issues the change
// causes: its code, the record it belongs to and the path within that record.

type Change = (rulebook: Rulebook) => void

function issuesAfter(...changes: Change[]) {
  const rulebook = exampleRulebook()
  for (const change of changes) {
    change(rulebook)
  }
  return validateRulebook(rulebook).map(({ code, recordKey, path }) => ({ code, recordKey, path: path.join(".") }))
}

const withRule =
  (draft: RuleDraft): Change =>
  (rulebook) => {
    const rule = ruleDraft.parse(draft)
    const others = rulebook.rules.filter((existing) => existing.key !== rule.key)
    rulebook.rules = [...others, rule]
  }

const withTerm =
  (draft: TermDraft, list: "terms" | "proposedCore" = "terms"): Change =>
  (rulebook) => {
    rulebook[list] = [...rulebook[list], termDraft.parse({ organizationId: "org-sample", ...draft })]
  }

const ref = (...path: string[]): Operand => ({ type: "ref", path })
const inches = (value: number): Operand => ({ type: "quantity", value, unit: "inch" })
const val = (term: string): Operand => ({ type: "value", term })
const test = (condition: Condition) => ({ type: "test" as const, test: condition })
const compare = (left: Operand, op: "=" | "<=" | "<", right: Operand): Condition => ({
  type: "compare",
  left,
  op,
  right
})
const issue = (code: string, recordKey: string, path: string) => ({ code, recordKey, path })
const labels = (text: string) => [{ text, role: "preferred" as const }]
const maxHeight = ex.maxHeight.key

it("finds nothing wrong with the examples", () => {
  expect(issuesAfter()).toEqual([])
})

describe("keys", () => {
  it("reports duplicate documents, rules and terms, and a proposed core term that's already core", () => {
    const issues = issuesAfter(
      (rulebook) => rulebook.documents.push(ex.byLaws),
      (rulebook) => rulebook.rules.push(ruleDraft.parse(ex.maxHeight)),
      withTerm({ key: "gate", kind: "thing", nature: "object", labels: [{ text: "gate", role: "preferred" }] }),
      withTerm(
        {
          key: "owner",
          organizationId: null,
          kind: "thing",
          nature: "party",
          labels: [{ text: "owner", role: "preferred" }]
        },
        "proposedCore"
      )
    )
    expect(issues).toEqual([
      issue("duplicate-key", "by-laws", "key"),
      issue("duplicate-key", maxHeight, "key"),
      issue("duplicate-key", "gate", "key"),
      issue("duplicate-key", "owner", "key")
    ])
  })

  it("needs a provision's key to be its document's key and its label", () => {
    const issues = issuesAfter((rulebook) =>
      rulebook.provisions.push(
        { key: "guidelines:5.9", label: "5.8", noRule: { reason: "heading" } },
        { key: "manual:1", label: "1", noRule: { reason: "heading" } }
      )
    )
    expect(issues).toEqual([
      issue("invalid-key", "guidelines:5.9", "key"),
      issue("undefined-document", "manual:1", "key")
    ])
  })

  it("needs a rule's key to start with its main citation", () => {
    const issues = issuesAfter(withRule({ ...ex.maxHeight, key: "guidelines:5.5.2#height" }))
    expect(issues).toEqual([issue("invalid-key", "guidelines:5.5.2#height", "key")])
  })
})

describe("references", () => {
  it("resolves term keys in paths and statement links", () => {
    const issues = issuesAfter(
      withRule({
        ...ex.maxHeight,
        statement: "Each {{fence-runs}} is short.",
        check: test(compare(ref("fence-run.heigth"), "<=", inches(72)))
      })
    )
    expect(issues).toEqual([
      issue("undefined-term", maxHeight, "statement"),
      issue("undefined-term", maxHeight, "check.test.left.path.0")
    ])
  })

  it("resolves rule keys in overrides, enforcement, limits and questions", () => {
    const issues = issuesAfter(
      withRule({ ...ex.metalVariations, overrides: ["guidelines:5.5.2#metal-hieght"] }),
      withRule({ ...ex.lateFee, enforces: { rules: ["declaration:6.4#annual"], documents: [], except: [] } }),
      withRule({ ...ex.fineLimit, limits: ["rules:12.1#fine"] }),
      (rulebook) => {
        const about = { rules: ["guidelines:5.5.1(i)#height"], terms: ["fence"] }
        rulebook.questions.push(questionDraft.parse({ ...ex.interpretation, about }))
      }
    )
    expect(issues).toEqual([
      issue("undefined-rule", ex.metalVariations.key, "overrides.0"),
      issue("undefined-rule", ex.lateFee.key, "enforces.rules.0"),
      issue("undefined-rule", ex.fineLimit.key, "limits.0"),
      issue("undefined-rule", "question 2", "about.rules.0"),
      issue("undefined-term", "question 2", "about.terms.0")
    ])
  })

  it("resolves documents and provisions in selectors and citations", () => {
    const cite = (provisionKey: string) => ({ provisionKey, highlight: null, region: null })
    const issues = issuesAfter(
      withRule({
        ...ex.grandfathered,
        overrides: { documents: ["design-guidelines"], provisions: ["guidelines:9"], adoptedAfter: null, except: [] }
      }),
      withRule({ ...ex.maxHeight, citations: [cite("guidelines:5.5.1(i)"), cite("guidelines:5.5.9")] }),
      withRule({ ...ex.fineSchedule, enforces: { rules: [], documents: ["regulations"], except: [] } })
    )
    expect(issues).toEqual([
      issue("undefined-document", ex.grandfathered.key, "overrides.documents.0"),
      issue("citation-not-found", ex.grandfathered.key, "overrides.provisions.0"),
      issue("citation-not-found", maxHeight, "citations.1.provisionKey"),
      issue("undefined-document", ex.fineSchedule.key, "enforces.documents.0")
    ])
  })
})

describe("rule invariants", () => {
  it("runs a rule only in request types", () => {
    const issues = issuesAfter(withRule({ ...ex.maxHeight, requestTypes: ["architectural-application", "fence-run"] }))
    expect(issues).toEqual([issue("type-mismatch", maxHeight, "requestTypes.1")])
  })

  it("needs parties where parties are required", () => {
    const issues = issuesAfter(
      withRule({ ...ex.sightLines, decidedBy: "photo" }),
      withRule({
        ...ex.priorApproval,
        check: { type: "approval", by: ["work"], needs: "all", prior: true, written: true }
      }),
      withRule({
        ...ex.grandfathered,
        appliesWhen: { type: "approved", path: [], by: ["lot"], needs: "all", prior: false, written: false }
      }),
      withRule({ ...ex.fineSchedule, against: ["fence-run"], imposedBy: "rules" })
    )
    expect(issues).toEqual([
      issue("type-mismatch", ex.sightLines.key, "decidedBy"),
      issue("type-mismatch", ex.priorApproval.key, "check.by.0"),
      issue("type-mismatch", ex.grandfathered.key, "appliesWhen.by.0"),
      issue("undefined-term", ex.fineSchedule.key, "imposedBy"),
      issue("type-mismatch", ex.fineSchedule.key, "against.0")
    ])
  })

  it("accepts a category of parties as a party", () => {
    expect(issuesAfter(withRule({ ...ex.neighborApproval, bearer: "neighbor", remedy: null }))).toEqual([])
  })

  it("has a remedy exactly when the rule runs in applications and binds the owner or applicant", () => {
    const issues = issuesAfter(
      withRule({ ...ex.maxHeight, remedy: null }),
      withRule({ ...ex.minimumLease, remedy: "redesign" }),
      withRule({ ...ex.solarLaw, remedy: "change-detail" })
    )
    expect(issues).toEqual([
      issue("invariant", maxHeight, "remedy"),
      issue("invariant", ex.minimumLease.key, "remedy"),
      issue("invariant", ex.solarLaw.key, "remedy")
    ])
  })

  it("recurs only in a duty request type, on a schedule", () => {
    const issues = issuesAfter(
      withRule({ ...ex.maintainLandscaping, recurs: ex.annualMeeting.recurs }),
      withRule({ ...ex.annualMeeting, recurs: { type: "ref", from: "community", path: ["community.lot-count"] } })
    )
    expect(issues).toEqual([
      issue("invariant", ex.maintainLandscaping.key, "requestTypes"),
      issue("type-mismatch", ex.annualMeeting.key, "recurs")
    ])
  })

  it("enforces only obligations and prohibitions that share a request type", () => {
    const issues = issuesAfter(
      withRule({ ...ex.fineSchedule, enforces: { rules: [ex.otherManufacturers.key], documents: [], except: [] } }),
      withRule({ ...ex.lateFee, enforces: { rules: [maxHeight], documents: [], except: [] } })
    )
    expect(issues).toEqual([
      issue("invariant", ex.fineSchedule.key, "enforces.rules.0"),
      issue("invariant", ex.lateFee.key, "enforces.rules.0")
    ])
  })

  it("names only sanctions in a limit and in a clause's except list", () => {
    const issues = issuesAfter(withRule({ ...ex.fineLimit, limits: [ex.maintainLandscaping.key] }), (rulebook) => {
      const [precondition] = rulebook.settings.clauses.sanctionPreconditions ?? []
      if (precondition) {
        precondition.except = [ex.maintainLandscaping.key]
      }
    })
    expect(issues).toEqual([
      issue("invariant", ex.fineLimit.key, "limits.0"),
      issue("invariant", "settings", "clauses.sanctionPreconditions.0.except.0")
    ])
  })

  it("gives decision rules, and only them, a scope and an authority", () => {
    const issues = issuesAfter(
      withRule({ ...ex.variance, scope: null }),
      withRule({ ...ex.maxHeight, scope: { lotId: "lot-42", subjectId: null } })
    )
    expect(issues).toEqual([issue("invariant", ex.variance.key, "scope"), issue("invariant", maxHeight, "scope")])
  })

  it("allows text conditions only in applicability", () => {
    const issues = issuesAfter(
      withRule({ ...ex.maxHeight, appliesWhen: { type: "text", text: "faces a street" } }),
      withRule({ ...ex.fenceAndLattice, check: test({ type: "text", text: "looks tidy" }) })
    )
    expect(issues).toEqual([issue("invariant", ex.fenceAndLattice.key, "check.test")])
  })
})

describe("coverage", () => {
  it("needs every provision cited, or a reason for having no rule, but not both", () => {
    const issues = issuesAfter((rulebook) => {
      rulebook.provisions.push({ key: "guidelines:5.9", label: "5.9", noRule: null })
      rulebook.provisions.push({ key: "guidelines:5.10", label: "5.10", noRule: { reason: "explanatory" } })
      const [provision] = rulebook.provisions
      if (provision) {
        provision.noRule = { reason: "heading" }
      }
    })
    expect(issues).toEqual([
      issue("coverage", ex.provision542.key, "noRule"),
      issue("coverage", "guidelines:5.9", "noRule")
    ])
  })
})

describe("terms", () => {
  it("gives organization terms the organization's id, and proposed core terms none", () => {
    const issues = issuesAfter(
      withTerm({ key: "shed", organizationId: "org-other", kind: "thing", nature: "object", labels: labels("shed") }),
      withTerm({ key: "dispute", kind: "thing", nature: "event", labels: labels("dispute") }, "proposedCore")
    )
    expect(issues).toEqual([
      issue("invariant", "shed", "organizationId"),
      issue("invariant", "dispute", "organizationId")
    ])
  })

  it("keeps a refined core term's kind and value type", () => {
    const issues = issuesAfter(
      withTerm({
        key: "community",
        kind: "category",
        of: "lot",
        criteria: { type: "text", text: "all" },
        labels: labels("all")
      }),
      withTerm({
        key: "assessment.due-on",
        kind: "property",
        of: "assessment",
        valueType: { type: "date-time" },
        ifUnstated: "unknown",
        labels: labels("due")
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", "community", "kind"),
      issue("type-mismatch", "assessment.due-on", "kind")
    ])
  })

  it("keys properties and values under their thing and set, and checks what they name", () => {
    const issues = issuesAfter(
      withTerm({
        key: "fence-height",
        kind: "property",
        of: "fence-run",
        valueType: { type: "quantity", unit: "foot" },
        ifUnstated: "unknown",
        labels: labels("height")
      }),
      withTerm({ key: "fence-run.vinyl", kind: "value", set: "fence-run", labels: labels("vinyl") }),
      withTerm({
        key: "fence-material.cedar",
        kind: "value",
        set: "fence-material",
        broader: ["composite-color.teak", "fence-material.wood"],
        labels: labels("cedar")
      })
    )
    expect(issues).toEqual([
      issue("invalid-key", "fence-height", "key"),
      issue("type-mismatch", "fence-run.vinyl", "set"),
      issue("type-mismatch", "fence-material.cedar", "broader.0")
    ])
  })

  it("checks a property's value type, and a category's thing", () => {
    const property = (key: string, valueType: ValueType) =>
      withTerm({ key, kind: "property", of: "gate", valueType, ifUnstated: "unknown", labels: labels(key) })
    const issues = issuesAfter(
      property("gate.width", { type: "quantity", unit: "fence-run" }),
      property("gate.style", { type: "choice", set: "fence-material.wood" }),
      property("gate.latch", { type: "reference", to: "gate.color" }),
      property("gate.installer", { type: "party", among: ["vehicle"] }),
      withTerm({
        key: "tall-gate",
        kind: "category",
        of: "gate.color",
        criteria: { type: "text", text: "tall" },
        labels: labels("tall gate")
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", "gate.width", "valueType.unit"),
      issue("type-mismatch", "gate.style", "valueType.set"),
      issue("type-mismatch", "gate.latch", "valueType.to"),
      issue("type-mismatch", "gate.installer", "valueType.among.0"),
      issue("type-mismatch", "tall-gate", "of")
    ])
  })

  it("types a request type's governing date and a derived property's value", () => {
    const issues = issuesAfter(
      withTerm(
        {
          key: "dispute",
          organizationId: null,
          kind: "thing",
          nature: "request",
          request: { flow: "filing", governingDate: "dispute.parties", lot: "none" },
          labels: labels("dispute")
        },
        "proposedCore"
      ),
      withTerm(
        {
          key: "dispute.parties",
          organizationId: null,
          kind: "property",
          of: "dispute",
          valueType: { type: "count" },
          ifUnstated: "unknown",
          labels: labels("parties")
        },
        "proposedCore"
      ),
      withTerm({
        key: "violation.notice-assumed-on",
        kind: "property",
        of: "violation",
        valueType: { type: "date" },
        ifUnstated: "unknown",
        derived: [{ when: null, value: { type: "number", value: 3 }, citations: [] }],
        labels: labels("deemed delivered on")
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", "violation.notice-assumed-on", "derived.0.value"),
      issue("type-mismatch", "dispute", "request.governingDate")
    ])
  })
})

describe("typing", () => {
  const appliesWhen = (condition: Condition) => withRule({ ...ex.maxHeight, appliesWhen: condition })
  const checking = (condition: Condition) => withRule({ ...ex.maxHeight, check: test(condition) })

  it("follows each path step from the thing before it", () => {
    const issues = issuesAfter(
      appliesWhen({ type: "exists", path: ["gate.color"] }),
      withRule({ ...ex.gateColor, appliesWhen: { type: "exists", path: ["gate.color", "fence-run.color"] } }),
      withRule({ ...ex.fenceAndLattice, appliesWhen: { type: "exists", path: ["fence-material"] } })
    )
    expect(issues).toEqual([
      issue("type-mismatch", maxHeight, "appliesWhen.path.0"),
      issue("type-mismatch", ex.gateColor.key, "appliesWhen.path.1"),
      issue("type-mismatch", ex.fenceAndLattice.key, "appliesWhen.path.0")
    ])
  })

  it("only counts, aggregates or quantifies a many-valued step", () => {
    const issues = issuesAfter(
      withRule({
        ...ex.petLimit,
        appliesWhen: { type: "approved", path: ["lot.pets"], by: ["board"], needs: "all", prior: false, written: false }
      })
    )
    expect(issues).toEqual([issue("type-mismatch", ex.petLimit.key, "appliesWhen.path.0")])
  })

  it("quantifies over a list of things or of values", () => {
    const issues = issuesAfter(
      withTerm({ key: "feature", kind: "value-set", complete: true, labels: labels("feature") }),
      withTerm({ key: "feature.pool", kind: "value", set: "feature", labels: labels("pool") }),
      withTerm({
        key: "lot.features",
        kind: "property",
        of: "lot",
        valueType: { type: "choice", set: "feature" },
        many: true,
        ifUnstated: "unknown",
        labels: labels("features")
      }),
      withRule({
        ...ex.petLimit,
        appliesWhen: {
          type: "all",
          of: [
            { type: "some", path: ["lot.features"], where: null, test: compare(ref(), "=", val("feature.pool")) },
            {
              type: "none",
              path: ["lot.pets"],
              where: null,
              test: compare(ref("pet.species"), "=", val("species.cat"))
            }
          ]
        }
      })
    )
    expect(issues).toEqual([])
  })

  it("compares only what the typing rules allow", () => {
    const issues = issuesAfter(
      checking(compare(ref("fence-run.height"), "<=", { type: "date", value: "2026-01-01" })),
      withRule({
        ...ex.fenceAndLattice,
        check: test(compare(ref("fence-run.height"), "<=", { type: "quantity", value: 5, unit: "usd" }))
      }),
      withRule({ ...ex.metalHeight, check: test(compare(ref("fence-run.material"), "<", val("fence-material.wood"))) }),
      withRule({ ...ex.frontSetback, check: test(compare(ref("fence-run.height"), "=", val("fence-run"))) })
    )
    expect(issues).toEqual([
      issue("type-mismatch", maxHeight, "check.test"),
      issue("type-mismatch", ex.fenceAndLattice.key, "check.test"),
      issue("type-mismatch", ex.metalHeight.key, "check.test"),
      issue("type-mismatch", ex.frontSetback.key, "check.test.right.term")
    ])
  })

  it("compares a ratio with a number, and dates with dates", () => {
    const percent = { type: "quantity" as const, value: 20, unit: "percent" }
    const issues = issuesAfter(
      withRule({ ...ex.rentalCap, check: test(compare({ type: "number", value: 0.1 }, "<=", percent)) }),
      checking(compare(ref("fence-run.installed-on"), "<", { type: "governing-date" }))
    )
    expect(issues).toEqual([])
  })

  it("keeps arithmetic within one dimension", () => {
    const usd: Operand = { type: "quantity", value: 5, unit: "usd" }
    const height = ref("fence-run.height")
    const date: Operand = { type: "date", value: "2026-01-01" }
    const issues = issuesAfter(
      checking(compare({ type: "sum", of: [height, usd] }, "<=", inches(90))),
      withRule({
        ...ex.fenceAndLattice,
        check: test(compare({ type: "product", of: [height, height] }, "<=", inches(90)))
      }),
      withRule({ ...ex.metalHeight, check: test(compare({ type: "quotient", of: [height, usd] }, "<=", inches(90))) }),
      withRule({ ...ex.frontSetback, check: test(compare({ type: "difference", of: [date, date] }, "<=", inches(90))) })
    )
    expect(issues).toEqual([
      issue("type-mismatch", maxHeight, "check.test.left"),
      issue("type-mismatch", ex.fenceAndLattice.key, "check.test.left"),
      issue("type-mismatch", ex.metalHeight.key, "check.test.left"),
      issue("type-mismatch", ex.frontSetback.key, "check.test.left")
    ])
  })

  it("keeps values in their property's set", () => {
    const issues = issuesAfter(
      checking(compare(ref("fence-run.location"), "=", val("fence-material.wood"))),
      withRule({
        ...ex.fenceAndLattice,
        check: test(compare(ref("fence-run.material"), "=", val("composite-color.teak")))
      })
    )
    expect(issues).toEqual([
      issue("invalid-value", maxHeight, "check.test"),
      issue("type-mismatch", ex.fenceAndLattice.key, "check.test")
    ])
  })

  it("tests membership of a category of the subject's thing", () => {
    const issues = issuesAfter(appliesWhen({ type: "is-a", path: [], category: "neighbor" }))
    expect(issues).toEqual([issue("type-mismatch", maxHeight, "appliesWhen")])
  })

  it("types deadlines, date arithmetic, tables and windows", () => {
    const issues = issuesAfter(
      withRule({
        ...ex.committeeResponse,
        check: {
          type: "deadline",
          act: { type: "ref", from: "request", path: ["architectural-application.decision"] },
          anchor: { type: "ref", from: "request", path: ["architectural-application.submitted-on"] },
          earliest: null,
          latest: { value: 30, unit: "inch", at: null },
          onMiss: [
            {
              type: "deems",
              target: { from: "request", path: ["architectural-application.decision"] },
              value: { type: "quantity", value: 5, unit: "usd" }
            }
          ]
        }
      }),
      withRule({
        ...ex.candidateOwnership,
        check: test(
          compare({ type: "shift", of: ref("nomination.ownership-start"), by: { value: 12, unit: "foot" } }, "<=", {
            type: "governing-date"
          })
        )
      }),
      withRule({
        ...ex.compositeColors,
        check: {
          type: "table",
          inputs: [ref("fence-run.manufacturer"), ref("fence-run.color")],
          rows: [
            { when: [{ type: "in", values: [val("composite-manufacturer.trex")] }], result: "met", citation: null }
          ],
          otherwise: "not-met"
        }
      }),
      withRule({
        ...ex.trashContainers,
        check: test({
          type: "during",
          start: ref("curbside-placement.start"),
          end: ref("curbside-placement.end"),
          window: {
            type: "recurring",
            schedule: { type: "ref", from: "community", path: ["community.lot-count"] },
            from: null,
            to: null
          },
          match: "within"
        })
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", ex.committeeResponse.key, "check.act"),
      issue("type-mismatch", ex.committeeResponse.key, "check.latest.unit"),
      issue("type-mismatch", ex.committeeResponse.key, "check.onMiss.0"),
      issue("type-mismatch", ex.candidateOwnership.key, "check.test.left.by.unit"),
      issue("type-mismatch", ex.compositeColors.key, "check.rows.0.when"),
      issue("type-mismatch", ex.trashContainers.key, "check.test.window.schedule")
    ])
  })
})

describe("aggregates, tables and documents", () => {
  it("types aggregates over a list and a table's ranges", () => {
    const citation = { provisionKey: ex.provision542.key, highlight: null, region: null }
    const issues = issuesAfter(
      withRule({
        ...ex.petLimit,
        check: test(
          compare({ type: "sum-of", path: ["lot.pets"], value: ["pet.species"], where: null }, "<=", {
            type: "number",
            value: 3
          })
        )
      }),
      withRule({
        ...ex.compositeColors,
        check: {
          type: "table",
          inputs: [ref("fence-run.height")],
          rows: [
            {
              when: [
                {
                  type: "range",
                  min: inches(48),
                  max: { type: "date", value: "2026-01-01" },
                  includeMin: true,
                  includeMax: true
                }
              ],
              result: "met",
              citation
            },
            { when: [{ type: "any" }], result: "not-met", citation: null }
          ],
          otherwise: "met"
        }
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", ex.petLimit.key, "check.test.left.value"),
      issue("type-mismatch", ex.compositeColors.key, "check.rows.0.when.0.max")
    ])
  })

  it("checks documents, label citations and sanctions' exceptions", () => {
    const issues = issuesAfter(
      (rulebook) => {
        rulebook.documents.push({
          key: "phase-2",
          kind: "supplemental-declaration",
          issuedBy: "fence-run",
          governs: { type: "exists", path: ["lot.phase"] }
        })
      },
      withRule({ ...ex.maxHeight, noExceptions: { provisionKey: ex.provision542.key, highlight: null, region: null } }),
      withRule({ ...ex.fineSchedule, enforces: { rules: [], documents: ["rules"], except: ["rules:3.3#parking"] } }),
      withTerm({
        key: "shed",
        kind: "thing",
        nature: "object",
        labels: [
          { text: "shed", role: "preferred", citation: { provisionKey: "guidelines:7", highlight: null, region: null } }
        ]
      })
    )
    expect(issues).toEqual([
      issue("type-mismatch", "phase-2", "issuedBy"),
      issue("undefined-term", "phase-2", "governs.path.0"),
      issue("citation-not-found", "shed", "labels.0.citation.provisionKey"),
      issue("undefined-rule", ex.fineSchedule.key, "enforces.except.0")
    ])
  })
})
