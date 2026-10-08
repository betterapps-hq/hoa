const stageLabels: Record<string, string> = {
  "resolve-prompts": "Getting ready",
  ocr: "Reading pages",
  visuals: "Describing drawings and photos",
  structure: "Finding sections",
  route: "Finding relevant sections",
  extract: "Extracting rules",
  verify: "Checking citations",
  consolidate: "Merging rules",
  "save-draft": "Saving the draft",
  classify: "Sorting the packet",
  facts: "Reading the application",
  documents: "Checking documents",
  evaluate: "Checking rules",
  decide: "Deciding",
  write: "Writing the review",
  "save-review": "Saving the review"
}

/** A job stage's label for people. */
export function stageLabel(stage: string | null) {
  return stage ? (stageLabels[stage] ?? "Working") : "Starting"
}
