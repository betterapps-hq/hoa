import { relations, sql } from "drizzle-orm"
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Address } from "@/places/address"

// The D1 tables from docs/design/documents.md. JSON columns hold domain objects; repositories validate them with the
// domain's Zod schemas when they read them.

const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>()
const timestamp = (name: string) => text(name).notNull()
// Better Auth's dates, as its Drizzle adapter writes them for SQLite: milliseconds since the epoch.
const authDate = (name: string) => integer(name, { mode: "timestamp_ms" })

// The associations (docs/design/people.md): Better Auth's organization plugin's table, with the app's settings.
/**
 * An address in parts, as the address search fills them (the unit number is an apartment's, suite's or unit's), and
 * the place it found it at (Google Places) and where that is: for the map and nearby suggestions. A unit's, or an
 * association's own.
 */
const addressColumns = () => ({
  street: text("street"),
  unitNumber: text("unit_number"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  placeId: text("place_id"),
  latitude: real("latitude"),
  longitude: real("longitude")
})

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  // The plugin's own; the app keeps its settings in settings_json.
  metadata: text("metadata"),
  // OrganizationSettings. Empty for an organization the plugin made: the settings' defaults fill it in.
  settings: json<unknown>("settings_json").notNull().default({}),
  // The association's own mailing address.
  ...addressColumns(),
  createdAt: authDate("created_at").notNull()
})

export const governingDocuments = sqliteTable(
  "governing_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
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
    removedAt: text("removed_at"),
    // Who removed it, for the committee's recent activity; null for one in use, or removed before this was kept.
    removedBy: text("removed_by")
  },
  (table) => [
    uniqueIndex("governing_documents_lineage_version").on(table.lineageId, table.version),
    uniqueIndex("governing_documents_organization_key").on(table.organizationId, table.key),
    index("governing_documents_organization").on(table.organizationId)
  ]
)

export const provisions = sqliteTable(
  "provisions",
  {
    organizationId: text("organization_id").notNull(),
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
    primaryKey({ columns: [table.organizationId, table.key] }),
    index("provisions_document").on(table.documentId, table.ordinal)
  ]
)

export const sections = sqliteTable(
  "sections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
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
    organizationId: text("organization_id").notNull(),
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
    organizationId: text("organization_id").notNull(),
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
    uniqueIndex("rulebooks_organization_version").on(table.organizationId, table.version),
    // At most one rulebook per HOA is building, and at most one is a draft.
    uniqueIndex("rulebooks_one_building")
      .on(table.organizationId)
      .where(sql`status = 'building'`),
    uniqueIndex("rulebooks_one_draft")
      .on(table.organizationId)
      .where(sql`status = 'draft'`)
  ]
)

export const rules = sqliteTable(
  "rules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
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
    organizationId: text("organization_id").notNull(),
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
    index("rulebook_rules_organization").on(table.organizationId, table.rulebookId)
  ]
)

export const rulebookTerms = sqliteTable(
  "rulebook_terms",
  {
    organizationId: text("organization_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    termKey: text("term_key").notNull(),
    kind: text("kind").notNull(),
    reviewStatus: text("review_status").notNull(),
    contentHash: text("content_hash").notNull(),
    term: json<unknown>("term_json").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.rulebookId, table.termKey] }),
    index("rulebook_terms_organization").on(table.organizationId, table.rulebookId)
  ]
)

export const rulebookQuestions = sqliteTable(
  "rulebook_questions",
  {
    organizationId: text("organization_id").notNull(),
    rulebookId: text("rulebook_id").notNull(),
    id: text("id").notNull(),
    question: json<unknown>("question_json").notNull(),
    answer: json<unknown>("answer_json")
  },
  (table) => [
    primaryKey({ columns: [table.rulebookId, table.id] }),
    index("rulebook_questions_organization").on(table.organizationId, table.rulebookId)
  ]
)

// Each organization's project types (application-review.md, Project types): what a homeowner picks when starting an
// application, with the form it fills in and the documents it uploads. The definition is a ProjectTypeDefinition,
// built against the rulebook named here.
export const projectTypes = sqliteTable(
  "project_types",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    // "active", or "archived": hidden from new applications, kept for the ones that use it.
    status: text("status").notNull(),
    rulebookId: text("rulebook_id"),
    definition: json<unknown>("definition_json").notNull(),
    // Who added it, for the committee's recent activity; null for one added before this was kept.
    createdBy: text("created_by"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("project_types_organization").on(table.organizationId)]
)

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
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
    // When the homeowner last changed what the application says: its description, answers or files.
    revisedAt: text("revised_at"),
    status: text("status").notNull(),
    reviewId: text("review_id"),
    submittedReviewId: text("submitted_review_id"),
    submittedAt: text("submitted_at"),
    decision: json<unknown>("decision_json"),
    deleteAfter: text("delete_after")
  },
  (table) => [
    index("applications_organization_status").on(table.organizationId, table.status),
    index("applications_delete_after").on(table.deleteAfter)
  ]
)

export const applicationFiles = sqliteTable(
  "application_files",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    applicationId: text("application_id").notNull(),
    parentFileId: text("parent_file_id"),
    ordinal: integer("ordinal"),
    contextText: text("context_text"),
    // What the homeowner said the file is: one of the project type's documents, or other.
    uploadedAs: text("uploaded_as"),
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
    organizationId: text("organization_id").notNull(),
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
    organizationId: text("organization_id").notNull(),
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

// Accounts (docs/design/people.md): Better Auth's tables, as its Drizzle adapter reads them. Its dates and flags are
// integers, as its adapter writes them for SQLite.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: authDate("created_at").notNull(),
  updatedAt: authDate("updated_at").notNull(),
  // Better Auth's admin plugin, for the platform's operators rather than an association's: "admin" for an operator,
  // "user" for everyone else. An association's administrators are its members with the "admin" role.
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: authDate("ban_expires")
})

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: authDate("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: authDate("created_at").notNull(),
    updatedAt: authDate("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The operator signed in as this user, when they are; null otherwise.
    impersonatedBy: text("impersonated_by"),
    // The organization the session is in, for someone in several; null until they pick one.
    activeOrganizationId: text("active_organization_id")
  },
  (table) => [index("sessions_user").on(table.userId)]
)

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: authDate("access_token_expires_at"),
    refreshTokenExpiresAt: authDate("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authDate("created_at").notNull(),
    updatedAt: authDate("updated_at").notNull()
  },
  (table) => [index("accounts_user").on(table.userId)]
)

// Who has an account in an organization, and their role there: "admin" manages it, "member" is everyone else. Better
// Auth's organization plugin's table. The roll (people) also has those without an account.
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: authDate("created_at").notNull()
  },
  (table) => [
    uniqueIndex("members_organization_user").on(table.organizationId, table.userId),
    index("members_user").on(table.userId)
  ]
)

// An invitation to join an organization, with the role they'll have: Better Auth's organization plugin's table.
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    // "pending", "accepted", "rejected" or "canceled".
    status: text("status").notNull().default("pending"),
    expiresAt: authDate("expires_at").notNull(),
    createdAt: authDate("created_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
  },
  (table) => [index("invitations_organization").on(table.organizationId), index("invitations_email").on(table.email)]
)

// How Better Auth's tables join, so it reads a session with its user, or a member with theirs, in one query.
export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  members: many(members)
}))
export const organizationRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations)
}))
export const memberRelations = relations(members, ({ one }) => ({
  organization: one(organizations, { fields: [members.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] })
}))
export const invitationRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, { fields: [invitations.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [invitations.inviterId], references: [users.id] })
}))
export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] })
}))
export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] })
}))

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authDate("expires_at").notNull(),
    createdAt: authDate("created_at").notNull(),
    updatedAt: authDate("updated_at").notNull()
  },
  (table) => [index("verifications_identifier").on(table.identifier)]
)

// Better Auth's request counts per visitor and endpoint, kept in D1 because a Worker isolate's memory isn't shared.
export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull()
})

// The association's people (docs/design/people.md): everyone on its roll, with or without an account, the units they
// own or live in, and the board and committees they sit on.

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    // Lowercased; how an account finds its person when it signs in. Null for someone with no email on file.
    email: text("email"),
    phone: text("phone"),
    // Where mail reaches them, when it isn't their unit: an Address.
    mailingAddress: json<Address>("mailing_address_json"),
    // The account that signed in with their email; null until they do. Their role is on its membership (members).
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    // When an administrator took them off the roll; their history stays.
    removedAt: text("removed_at")
  },
  (table) => [
    uniqueIndex("people_organization_email").on(table.organizationId, table.email),
    index("people_organization").on(table.organizationId),
    index("people_user").on(table.userId)
  ]
)

export const units = sqliteTable(
  "units",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    // What the association calls it: a house number by default.
    label: text("label").notNull(),
    ...addressColumns(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    removedAt: text("removed_at")
  },
  (table) => [index("units_organization").on(table.organizationId)]
)

export const unitPeople = sqliteTable(
  "unit_people",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    unitId: text("unit_id").notNull(),
    personId: text("person_id").notNull(),
    // "owner", "resident" or "tenant".
    relation: text("relation").notNull(),
    // Days (YYYY-MM-DD); a sale ends the old owner's and starts the new owner's. Null when it isn't known.
    startedOn: text("started_on"),
    endedOn: text("ended_on"),
    createdAt: timestamp("created_at")
  },
  (table) => [
    index("unit_people_unit").on(table.unitId),
    index("unit_people_person").on(table.personId),
    index("unit_people_organization").on(table.organizationId)
  ]
)

export const committees = sqliteTable(
  "committees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    // "board", "architectural" (decides applications), or "other".
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at"),
    removedAt: text("removed_at")
  },
  (table) => [index("committees_organization").on(table.organizationId)]
)

export const committeeMembers = sqliteTable(
  "committee_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    committeeId: text("committee_id").notNull(),
    personId: text("person_id").notNull(),
    // "chair" or "member".
    role: text("role").notNull(),
    // An officer's title on the board: president, treasurer, secretary. Null for none.
    office: text("office"),
    // One term in the seat: the day it starts, the day it's due to end, and the day it did. Someone keeps the seat past
    // the term's end until it's ended or their next term starts, as an association's bylaws usually say.
    startedOn: text("started_on"),
    termEndsOn: text("term_ends_on"),
    endedOn: text("ended_on"),
    createdAt: timestamp("created_at")
  },
  (table) => [
    index("committee_members_committee").on(table.committeeId),
    index("committee_members_person").on(table.personId)
  ]
)

// Violations (docs/design/violations.md): a broken rule on a unit, the rules it breaks, who answers for it, its photos,
// and what happened, in order. Events are only ever added.
export const violations = sqliteTable(
  "violations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    unitId: text("unit_id").notNull(),
    // What was seen, in a line, and anything more.
    title: text("title").notNull(),
    description: text("description"),
    observedOn: text("observed_on").notNull(),
    // "open", "closed" or "dismissed".
    status: text("status").notNull(),
    // The rulebook in force on the day it was observed, whose rules it cites.
    rulebookId: text("rulebook_id").notNull(),
    reportedBy: text("reported_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [
    index("violations_organization_status").on(table.organizationId, table.status),
    index("violations_unit").on(table.unitId)
  ]
)

export const violationRules = sqliteTable(
  "violation_rules",
  {
    organizationId: text("organization_id").notNull(),
    violationId: text("violation_id").notNull(),
    ruleKey: text("rule_key").notNull()
  },
  (table) => [primaryKey({ columns: [table.violationId, table.ruleKey] })]
)

export const violationPeople = sqliteTable(
  "violation_people",
  {
    organizationId: text("organization_id").notNull(),
    violationId: text("violation_id").notNull(),
    personId: text("person_id").notNull(),
    // The party they are to the documents: "owner", "occupant", "tenant" or "guest".
    party: text("party").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.violationId, table.personId] }),
    index("violation_people_person").on(table.personId)
  ]
)

export const violationPhotos = sqliteTable(
  "violation_photos",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    violationId: text("violation_id").notNull(),
    fileName: text("file_name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [index("violation_photos_violation").on(table.violationId)]
)

export const violationEvents = sqliteTable(
  "violation_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    violationId: text("violation_id").notNull(),
    // What happened: reported, notice, reply, hearing-requested, hearing-set, hearing-held, cured, sanction,
    // dismissed, closed, reopened, note or fact.
    kind: text("kind").notNull(),
    // The day it happened, in the association's time zone.
    occurredOn: text("occurred_on").notNull(),
    note: text("note"),
    details: json<unknown>("details_json"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [index("violation_events_violation").on(table.violationId, table.createdAt)]
)

// The ledger (docs/design/money.md): each unit's charges, payments and credits, never edited or deleted.
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    unitId: text("unit_id").notNull(),
    // "charge", "payment", "credit", or "reversal" of another entry.
    kind: text("kind").notNull(),
    // What it does to the balance, in cents: a charge adds, a payment or credit takes off, a reversal undoes.
    amountCents: integer("amount_cents").notNull(),
    // The day it posts, and a charge's due day, in the association's time zone.
    postedOn: text("posted_on").notNull(),
    dueOn: text("due_on"),
    // A charge's category: dues, special-assessment, fine, late-fee, interest or fee. A payment's method: card, bank,
    // check, cash or other.
    category: text("category"),
    description: text("description").notNull(),
    // A check number, or the payment's id at the processor.
    reference: text("reference"),
    // The rule it cites, in the rulebook it was posted under.
    ruleKey: text("rule_key"),
    rulebookId: text("rulebook_id"),
    // Where it came from: "violation", "schedule", "payment" or "manual", and that record's id.
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    // The entry a reversal undoes.
    reversesId: text("reverses_id"),
    // Posts it once however many times it's asked for: "sanction:{eventId}", "schedule:{id}:{unitId}:{dueOn}".
    postingKey: text("posting_key"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [
    index("ledger_entries_unit").on(table.organizationId, table.unitId, table.postedOn),
    index("ledger_entries_source").on(table.sourceType, table.sourceId),
    uniqueIndex("ledger_entries_posting_key").on(table.organizationId, table.postingKey),
    uniqueIndex("ledger_entries_reverses").on(table.reversesId)
  ]
)

// Which charges each payment, credit or reversal paid or undid, and by how much; a payment's reversal takes its
// allocations back with negative amounts.
export const ledgerAllocations = sqliteTable(
  "ledger_allocations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    unitId: text("unit_id").notNull(),
    fromEntryId: text("from_entry_id").notNull(),
    toEntryId: text("to_entry_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [
    index("ledger_allocations_from").on(table.fromEntryId),
    index("ledger_allocations_to").on(table.toEntryId),
    index("ledger_allocations_unit").on(table.organizationId, table.unitId)
  ]
)

// Dues and special assessments (docs/design/money.md, Dues): what each unit owes, how often, from when.
export const assessmentSchedules = sqliteTable(
  "assessment_schedules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    // "dues" or "special-assessment".
    category: text("category").notNull(),
    // "once", "monthly", "quarterly", "semiannual" or "annual".
    frequency: text("frequency").notNull(),
    // What each unit owes each time, in cents, unless it has its own amount.
    amountCents: integer("amount_cents").notNull(),
    unitAmounts: json<Record<string, number>>("unit_amounts_json"),
    firstDueOn: text("first_due_on").notNull(),
    lastDueOn: text("last_due_on"),
    // The day it was set up: it never posts charges due before then.
    postsFrom: text("posts_from").notNull(),
    // "active", or "ended" once it stops posting.
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("assessment_schedules_organization").on(table.organizationId, table.status)]
)
