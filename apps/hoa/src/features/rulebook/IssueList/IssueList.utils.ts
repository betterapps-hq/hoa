import type * as T from "@/schema/types"

export const issueCodeLabels: Record<T.IssueCode, string> = {
  "citation-not-found": "Citation not found",
  "undefined-term": "Unknown term",
  "avoided-label": "Avoided wording",
  "type-mismatch": "Types don’t match",
  "invalid-value": "Value not allowed",
  "ambiguous-label": "Ambiguous wording",
  conflict: "Conflict",
  "override-not-allowed": "Override not allowed",
  "table-overlap": "Table rows overlap",
  "text-condition": "Free-text condition",
  "absent-in-exception": "Silence denies an exception",
  "undefined-document": "Unknown document",
  "unencoded-quantity": "Amount not encoded",
  "modality-cue-mismatch": "Wording suggests another modality",
  "duplicate-key": "Duplicate key",
  "invalid-key": "Key doesn’t fit",
  "undefined-rule": "Unknown rule",
  invariant: "Breaks a schema invariant",
  coverage: "Coverage"
}
