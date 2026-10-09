import type { ApplicationFile } from "@/applications/application"
import { decide } from "@/engine/decide"
import { evaluate } from "@/engine/evaluate"
import { reportRules, reviewTerms } from "@/features/applications/applicationView"
import { rulebookVocabulary } from "@/review/documentTypes"
import type { Review } from "@/review/reviewModel"
import { actionItems } from "@/review/write"
import type * as T from "@/schema/types"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "./fenceSchemaFixture"

// The sample fence application's review as the application pages read it: the fence fixture's request evaluated by
// the engine and decided, with code's action items, one fact read from the packet with its evidence and match, and
// the writer's text with rule markers. It holds no packet text.

const colors = "guidelines:5.4.2(i)#colors"
const harmony = "declaration:4.3(b)/p2#harmony"

const file = (id: string, fileName: string, mediaType: string): ApplicationFile => ({
  id,
  hoaId: "hoa",
  applicationId: "app-1",
  parentFileId: null,
  ordinal: null,
  contextText: null,
  fileName,
  mediaType,
  sizeBytes: 10,
  sha256: null,
  pageCount: 1,
  kind: null,
  status: "ready",
  error: null,
  createdAt: "2026-09-04T10:00:00.000Z"
})

export const fenceFiles: ApplicationFile[] = [
  file("file-form", "application-form.pdf", "application/pdf"),
  file("file-appendix", "appendix.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  file("file-photo", "new-fence.jpg", "image/jpeg")
]

/** The color the packet states, read with its evidence and matched to the listed value by similarity. */
function withReadColor(request: T.EvaluationRequest): T.EvaluationRequest {
  return {
    ...request,
    facts: request.facts.map((fact) =>
      fact.entity === "run-1" && fact.property === "fence-run.color"
        ? {
            ...fact,
            stated: "River Birtch",
            confidence: 0.9,
            evidence: [{ fileId: "file-appendix", page: 1, quote: "Trex fence in River Birtch", region: null }]
          }
        : fact
    )
  }
}

export function fenceReview() {
  const rulesFile = fenceRulesFile()
  const request = withReadColor(fenceRequest())
  const findings = evaluate({ rulesFile, request, answers: fenceAnswers(), evaluatedAt: "2026-09-10T12:00:00Z" })
  const decision = decide(findings, rulesFile, request.type)
  const items = actionItems(decision, {
    rules: new Map(rulesFile.rules.map((rule) => [rule.key, rule])),
    entities: request.entities,
    findings,
    vocabulary: rulebookVocabulary(rulesFile)
  })
  const selected = [...new Set(findings.map((finding) => finding.ruleKey))]
  const review: Review = {
    id: "review-1",
    applicationId: "app-1",
    jobId: "review-1",
    rulebookId: "rulebook-1",
    rulesFileSha256: "a".repeat(64),
    request,
    provisional: true,
    selected,
    documents: [
      {
        ruleKey: "guidelines:3.1.5#owner-signatures",
        entity: "request",
        documentType: "application-form",
        present: true,
        statements: [],
        signedBy: ["owner-1"],
        evidence: [{ fileId: "file-form", page: 1, quote: "Owner signature", region: null }]
      }
    ],
    normalizations: [
      {
        entity: "run-1",
        property: "fence-run.color",
        stated: "River Birtch",
        matchedLabel: "River Birch",
        kind: "fuzzy",
        score: 0.92
      }
    ],
    judgments: [],
    conditionAnswers: [],
    corrections: [],
    findings,
    recommendation: decision.recommendation,
    ...items,
    assessment: `Request information. The colors fail {{rule:${colors}}}; the committee weighs {{rule:${harmony}}}.`,
    feedback: `Choose a listed color under {{rule:${colors}}} and give each run's height.`,
    promptVersions: {},
    costUsd: 0.09,
    durationMs: 1000,
    sessionId: "review-1",
    createdAt: "2026-09-10T12:00:00.000Z"
  }
  const rules = reportRules(rulesFile, selected)
  return { rulesFile, review, rules, terms: reviewTerms(rulesFile, review, rules), files: fenceFiles }
}
