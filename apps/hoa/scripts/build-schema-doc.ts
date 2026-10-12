import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { coreTerms } from "../src/schema/coreTerms.ts"
import * as ex from "../src/schema/examples.test-data.ts"

// Generates docs/design/schema.md (the template with the types from src/schema/types.ts and one example) and
// docs/design/schema-examples.md (every checked example as JSON). Usage, from apps/hoa: pnpm docs:schema
const here = join(import.meta.dirname, "schema-doc")
const design = join(import.meta.dirname, "../docs/design")
const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r\n", "\n")

// ─── Examples as JSON: null, empty and bookkeeping fields dropped, short objects kept on one line ─────

const WIDTH = 116
const ORDER = [
  "key",
  "kind",
  "domain",
  "title",
  "statement",
  "requestTypes",
  "appliesTo",
  "appliesWhen",
  "scope",
  "authority",
  "effectiveFrom",
  "modality",
  "bearer",
  "beneficiary",
  "decidedBy",
  "imposedBy",
  "enforces",
  "limits",
  "forbids",
  "maxAmount",
  "maxTotal",
  "overrides",
  "noExceptions",
  "check",
  "sanction",
  "remedy",
  "cure"
]
const rank = (key: string) => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length)
const isObject = (value: unknown): value is object => typeof value === "object" && value !== null

// A record (it has a key) shows no bookkeeping, and neither does a label.
function isBookkeeping(record: object, key: string) {
  if ("key" in record) {
    return ["provenance", "review", "issues", "citations"].includes(key)
  }
  return "role" in record && "text" in record && key === "provenance"
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prune)
  }
  if (!isObject(value)) {
    return value
  }
  const entries = Object.entries(value)
    .filter(
      ([key, child]) =>
        !isBookkeeping(value, key) &&
        (child !== null || key === "organizationId") &&
        !(Array.isArray(child) && child.length === 0 && key !== "path")
    )
    .map(([key, child]) => [key, prune(child)] as const)
  const isRule = entries.some(([key]) => key === "requestTypes" || key === "effectiveFrom")
  return Object.fromEntries(isRule ? entries.sort(([a], [b]) => rank(a) - rank(b)) : entries)
}

function inline(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(inline).join(", ")}]`
  }
  if (isObject(value)) {
    const entries = Object.entries(value)
    return entries.length === 0
      ? "{}"
      : `{ ${entries.map(([key, child]) => `${JSON.stringify(key)}: ${inline(child)}`).join(", ")} }`
  }
  return JSON.stringify(value)
}

function format(value: unknown, indent: number, prefix: number): string {
  const flat = inline(value)
  if (indent + prefix + flat.length <= WIDTH || !isObject(value)) {
    return flat
  }
  const pad = " ".repeat(indent + 2)
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => pad + format(item, indent + 2, 0)).join(",\n")}\n${" ".repeat(indent)}]`
  }
  const lines = Object.entries(value).map(([key, child]) => {
    const head = `${JSON.stringify(key)}: `
    return pad + head + format(child, indent + 2, head.length)
  })
  return `{\n${lines.join(",\n")}\n${" ".repeat(indent)}}`
}

const render = (value: unknown) => format(prune(value), 0, 0)

function wrap(text: string, width = 120) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  return [...lines, line].join("\n")
}

type Entry = { title: string; text: string; value: unknown }
type Group = { title: string; entries: Entry[] }

const core = (key: string) => coreTerms.find((term) => term.key === key)
const org = (key: string) => ex.organizationTerms.find((term) => term.key === key)

const groups: Group[] = [
  {
    title: "Core terms",
    entries: [
      {
        title: "A thing: lot",
        text: "Ships with the portal, so its organizationId is null and every organization has it. Paths start at it, so code depends on its key.",
        value: core("lot")
      },
      {
        title: "A party: committee",
        text: "The body that decides applications. The application workflow refers to it, so it's core.",
        value: core("committee")
      },
      {
        title: "A request field: submitted on",
        text: "The application workflow supplies it as a fact; response deadlines count from it.",
        value: core("architectural-application.submitted-on")
      },
      {
        title: "A request field: notice delivered on",
        text: "The enforcement workflow supplies it when notice is actually delivered; cure periods and fines count from it.",
        value: core("violation.notice-delivered-on")
      },
      {
        title: "A unit: foot",
        text: 'Units are terms, so the matcher resolves "6\'" the same way it resolves any label.',
        value: core("foot")
      }
    ]
  },
  {
    title: "Organization terms",
    entries: [
      {
        title: "A core term, refined: Unit",
        text: "The sample organization's documents call lots Units. Its refinement of lot changes only the labels; the kind and key stay the same.",
        value: org("lot")
      },
      {
        title: "A core term, refined: Reviewer",
        text: "The sample guidelines call the committee the Reviewer.",
        value: org("committee")
      },
      {
        title: "A thing: fence run",
        text: "Generated from the guidelines. The alternative labels are the surface forms the matcher accepts.",
        value: org("fence-run")
      },
      {
        title: "A property: fence height",
        text: "Stored in inches; any length converts. The scope note keeps lattice out.",
        value: org("fence-run.height")
      },
      {
        title: "A property that's absent when unstated",
        text: "An application that doesn't mention lattice has none, so its lattice height counts as 0 instead of missing.",
        value: org("fence-run.lattice-height")
      },
      {
        title: "A category: return fence",
        text: "A kind of fence run, with criteria code can test.",
        value: org("return-fence")
      },
      {
        title: "A category judged from text",
        text: "When membership can't be expressed with properties, the criteria are text and a model decides, and it's counted as an escape hatch.",
        value: org("neighbor")
      },
      {
        title: "A value: Winchester Grey",
        text: "Spelling variants are alternative labels; a known misspelling is hidden.",
        value: org("composite-color.winchester-grey")
      },
      {
        title: "A derived property: notice deemed delivered",
        text: "A deeming clause (illustrative): mailed notice counts as delivered three days after mailing. It's its own property, so the actual delivery date can still be recorded.",
        value: org("violation.notice-deemed-delivered-on")
      }
    ]
  },
  {
    title: "Sources",
    entries: [
      {
        title: "A governing document",
        text: "The guidelines as uploaded: one file, the 2025 text. An amended document is consolidated instead, compiled from the original and each amendment's file.",
        value: ex.guidelines
      },
      {
        title: "A referenced document",
        text: "Named by other documents but not uploaded, so rules can enforce it by key and coverage lists it as missing.",
        value: ex.byLaws
      },
      { title: "A provision", text: "Its key is its document's key and its label.", value: ex.provision542 },
      {
        title: "A rule from an amended provision",
        text: "If the board amends 5.5.1(i) to 78 inches, the rules file generated afterwards holds the consolidated guidelines, and this rule reads 78 inches from the amendment's date.",
        value: ex.maxHeightAmended
      }
    ]
  },
  {
    title: "Architectural rules",
    entries: [
      {
        title: "Colors by manufacturer (5.4.2(i))",
        text: "A table keyed by manufacturer. Trex in River Birch matches no row, so it's not met; the remedy is a change of detail.",
        value: ex.compositeColors
      },
      {
        title: "Other manufacturers case by case (5.3.2)",
        text: "A discretion rule. It can't make anything compliant; it sends a not-met finding for an unlisted manufacturer to the committee.",
        value: ex.otherManufacturers
      },
      {
        title: "Listed manufacturers (5.3.2)",
        text: "The other rule the discretion rule covers.",
        value: ex.manufacturers
      },
      {
        title: "Boundary and return fences at most 72 inches (5.5.1(i))",
        text: "Applies through two categories. It runs in applications and in violations, so an existing fence is judged by the same rule.",
        value: ex.maxHeight
      },
      {
        title: "Fence plus lattice at most 90 inches (5.5.1(ii))",
        text: "A sum. Lattice that isn't mentioned counts as 0, and a 95-inch fence fails even when its lattice height is unclear.",
        value: ex.fenceAndLattice
      },
      { title: "Metal 48 to 72 inches (5.5.2)", text: "A closed range.", value: ex.metalHeight },
      {
        title: "Variations may be considered (5.5.2)",
        text: "The same sentence's exception, as a discretion rule with the same citation.",
        value: ex.metalVariations
      },
      {
        title: "Front setback (5.6.2(ii))",
        text: '"Should": a failure is advisory, never not met.',
        value: ex.frontSetback
      },
      {
        title: "Neighbor approval (5.6.1(i))",
        text: "A document check per boundary run. A missing form asks for the document; a neighbor who refuses means moving the fence off the boundary.",
        value: ex.neighborApproval
      },
      {
        title: "Driver sight lines (5.6.2(i))",
        text: "A judgment, phrased so that yes complies. A model answers from the evidence; the committee has the final say.",
        value: ex.sightLines
      },
      {
        title: "Work needs prior approval",
        text: "An approval check: the committee's written approval, dated before the work, must be recorded. In an application with no decision yet, it goes to the committee; in a violation, no recorded approval is not met.",
        value: ex.priorApproval
      },
      {
        title: "Either body's approval",
        text: "Illustrative: needs any one of the parties in by. With needs all, every one of them must approve.",
        value: ex.eitherApproval
      },
      {
        title: "Gates match the fence (5.4.2(iii))",
        text: "A path that follows the gate's reference to its fence run.",
        value: ex.gateColor
      },
      {
        title: "Committee decides within 30 days",
        text: "A deadline on the committee. When it's missed, the finding reports a deemed approval, and the application workflow records it.",
        value: ex.committeeResponse
      },
      {
        title: "Existing fences may remain",
        text: "A permission with an overrides selector: it exempts an approved fence from every guidelines rule adopted after the fence was installed, including rules added later.",
        value: ex.grandfathered
      },
      {
        title: "A variance for one approved fence",
        text: "A rule from a decision, scoped to the approved improvement on Unit 42 and ranked by the variance power it cites.",
        value: ex.variance
      },
      {
        title: "An outright prohibition",
        text: "No check: every solar device it applies to is not met.",
        value: ex.noSolar
      },
      {
        title: "State law overrides it",
        text: "A permission from law. It exempts roof-mounted devices from the organization's prohibition.",
        value: ex.solarLaw
      }
    ]
  },
  {
    title: "Use restrictions",
    entries: [
      {
        title: "No commercial vehicles on the street overnight",
        text: "A daily window over an event's start and end. An event is over, so it can't be cured.",
        value: ex.overnightParking
      },
      {
        title: "Trash containers out only around pickup",
        text: "A window around each date of the community's pickup schedule.",
        value: ex.trashContainers
      },
      {
        title: "At most three dogs and cats",
        text: "A count with a filter. If the list of pets isn't complete, the count can only fail or be unknown.",
        value: ex.petLimit
      },
      { title: "Leases at least 12 months", text: "Months compare with months and years.", value: ex.minimumLease },
      {
        title: "Rental cap",
        text: "Community-wide numbers come in as facts on the community, from the leasing feature; the rule doesn't count other requests.",
        value: ex.rentalCap
      }
    ]
  },
  {
    title: "Maintenance, money and enforcement",
    entries: [
      {
        title: "Keep landscaping maintained",
        text: "A judgment the board decides, with a cure period counted from the notice.",
        value: ex.maintainLandscaping
      },
      {
        title: "Self-help",
        text: "A sanction: once the cure period passes, the organization may do the work and charge its cost.",
        value: ex.selfHelp
      },
      {
        title: "Assessment due January 1",
        text: "A deadline on the owner, with 15 days to cure counted from the due date.",
        value: ex.assessmentDue
      },
      {
        title: "Late fee",
        text: "The greater of $25 and 10 percent of the unpaid balance, once the assessment rule's cure period has passed.",
        value: ex.lateFee
      },
      {
        title: "Fine schedule",
        text: "Escalating fines counted per owner, then a daily fine while the violation continues, capped. It enforces the whole Rules document; notice and hearing come from the settings, and the cure period applies on its own.",
        value: ex.fineSchedule
      },
      {
        title: "A legal cap on fines",
        text: "A limit rule (illustrative): it caps the fine schedule's total at $500 per violation.",
        value: ex.fineLimit
      }
    ]
  },
  {
    title: "Governance",
    entries: [
      { title: "Meeting notice 10 to 60 days ahead", text: "A window before the meeting.", value: ex.meetingNotice },
      {
        title: "Quorum",
        text: "A requirement: a condition the meeting needs to act, with no party bearing it. The total voting power comes in as a fact on the community.",
        value: ex.quorum
      },
      {
        title: "Declaration amendment vote",
        text: "67 percent of all votes, not of votes cast: the base is explicit.",
        value: ex.amendmentVote
      },
      {
        title: "Records within 10 business days",
        text: "Business days skip weekends and holidays.",
        value: ex.recordsRequest
      },
      {
        title: "An annual meeting each year",
        text: "A recurring duty: the portal creates a compliance period for each scheduled date, and the deadline runs within it.",
        value: ex.annualMeeting
      },
      {
        title: "Board candidates own a lot for 12 months",
        text: "Judged as of the governing date, the day the nomination was filed, so it gives the same answer whenever it's evaluated.",
        value: ex.candidateOwnership
      }
    ]
  },
  {
    title: "Settings, a question and an evaluation",
    entries: [
      {
        title: "Organization settings",
        text: "Clauses from the documents, each cited, and the organization's own policy choices. Violation sanctions need notice and any requested hearing first, except self-help.",
        value: ex.settings
      },
      {
        title: "An interpretation question",
        text: "Two readings of 5.5.1(i), each a candidate rule. The answer approves one and rejects the other.",
        value: ex.interpretation
      },
      {
        title: "An evaluation request",
        text: "What the application workflow sends: the subjects, the facts extracted from the applicant's files, and the dates.",
        value: ex.request
      },
      {
        title: "The findings it gets back",
        text: "Trex in River Birch is not met. Fiberon goes to the committee through the discretion rule. The rear run's height and boundary are missing information.",
        value: ex.findings
      }
    ]
  }
]

const fence = "```"
const jsonBlock = (entry: Entry) => `${fence}json\n${render(entry.value)}\n${fence}`
const entries = groups.flatMap((group) => group.entries)
const body = groups
  .map(
    (group) =>
      `## ${group.title}\n\n` +
      group.entries.map((entry) => `### ${entry.title}\n\n${wrap(entry.text)}\n\n${jsonBlock(entry)}`).join("\n\n")
  )
  .join("\n\n")

// ─── The schema page: each "// ─── Name" section of types.ts, and examples by title ───────────────

const sections = new Map<string, string[]>()
let current: string[] | null = null
for (const line of read(join(import.meta.dirname, "../src/schema/types.ts")).split("\n")) {
  const header = /^\/\/ ─── ([^:─]+?)(:.*)? ─/.exec(line)
  if (header?.[1]) {
    current = []
    sections.set(header[1].trim(), current)
  } else if (current) {
    current.push(line.replace(/^export /, ""))
  }
}

function typesBlock(name: string) {
  const lines = sections.get(name)
  if (!lines) {
    throw new Error(`types.ts has no section ${name}`)
  }
  return `${fence}ts\n${lines.join("\n").replace(/^\n+|\n+$/g, "")}\n${fence}`
}

function exampleBlock(title: string) {
  const entry = entries.find((candidate) => candidate.title === title)
  if (!entry) {
    throw new Error(`no example titled ${title}`)
  }
  return jsonBlock(entry)
}

const schema = read(join(here, "template.md"))
  .replaceAll("__DIAGRAM__", () => read(join(here, "diagram.txt")).replace(/\n+$/, ""))
  .replaceAll("__EXAMPLE_COUNT__", String(entries.length))
  .replace(/__TYPES:([^_]+)__/g, (_, name: string) => typesBlock(name))
  .replace(/__EXAMPLE:(.+?)__/g, (_, title: string) => exampleBlock(title))
const leftover = schema.match(/__(TYPES|EXAMPLE|DIAGRAM)[^_]*__/)
if (leftover) {
  throw new Error(`unreplaced placeholder ${leftover[0]}`)
}

writeFileSync(join(design, "schema.md"), schema)
writeFileSync(join(design, "schema-examples.md"), `${read(join(here, "header.md"))}${body}\n`)
console.warn(`schema.md and schema-examples.md: ${entries.length} examples, ${sections.size} type sections`)
