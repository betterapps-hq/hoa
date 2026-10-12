import type { BuildResult } from "@/rulebook/buildResults"
import type * as T from "@/schema/types"

// Maple Hollow's declaration, made up for the stories of a build reading its document (DocumentEncodingReader), and a build of it
// timed like Sudden Valley's (simulatedBuild.ts): the provisions as the structure step makes them, and each step's
// results as it writes them: every provision of a section with its rules, settings or reason for none, and two rules
// whose first drafts fail their check and are drafted again. Every word is written for this file.

const documentKey = "declaration"

type Entry = {
  label: string
  kind: T.Provision["kind"]
  heading?: string
  text?: string
  intro?: string
  parent?: string
  printed?: string
}

const provisionOf = ({ label, kind, heading, text, intro, parent, printed }: Entry): T.Provision => ({
  key: `${documentKey}:${label}`,
  kind,
  num: printed ? { printed, normalized: printed.replaceAll(/[()]/g, ""), source: "printed" } : null,
  label,
  heading: heading ?? null,
  parentLabel: parent ?? null,
  intro: intro ?? null,
  text: text ?? "",
  wrapUp: null,
  anchors: [],
  noRule: null
})

const article = (number: number, heading: string, text?: string): Entry => ({
  label: `article-${number}`,
  kind: "article",
  printed: String(number),
  heading,
  text
})
const section = (label: string, heading: string, text: string, intro?: string): Entry => ({
  label,
  kind: "section",
  printed: label,
  parent: `article-${label.split(".")[0]}`,
  heading,
  text,
  intro
})
const point = (label: string, heading: string, text: string): Entry => ({
  label,
  kind: "point",
  printed: label.slice(label.indexOf("(")),
  parent: label.slice(0, label.indexOf("(")),
  heading,
  text
})
const definition = (slug: string, term: string, meaning: string): Entry => ({
  label: `article-2/${slug}`,
  kind: "definition",
  parent: "article-2",
  heading: term,
  text: `"${term}": ${meaning}`
})

const entries: Entry[] = [
  article(1, "General Provisions"),
  section(
    "1.1",
    "Purpose",
    "This Declaration sets the covenants that keep Maple Hollow a pleasant place to live. Every Lot is held, sold and occupied subject to them."
  ),
  section(
    "1.2",
    "Binding Effect",
    "These covenants run with the land and bind every Owner and Resident, and anyone who visits them."
  ),
  article(2, "Definitions", "Capitalized words in this Declaration have the meanings below."),
  definition(
    "association",
    "Association",
    "The Maple Hollow Homeowners Association, which administers this Declaration."
  ),
  definition("board", "Board", "The board of directors of the Association."),
  definition("committee", "Committee", "The design committee the Board appoints to review Improvements."),
  definition("common-area", "Common Area", "Land the Association owns for the shared use of Owners."),
  definition("declarant", "Declarant", "Maple Hollow Partners, which develops the community, and its successors."),
  definition(
    "design-guidelines",
    "Design Guidelines",
    "The standards for Improvements the Committee adopts and publishes."
  ),
  definition("dwelling", "Dwelling", "The house built on a Lot."),
  definition(
    "improvement",
    "Improvement",
    "Any building, fence, wall, driveway or planting, and any change to the outside of a Dwelling."
  ),
  definition("lot", "Lot", "A parcel shown on the recorded plat, other than Common Area."),
  definition("owner", "Owner", "Whoever holds record title to a Lot."),
  definition(
    "resident",
    "Resident",
    "Anyone who lives in a Dwelling, whether an Owner, a tenant or a member of their household."
  ),
  definition("vehicle", "Vehicle", "Any car, truck, motorcycle, boat, trailer or recreational vehicle."),
  article(3, "Use of Lots"),
  section(
    "3.1",
    "Residential Use",
    "Each Lot may be used only for one single-family Dwelling. A home office is allowed if it brings no customers or employees to the Lot."
  ),
  section("3.2", "Animals", "", "Residents may keep household pets, within these limits:"),
  point("3.2(a)", "Number", "No more than three dogs and cats in all may be kept on a Lot."),
  point("3.2(b)", "Leashes", "A dog must be kept on a leash whenever it is in the Common Area."),
  point("3.2(c)", "Livestock", "No livestock or poultry may be kept on any Lot."),
  section(
    "3.3",
    "Vehicles",
    "Boats, trailers and recreational vehicles must be kept in a garage. No Vehicle may be parked on the street overnight."
  ),
  section(
    "3.4",
    "Signs",
    "One real estate sign of up to six square feet may stand on a Lot. Any other sign needs the Board's approval first."
  ),
  section(
    "3.5",
    "Nuisances",
    "No one may do anything on a Lot that disturbs the neighbors. Quiet hours run from 10 p.m. to 7 a.m."
  ),
  section(
    "3.6",
    "Trash",
    "Trash bins and recycling bins must be kept out of sight from the street, except on collection day."
  ),
  section(
    "3.7",
    "Leasing",
    "A Dwelling may be leased only as a whole. Each lease must run for at least six months, and the Owner must give the tenant a copy of this Declaration."
  ),
  article(4, "Architectural Control"),
  section(
    "4.1",
    "Approval Required",
    "No Improvement may be built, installed or changed without the Committee's written approval."
  ),
  section(
    "4.2",
    "Applications",
    "An Owner applies by sending the Committee plans that show the Improvement's location, size, materials and colors. An application the Committee hasn't decided within 30 days is approved."
  ),
  section(
    "4.3",
    "Fences",
    "A fence may be no taller than six feet and must be wood, vinyl or ornamental metal. No fence may be built in a front yard."
  ),
  section(
    "4.4",
    "Exterior Colors",
    "Paint colors for the outside of a Dwelling must come from the palette in the Design Guidelines."
  ),
  section("4.5", "Roofs", "Roofs must be architectural shingles or standing-seam metal, in an earth tone."),
  section(
    "4.6",
    "Solar Panels",
    "Solar panels are allowed on any roof. On a roof that faces the street, they must sit flush with it."
  ),
  section(
    "4.7",
    "Sheds",
    "One shed of up to 120 square feet is allowed in a rear yard. It must be painted to match the Dwelling."
  ),
  section(
    "4.8",
    "Landscaping",
    "Front yard landscaping must be finished within six months after a Dwelling is completed. No tree more than six inches in diameter may be removed without approval."
  ),
  article(5, "Maintenance"),
  section(
    "5.1",
    "Owner Maintenance",
    "Each Owner must keep the Lot, the Dwelling and every Improvement in good repair. Lawns must be mowed and kept free of weeds."
  ),
  section(
    "5.2",
    "Shared Upkeep",
    "Upkeep of the Common Area, the entrance signs and the storm water ponds is shared by all Owners through their assessments."
  ),
  section(
    "5.3",
    "Failure to Maintain",
    "If an Owner leaves a Lot unmaintained for 30 days after written notice, the Association may do the work and charge its cost to the Owner."
  ),
  article(6, "Assessments"),
  section(
    "6.1",
    "Annual Assessment",
    "Each Lot owes an annual assessment that the Board sets in the budget, due on January 1."
  ),
  section(
    "6.2",
    "Late Payment",
    "An assessment unpaid 30 days after it is due bears a late fee of $25 and interest of 12 percent a year."
  ),
  section("6.3", "Lien", "Unpaid assessments, fees and interest are a lien on the Lot."),
  article(7, "Enforcement"),
  section(
    "7.1",
    "Notice and Hearing",
    "Before fining an Owner, the Board must give written notice of the violation and an opportunity for a hearing."
  ),
  section(
    "7.2",
    "Fines",
    "The Board may fine an Owner up to $100 for a violation, and up to $50 a day for a violation that continues after notice."
  )
]

const provisions = entries.map(provisionOf)

/** The declaration as the structure step makes it. */
export const readingDocument = {
  key: documentKey,
  title: "Declaration of Covenants for Maple Hollow",
  provisions
}

const keysFrom = (from: string, to: string) => {
  const labels = provisions.map((provision) => provision.label)
  return provisions.slice(labels.indexOf(from), labels.indexOf(to) + 1).map((provision) => provision.key)
}

/** The two sections the plan splits the declaration into, as Sudden Valley's was. */
const sections = [
  { id: "one", provisionKeys: keysFrom("article-1", "3.7") },
  { id: "two", provisionKeys: keysFrom("article-4", "7.2") }
]

/**
 * Each rule the build finds: the provision it's in, the end of its key, its title and its statement in house style,
 * with term links. Two have a first draft that fails its check.
 */
const ruleEntries: [label: string, slug: string, title: string, statement: string, firstDraft?: string][] = [
  [
    "3.1",
    "single-family",
    "Lots hold one single-family home",
    "Each {{lot}} may hold only one single-family {{dwelling}}."
  ],
  [
    "3.1",
    "home-office",
    "Home offices bring no customers or employees",
    "A {{home-office}} may bring no {{customer:plural}} or {{employee:plural}} to the {{lot}}."
  ],
  [
    "3.2(a)",
    "pet-limit",
    "At most three dogs and cats",
    "A {{lot}} may keep no more than 3 {{dog:plural}} and {{cat:plural}} in all."
  ],
  [
    "3.2(b)",
    "leash",
    "Dogs leashed in the common area",
    "A {{dog}} must be on a {{leash}} whenever it is in the {{common-area}}."
  ],
  ["3.2(c)", "livestock", "No livestock or poultry", "No {{livestock}} or {{poultry}} may be kept on a {{lot}}."],
  [
    "3.3",
    "storage",
    "Boats, trailers and RVs kept in a garage",
    "{{boat:plural}}, {{trailer:plural}} and {{recreational-vehicle:plural}} must be kept in a {{garage}}."
  ],
  [
    "3.3",
    "street-parking",
    "No overnight street parking",
    "No {{vehicle}} may be parked on the {{street}} overnight.",
    "No {{vehicle}} may be parked on the {{street}}."
  ],
  [
    "3.4",
    "sale-sign",
    "One real estate sign up to six square feet",
    "A {{lot}} may show one {{real-estate-sign}} of up to 6 square feet."
  ],
  [
    "3.4",
    "other-signs",
    "Other signs need the board's approval",
    "Any other {{sign}} needs the {{board}}'s approval first."
  ],
  [
    "3.5",
    "nuisance",
    "Nothing that disturbs the neighbors",
    "No {{resident}} may do anything on a {{lot}} that disturbs the {{neighbor:plural}}."
  ],
  ["3.5", "quiet-hours", "Quiet hours from 10 p.m. to 7 a.m.", "{{quiet-hours}} run from 10 p.m. to 7 a.m."],
  [
    "3.6",
    "bins",
    "Bins out of sight except on collection day",
    "{{trash-bin:plural}} and {{recycling-bin:plural}} must be out of sight from the {{street}} except on {{collection-day}}."
  ],
  ["3.7", "whole-home", "Only the whole home may be leased", "A {{dwelling}} may be leased only as a whole."],
  ["3.7", "lease-term", "Leases run six months or more", "Each {{lease}} must run for at least 6 months."],
  [
    "3.7",
    "tenant-copy",
    "Tenants get a copy of the declaration",
    "The {{owner}} must give each {{tenant}} a copy of the declaration."
  ],
  [
    "4.1",
    "approval",
    "Improvements need the committee's approval",
    "No {{improvement}} may be built, installed or changed without the {{committee}}'s written approval."
  ],
  [
    "4.2",
    "plans",
    "Applications show location, size, materials and colors",
    "An {{application}} must include {{plans}} showing the {{improvement}}'s location, size, {{materials}} and colors."
  ],
  [
    "4.2",
    "deemed-approved",
    "Undecided applications approved after 30 days",
    "An {{application}} the {{committee}} hasn't decided within 30 days is approved."
  ],
  ["4.3", "fence-height", "Fences no taller than six feet", "A {{fence}} may be no taller than 6 feet."],
  [
    "4.3",
    "fence-materials",
    "Fences of wood, vinyl or ornamental metal",
    "A {{fence}} must be wood, vinyl or {{ornamental-metal}}."
  ],
  ["4.3", "front-fences", "No fences in front yards", "No {{fence}} may be built in a {{front-yard}}."],
  [
    "4.4",
    "palette",
    "Paint colors from the approved palette",
    "Each {{paint-color}} on a {{dwelling}} must come from the {{palette}}."
  ],
  [
    "4.5",
    "roofing",
    "Roofs of architectural shingles or standing-seam metal",
    "A {{roof}} must be architectural {{shingle:plural}} or standing-seam metal, in an earth tone.",
    "A {{roof}} must be architectural {{shingle:plural}}."
  ],
  [
    "4.6",
    "flush-panels",
    "Street-facing solar panels sit flush",
    "A {{solar-panel}} on a {{roof}} that faces the {{street}} must sit flush with it."
  ],
  [
    "4.7",
    "shed-size",
    "One shed up to 120 square feet, in the rear yard",
    "A {{lot}} may have one {{shed}} of up to 120 square feet, in the {{rear-yard}}."
  ],
  ["4.7", "shed-color", "Sheds painted to match the home", "A {{shed}} must be painted to match the {{dwelling}}."],
  [
    "4.8",
    "landscaping",
    "Front yards landscaped within six months",
    "The {{front-yard}} must be landscaped within 6 months after the {{dwelling}} is completed."
  ],
  [
    "4.8",
    "trees",
    "Large trees removed only with approval",
    "No {{tree}} more than 6 inches in {{diameter}} may be removed without approval."
  ],
  [
    "5.1",
    "repair",
    "Lots and homes kept in good repair",
    "Each {{owner}} must keep the {{lot}}, the {{dwelling}} and every {{improvement}} in good {{repair}}."
  ],
  ["5.1", "lawns", "Lawns mowed and free of weeds", "Each {{lawn}} must be mowed and kept free of {{weed:plural}}."],
  [
    "5.3",
    "self-help",
    "The association can fix a neglected lot at the owner's cost",
    "If a {{lot}} stays unmaintained 30 days after {{notice}}, the {{association}} may do the work at the {{owner}}'s cost."
  ],
  ["6.1", "annual", "Annual assessment due January 1", "Each {{lot}} owes the annual {{assessment}} on January 1."],
  [
    "6.2",
    "late-fee",
    "A $25 late fee after 30 days",
    "An {{assessment}} unpaid 30 days after it's due bears a {{late-fee}} of $25."
  ],
  [
    "6.2",
    "interest",
    "Interest of 12 percent a year on late assessments",
    "An unpaid {{assessment}} bears {{interest}} of 12 percent a year."
  ],
  [
    "7.1",
    "hearing",
    "Notice and a hearing before any fine",
    "Before a {{fine}}, the {{board}} must give {{notice}} of the {{violation}} and a chance for a {{hearing}}."
  ],
  ["7.2", "fine-limit", "Fines up to $100 a violation", "A {{fine}} may be at most $100 a {{violation}}."],
  [
    "7.2",
    "daily-fine",
    "Up to $50 a day for a continuing violation",
    "A continuing {{violation}} may be fined up to $50 a day after {{notice}}."
  ]
]

const rules = ruleEntries.map(([label, slug, title, statement, firstDraft]) => ({
  key: `${documentKey}:${label}#${slug}`,
  title,
  provisionKey: `${documentKey}:${label}`,
  statement,
  firstDraft
}))
type SimulatedRule = (typeof rules)[number]
/** A rule as a result lists it: found, with no statement; drafted, with the statement of that draft. */
const found = ({ key, title, provisionKey }: SimulatedRule) => ({ key, title, provisionKey })
const drafted = (rule: SimulatedRule, round: number) => ({
  ...found(rule),
  statement: round === 0 ? (rule.firstDraft ?? rule.statement) : rule.statement
})

/** Why E gives no rule to a provision that holds none, by label; definitions are cited by rules instead. */
const noRules: Record<string, string> = {
  "article-1": "heading",
  "1.1": "recital",
  "article-2": "explanatory",
  "article-3": "heading",
  "3.2": "explanatory",
  "article-4": "heading",
  "article-5": "heading",
  "5.2": "explanatory",
  "article-6": "heading",
  "6.3": "explanatory",
  "article-7": "heading"
}
/** The settings E flags, by label. */
const settingFlags: Record<string, string[]> = { "1.2": ["Owners answer for their residents and their visitors"] }

/** A section as E answers it: its rules, and every provision with its settings and reason for no rule. */
const answered = (section: (typeof sections)[number]) => ({
  rules: rules.filter((rule) => section.provisionKeys.includes(rule.provisionKey)).map(found),
  provisions: section.provisionKeys.map((key) => {
    const label = key.slice(documentKey.length + 1)
    return { key, settings: settingFlags[label] ?? [], noRule: noRules[label] ?? null }
  })
})

const definedTerms = entries.flatMap((entry) => (entry.kind === "definition" && entry.heading ? [entry.heading] : []))

/** The terms each group of sections' rules read; a group lists a defined term again when its rules read it. */
const vocabularyGroups = [
  ["home office", "customer", "employee", "household pet", "dog", "cat", "leash", "livestock", "poultry", "Lot"],
  [
    "boat",
    "trailer",
    "recreational vehicle",
    "garage",
    "street",
    "real estate sign",
    "neighbor",
    "quiet hours",
    "trash bin",
    "recycling bin",
    "collection day",
    "lease",
    "tenant"
  ],
  [
    "application",
    "plans",
    "location",
    "materials",
    "fence",
    "front yard",
    "ornamental metal",
    "paint color",
    "palette",
    "roof",
    "shingle",
    "solar panel",
    "shed",
    "rear yard",
    "landscaping",
    "tree",
    "diameter",
    "Committee"
  ],
  [
    "repair",
    "lawn",
    "weed",
    "notice",
    "assessment",
    "budget",
    "late fee",
    "interest",
    "lien",
    "fine",
    "hearing",
    "violation"
  ]
]

/** The rules each batch drafts, in order: nine batches, as Sudden Valley's build had. */
const batchSizes = [5, 4, 4, 4, 4, 4, 4, 4, 4]
const batches = batchSizes.map((size, index) => {
  const start = batchSizes.slice(0, index).reduce((sum, count) => sum + count, 0)
  return rules.slice(start, start + size)
})
/** The rules whose first drafts fail their check, drafted again. */
const redrafted = rules.filter((rule) => rule.firstDraft !== undefined)

type Written = { at: number; result: BuildResult }

const [one, two] = sections
const written: Written[] = [
  {
    at: 15.8,
    result: { id: "defined-terms", at: "", kind: "terms", documentKey, labels: definedTerms }
  },
  ...[one, two].flatMap((unit, index) =>
    unit
      ? [
          {
            at: index === 0 ? 150 : 279,
            result: {
              id: `find-rules-${unit.id}`,
              at: "",
              kind: "outlines" as const,
              unitId: unit.id,
              ...answered(unit),
              isRerun: false
            }
          }
        ]
      : []
  ),
  ...vocabularyGroups.map((labels, index) => ({
    at: [420, 560, 700, 803][index] ?? 803,
    result: { id: `vocabulary-${index + 1}`, at: "", kind: "vocabulary" as const, unitId: `group-${index + 1}`, labels }
  })),
  ...batches.map((batch, index) => ({
    at: 839 + index * 21,
    result: {
      id: `structure-rules-${index + 1}`,
      at: "",
      kind: "rules" as const,
      batchId: `batch-${index + 1}`,
      rules: batch.map((rule) => drafted(rule, 0)),
      round: 0
    }
  })),
  {
    at: 1007.5,
    result: { id: "rules-checked-0", at: "", kind: "rules-checked", round: 0, rulesWithProblems: redrafted.length }
  },
  {
    at: 1008.5,
    result: {
      id: "structure-rules-retry",
      at: "",
      kind: "rules",
      batchId: "retry",
      rules: redrafted.map((rule) => drafted(rule, 1)),
      round: 1
    }
  },
  { at: 1009.5, result: { id: "merge", at: "", kind: "combined", conflicts: 0 } },
  { at: 1023, result: { id: "consolidate", at: "", kind: "consolidated", problems: 0, conflicts: 0 } }
]

const isoAt = (now: number, seconds: number, at: number) => new Date(now - (seconds - at) * 1000).toISOString()

/** What the build has written `seconds` in. */
export function readingResults(seconds: number, now = Date.now()): BuildResult[] {
  return written
    .filter((item) => item.at <= seconds)
    .map((item) => ({ ...item.result, at: isoAt(now, seconds, item.at) }))
}

/** The documents the build has structured `seconds` in: the declaration, once reading it is done. */
export const readingDocuments = (seconds: number) => (seconds >= 1.2 ? [readingDocument] : [])
