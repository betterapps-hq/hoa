const stageLabels: Record<string, string> = {
  "resolve-prompts": "Getting ready",
  ocr: "Reading pages",
  visuals: "Describing drawings and photos",
  check: "Checking the documents",
  structure: "Finding provisions",
  analyze: "Reading cross-references",
  vocabulary: "Building the vocabulary",
  plan: "Planning",
  encode: "Encoding rules",
  verify: "Checking the rules",
  repair: "Repairing rules",
  merge: "Merging",
  consolidate: "Consolidating",
  "save-draft": "Saving the draft",
  load: "Loading the rulebook",
  classify: "Sorting the packet",
  subjects: "Finding what the project covers",
  select: "Choosing the rules that apply",
  facts: "Reading the application",
  normalize: "Matching what was read",
  documents: "Checking documents",
  judgments: "Weighing judgment calls",
  evaluate: "Checking rules",
  decide: "Deciding",
  write: "Writing the review",
  "save-review": "Saving the review"
}

/** A job stage's label for people. */
export function stageLabel(stage: string | null) {
  return stage ? (stageLabels[stage] ?? "Working") : "Starting"
}
