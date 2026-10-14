// What the migrations don't record: which columns point at another table's rows without a foreign key in SQL. A new
// column ending in _id that the naming convention can't resolve goes in `pointsAt` (build.ts lists the ones it
// couldn't).

/**
 * Columns whose name doesn't say what they point at: a table, "table.column", "self" or "self.column" for the same
 * table, or null for an id that isn't a row here.
 */
export const pointsAt: Readonly<Record<string, string | null>> = {
  document_id: "governing_documents",
  file_id: "application_files",
  parent_file_id: "application_files",
  submitted_review_id: "reviews",
  parent_id: "self",
  parent_key: "self.key",
  // A job's subject is a document, a rulebook or an application, by the job's kind.
  subject_id: null,
  // Versions of one document share it; no table holds the lineage itself.
  lineage_id: null,
  // The review's Langfuse session.
  session_id: null,
  // The sign-in provider's own ids.
  account_id: null,
  provider_id: null
}

/** Plurals the convention can't make by adding "s". */
export const irregularPlurals: Readonly<Record<string, string>> = { person: "people" }
