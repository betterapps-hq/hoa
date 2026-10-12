import type { DocumentKind, Provision, ProvisionKey } from "@/schema/types"
import { romanToInt } from "./numbering"
import type { StructuredDocument } from "./provisions"

// References (encoding.md, References and analysis): a grammar for the ways governing documents cite each other
// ("Section 7.4(a)", "Article 4", "subsection (b) above", "this Section", "Exhibit "C"", "the By-Laws"), resolved
// against the provision index. Relative references resolve from the citing provision's position, and documents that
// are named but not uploaded become referenced documents (`edition: null`).

export type ReferenceTarget = { type: "provision"; key: ProvisionKey } | { type: "document"; key: string }

/** A citation found in a provision's text, with its offsets; target null when nothing resolves it. */
export type Reference = { text: string; start: number; end: number; target: ReferenceTarget | null }

/** An uploaded document and the names its text uses for it: "Declaration", "Use Restrictions". */
export type KnownDocument = { key: string; names: readonly string[] }

export type ReferencedDocument = { key: string; kind: DocumentKind; title: string }

// Documents governing documents commonly name without attaching. Keys come from the name as printed.
const commonDocuments: { pattern: RegExp; kind: DocumentKind }[] = [
  { pattern: /By-?Laws/, kind: "bylaws" },
  { pattern: /Articles of Incorporation/, kind: "articles" },
  { pattern: /(?:Board\s+)?Rules and Regulations/, kind: "rules" },
  { pattern: /(?:Residential\s+|Architectural\s+)?Design Guidelines/, kind: "design-guidelines" }
]

const number = String.raw`\d+(?:(?:\.|\s)\d+)+(?:\s?\([A-Za-z0-9]{1,4}\))*`
const sectionList = new RegExp(
  String.raw`\b(?:Sections?|Subsections?|§§?)\s+(${number}(?:\s*(?:,|and|or|through)\s*${number})*)`,
  "g"
)
const articleList = /\bArticles?\s+((?:\d+|[IVXL]+)\b(?:\s*(?:,|and|or)\s*(?:\d+|[IVXL]+)\b)*)/g
const exhibitList = /\bExhibits?\s+((?:["“]?[A-Z]\b["”]?,?)(?:\s*(?:,|and|or)\s*["“]?[A-Z]\b["”]?,?)*)/g
const relative = /\b(?:subsection|paragraph|clause)\s+((?:\([A-Za-z0-9]{1,4}\))+)/gi
const enclosing = /\bthis\s+(Section|Article|Subsection)\b/g
const enclosingKinds: Record<string, Provision["kind"][]> = {
  Article: ["article"],
  Section: ["section"],
  Subsection: ["point", "section"]
}
const qualifier = /^\s+of\s+(?:the|this|such)\s+((?:[A-Z][\w-]*)(?:\s+(?:of\s+)?[A-Z][\w-]*)*)/

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/** "3 1(a)" as a scan prints it is the label 3.1(a). */
const labelOf = (printed: string) => printed.replace(/(\d)\s+(?=\d)/g, "$1.").replace(/\s+\(/g, "(")

type Index = {
  documents: readonly StructuredDocument[]
  known: readonly KnownDocument[]
  byKey: Map<ProvisionKey, Provision>
}

function documentKeyOf(key: ProvisionKey) {
  return key.slice(0, key.indexOf(":"))
}

/** A label in the citing document first, then the others; else its nearest existing ancestor ("7.4" for "7.4(z)"). */
function resolveLabel(index: Index, label: string, from: string): ReferenceTarget | null {
  const order = [from, ...index.documents.map((document) => document.key).filter((key) => key !== from)]
  for (let candidate = label; candidate; candidate = candidate.replace(/\([^()]*\)$/, "")) {
    for (const documentKey of order) {
      const key = `${documentKey}:${candidate}`
      if (index.byKey.has(key)) {
        return { type: "provision", key }
      }
    }
    if (!candidate.endsWith(")")) {
      break
    }
  }
  return null
}

function namedDocument(index: Index, name: string): ReferenceTarget | null {
  const known = index.known.find((document) => document.names.some((known) => name.startsWith(known)))
  if (known) {
    return { type: "document", key: known.key }
  }
  const common = commonDocuments.find(({ pattern }) => new RegExp(`^${pattern.source}$`).test(name))
  return common ? { type: "document", key: slugOf(name) } : null
}

function ancestors(index: Index, provision: Provision) {
  const chain: Provision[] = [provision]
  const documentKey = documentKeyOf(provision.key)
  for (let current = provision; current.parentLabel !== null;) {
    const parent = index.byKey.get(`${documentKey}:${current.parentLabel}`)
    if (!parent) {
      break
    }
    chain.push(parent)
    current = parent
  }
  return chain
}

function findReferences(provision: Provision, index: Index): Reference[] {
  const text = [provision.intro, provision.text, provision.wrapUp].filter(Boolean).join("\n")
  const from = documentKeyOf(provision.key)
  const references: Reference[] = []
  const add = (found: string, start: number, target: ReferenceTarget | null) =>
    references.push({ text: found, start, end: start + found.length, target })

  // "Section 4.2 of the By-Laws" cites a document that isn't uploaded; "of this Declaration" one that is.
  const resolveIn = (label: string, end: number) => {
    const name = qualifier.exec(text.slice(end))?.[1]
    const document = name ? namedDocument(index, name) : null
    if (document?.type !== "document") {
      return resolveLabel(index, label, from)
    }
    const isUploaded = index.documents.some((known) => known.key === document.key)
    return isUploaded ? resolveLabel(index, label, document.key) : document
  }

  for (const found of text.matchAll(sectionList)) {
    for (const item of (found[1] ?? "").matchAll(new RegExp(number, "g"))) {
      const start = found.index + found[0].indexOf(item[0])
      add(item[0], start, resolveIn(labelOf(item[0]), found.index + found[0].length))
    }
  }
  for (const found of text.matchAll(articleList)) {
    for (const item of (found[1] ?? "").matchAll(/\d+|[IVXL]+/g)) {
      const value = /^\d+$/.test(item[0]) ? Number(item[0]) : romanToInt(item[0].toLowerCase())
      const start = found.index + found[0].indexOf(item[0])
      add(item[0], start, resolveIn(`article-${value ?? item[0]}`, found.index + found[0].length))
    }
  }
  for (const found of text.matchAll(exhibitList)) {
    for (const item of (found[1] ?? "").matchAll(/\b[A-Z]\b/g)) {
      add(found[0], found.index, resolveLabel(index, `exhibit-${item[0].toLowerCase()}`, from))
    }
  }
  const chain = ancestors(index, provision)
  for (const found of text.matchAll(relative)) {
    const marker = found[1] ?? ""
    const target = chain.map((ancestor) => `${from}:${ancestor.label}${marker}`).find((key) => index.byKey.has(key))
    add(found[0], found.index, target ? { type: "provision", key: target } : null)
  }
  for (const found of text.matchAll(enclosing)) {
    const kinds = enclosingKinds[found[1] ?? ""] ?? []
    const target = chain.find((ancestor) => kinds.includes(ancestor.kind))
    add(found[0], found.index, target ? { type: "provision", key: target.key } : null)
  }
  for (const known of index.known) {
    for (const name of known.names) {
      for (const found of text.matchAll(new RegExp(String.raw`\b(?:this|the|such)\s+${name}\b`, "g"))) {
        add(found[0], found.index, { type: "document", key: known.key })
      }
    }
  }
  for (const { pattern } of commonDocuments) {
    for (const found of text.matchAll(new RegExp(String.raw`\b(?:the|such)\s+(${pattern.source})\b`, "g"))) {
      add(found[0], found.index, namedDocument(index, found[1] ?? ""))
    }
  }
  return references.toSorted((a, b) => a.start - b.start)
}

/**
 * Finds and resolves the references in every provision (encoding.md, References): by provision key, with the
 * documents that are named but not uploaded.
 */
export function analyzeReferences(documents: readonly StructuredDocument[], known: readonly KnownDocument[]) {
  const byKey = new Map(
    documents.flatMap((document) => document.provisions).map((provision) => [provision.key, provision])
  )
  const index: Index = { documents, known, byKey }
  const references = new Map<ProvisionKey, Reference[]>()
  const referenced = new Map<string, ReferencedDocument>()
  const uploaded = new Set([...documents.map((document) => document.key), ...known.map((document) => document.key)])
  for (const provision of byKey.values()) {
    const found = findReferences(provision, index)
    references.set(provision.key, found)
    for (const reference of found) {
      const key = reference.target?.type === "document" ? reference.target.key : null
      const common = commonDocuments.find(({ pattern }) => pattern.test(reference.text))
      if (key && common && !uploaded.has(key) && !referenced.has(key)) {
        const title = reference.text.replace(/^(?:the|such)\s+/, "")
        referenced.set(key, { key, kind: common.kind, title })
      }
    }
  }
  return { references, referencedDocuments: [...referenced.values()] }
}

/** The provisions a provision cites, without itself, in order of first mention. */
export function citedProvisions(references: readonly Reference[], self: ProvisionKey) {
  const keys = references.flatMap((reference) => (reference.target?.type === "provision" ? [reference.target.key] : []))
  return [...new Set(keys)].filter((key) => key !== self)
}
