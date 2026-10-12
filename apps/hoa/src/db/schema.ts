import { sql } from "drizzle-orm"
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

// The D1 tables from docs/design/documents.md. JSON columns hold domain objects; repositories validate them with the
// domain's Zod schemas when they read them.

const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>()
const timestamp = (name: string) => text(name).notNull()

export const hoas = sqliteTable("hoas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: json<unknown>("settings_json").notNull(),
  createdAt: timestamp("created_at")
})

export const governingDocuments = sqliteTable(
  "governing_documents",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    lineageId: text("lineage_id").notNull(),
    version: integer("version").notNull(),
    kind: text("kind").notNull(),
    amends: text("amends"),
    title: text("title").notNull(),
    effectiveDate: text("effective_date"),
    // Null for a document with no file: one the rules name that nobody uploaded.
    fileName: text("file_name"),
    mediaType: text("media_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    pageCount: integer("page_count"),
    status: text("status").notNull(),
    error: json<unknown>("error_json"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at"),
    // The rules schema's view of the document (its GoverningDocument), once a build or the seed has keyed it.
    key: text("key"),
    document: json<unknown>("document_json"),
    // How a build structures the upload (documents/documentStructure.ts); null until an administrator sets it.
    structure: json<unknown>("structure_json"),
    // When an administrator removed the document: builds and the documents list leave it out, while what already
    // cites its pages still opens them. Null for a document in use.
    removedAt: text("removed_at")
  },
  (table) => [
    uniqueIndex("governing_documents_lineage_version").on(table.lineageId, table.version),
    uniqueIndex("governing_documents_hoa_key").on(table.hoaId, table.key),
    index("governing_documents_hoa").on(table.hoaId)
  ]
)

export const provisions = sqliteTable(
  "provisions",
  {
    hoaId: text("hoa_id").notNull(),
    documentId: text("document_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    parentKey: text("parent_key"),
    kind: text("kind").notNull(),
    ordinal: integer("ordinal").notNull(),
    // The whole Provision; the columns above exist for lookups and ordering.
    provision: json<unknown>("provision_json").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.hoaId, table.key] }),
    index("provisions_document").on(table.documentId, table.ordinal)
  ]
)

export const sections = sqliteTable(
  "sections",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    documentId: text("document_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    number: text("number"),
    heading: text("heading").notNull(),
    kind: text("kind").notNull(),
    parentId: text("parent_id"),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    references: json<string[]>("references_json").notNull(),
    routing: json<unknown>("routing_json")
  },
  (table) => [uniqueIndex("sections_document_ordinal").on(table.documentId, table.ordinal)]
)

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    kind: text("kind").notNull(),
    subjectId: text("subject_id").notNull(),
    status: text("status").notNull(),
    stage: text("stage"),
    done: integer("done").notNull(),
    total: integer("total").notNull(),
    promptVersions: json<Record<string, number>>("prompt_versions_json").notNull(),
    failures: json<unknown[]>("failures_json").notNull(),
    error: json<unknown>("error_json"),
    progress: json<unknown>("progress_json"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("jobs_subject").on(table.subjectId, table.createdAt)]
)

export const rulebooks = sqliteTable(
  "rulebooks",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    version: integer("version"),
    status: text("status").notNull(),
    error: json<unknown>("error_json"),
    catalogVersion: integer("catalog_version").notNull(),
    sourceDocumentIds: json<string[]>("source_document_ids_json").notNull(),
    jobId: text("job_id").notNull(),
    createdAt: timestamp("created_at"),
    publishedBy: text("published_by"),
    publishedAt: text("published_at"),
    settings: json<unknown>("settings_json"),
    fileKey: text("file_key"),
    fileSha256: text("file_sha256"),
    coverage: json<unknown>("coverage_json")
  },
  (table) => [
    uniqueIndex("rulebooks_hoa_version").on(table.hoaId, table.version),
    // At most one rulebook per HOA is building, and at most one is a draft.
    uniqueIndex("rulebooks_one_building")
      .on(table.hoaId)
      .where(sql`status = 'building'`),
    uniqueIndex("rulebooks_one_draft")
      .on(table.hoaId)
      .where(sql`status = 'draft'`)
  ]
)

export const rules = sqliteTable(
  "rules",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    ruleKey: text("rule_key").notNull(),
    // The whole Rule, validated by the domain schema; the columns above exist for lookups and constraints.
    rule: json<unknown>("rule_json").notNull()
  },
  (table) => [uniqueIndex("rules_rulebook_key").on(table.rulebookId, table.ruleKey)]
)

// A rulebook's records in the rules schema (encoding.md, Storage). Each JSON column holds the whole record; the other
// columns exist for filtering and for carrying approvals forward.

export const rulebookRules = sqliteTable(
  "rulebook_rules",
  {
    hoaId: text("hoa_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    ruleKey: text("rule_key").notNull(),
    kind: text("kind").notNull(),
    requestTypes: json<string[]>("request_types").notNull(),
    appliesTo: text("applies_to"),
    reviewStatus: text("review_status").notNull(),
    contentHash: text("content_hash").notNull(),
    rule: json<unknown>("rule_json").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.rulebookId, table.ruleKey] }),
    index("rulebook_rules_hoa").on(table.hoaId, table.rulebookId)
  ]
)

export const rulebookTerms = sqliteTable(
  "rulebook_terms",
  {
    hoaId: text("hoa_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    termKey: text("term_key").notNull(),
    kind: text("kind").notNull(),
    reviewStatus: text("review_status").notNull(),
    contentHash: text("content_hash").notNull(),
    term: json<unknown>("term_json").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.rulebookId, table.termKey] }),
    index("rulebook_terms_hoa").on(table.hoaId, table.rulebookId)
  ]
)

export const rulebookQuestions = sqliteTable(
  "rulebook_questions",
  {
    hoaId: text("hoa_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    id: text("id").notNull(),
    question: json<unknown>("question_json").notNull(),
    answer: json<unknown>("answer_json")
  },
  (table) => [
    primaryKey({ columns: [table.rulebookId, table.id] }),
    index("rulebook_questions_hoa").on(table.hoaId, table.rulebookId)
  ]
)

// Each organization's project types (application-review.md, Project types): what a homeowner picks when starting an
// application, with the form it fills in and the documents it uploads. The definition is a ProjectTypeDefinition,
// built against the rulebook named here.
export const projectTypes = sqliteTable(
  "project_types",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    // "active", or "archived": hidden from new applications, kept for the ones that use it.
    status: text("status").notNull(),
    rulebookId: text("rulebook_id"),
    definition: json<unknown>("definition_json").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("project_types_hoa").on(table.hoaId)]
)

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    // The first build's project type, written as its one value until cutover drops it (implementation-plan.md, 9.6).
    firstBuildProjectType: text("project_type").notNull(),
    // The rulebook project kind the first review build stored; unused since project types, dropped at cutover.
    projectKind: text("project_kind"),
    // The organization's project type the homeowner chose (project_types.id); null for "Something else".
    projectTypeId: text("project_type_id"),
    // The homeowner's answers to the project type's form (ProjectAnswers).
    answers: json<unknown>("answers_json"),
    description: text("description"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    status: text("status").notNull(),
    reviewId: text("review_id"),
    submittedReviewId: text("submitted_review_id"),
    submittedAt: text("submitted_at"),
    decision: json<unknown>("decision_json"),
    deleteAfter: text("delete_after")
  },
  (table) => [
    index("applications_hoa_status").on(table.hoaId, table.status),
    index("applications_delete_after").on(table.deleteAfter)
  ]
)

export const applicationFiles = sqliteTable(
  "application_files",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    applicationId: text("application_id").notNull(),
    parentFileId: text("parent_file_id"),
    ordinal: integer("ordinal"),
    contextText: text("context_text"),
    fileName: text("file_name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    pageCount: integer("page_count"),
    kind: text("kind"),
    status: text("status").notNull(),
    error: json<unknown>("error_json"),
    createdAt: timestamp("created_at")
  },
  (table) => [index("application_files_application").on(table.applicationId)]
)

export const applicationPages = sqliteTable(
  "application_pages",
  {
    hoaId: text("hoa_id").notNull(),
    fileId: text("file_id").notNull(),
    pageIndex: integer("page_index").notNull(),
    kind: text("kind").notNull()
  },
  (table) => [primaryKey({ columns: [table.fileId, table.pageIndex] })]
)

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    hoaId: text("hoa_id").notNull(),
    applicationId: text("application_id").notNull(),
    jobId: text("job_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    rulesFileSha256: text("rules_file_sha256"),
    recommendation: text("recommendation").notNull(),
    costUsd: real("cost_usd").notNull(),
    sessionId: text("session_id").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [index("reviews_application").on(table.applicationId, table.createdAt)]
)
