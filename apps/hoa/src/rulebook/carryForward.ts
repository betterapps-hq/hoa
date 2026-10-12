import type { Issue, Provision, ProvisionKey, Question, Review, Rule, Settings, Term } from "@/schema/types"
import { canonicalJson, sha256Hex } from "./canonical"

// Carrying review forward (encoding.md, Save draft): a rebuilt record whose key and content equal a record in an earlier
// rulebook keeps the review decision it had there, approved, rejected or still proposed, with the resolutions of the
// issues it had then, so a rebuild only asks about what changed. The current draft decides first, then the published
// rulebook. A record's content is everything but its bookkeeping (provenance, review, issues): what extraction and the
// editor write.

export function ruleContentHash(rule: Rule) {
  const { provenance: _provenance, review: _review, issues: _issues, ...content } = rule
  return sha256Hex(canonicalJson(content))
}

export function termContentHash(term: Term) {
  const { provenance: _provenance, review: _review, issues: _issues, labels, ...content } = term
  const labelContent = labels.map(({ provenance: _labelProvenance, ...label }) => label)
  return sha256Hex(canonicalJson({ ...content, labels: labelContent }))
}

/** The settings' clauses and decision policy. */
export function settingsContentHash(settings: Settings) {
  const { review: _review, issues: _issues, ...content } = settings
  return sha256Hex(canonicalJson(content))
}

/** A question as the build asks it; ids are numbered per build, so they aren't part of it. */
function questionContentHash(question: Question) {
  const { id: _id, answer: _answer, ...content } = question
  return sha256Hex(canonicalJson(content))
}

/** A provision's wording and place; anchors point into one upload's pages, so a new upload of the same text keeps it. */
function provisionContentHash(provision: Provision) {
  const { anchors: _anchors, noRule: _noRule, ...content } = provision
  return sha256Hex(canonicalJson(content))
}

/** A rulebook whose review decisions carry forward. */
export type ReviewedRulebook = {
  rules: readonly Rule[]
  terms: readonly Term[]
  settings: Settings
  questions: readonly Question[]
}

/**
 * The review a rebuild carries forward: earlier rulebooks, the one that decides first first (the current draft, then the
 * published rulebook), and the provisions as stored, with their no-rule reasons.
 */
export type PreviousReview = { rulebooks: readonly ReviewedRulebook[]; provisions: readonly Provision[] }

type Reviewed = { key: string; review: Review; issues: Issue[] }

const issueIdentity = ({ code, message, related }: Issue) => canonicalJson({ code, message, related })

/** The build's issues, with the resolutions the same issues had on the earlier record. */
function withResolutions(issues: readonly Issue[], earlier: readonly Issue[]): Issue[] {
  const resolutions = new Map(
    earlier.flatMap((issue) => (issue.resolution ? [[issueIdentity(issue), issue.resolution] as const] : []))
  )
  return issues.map((issue) =>
    issue.resolution ? issue : { ...issue, resolution: resolutions.get(issueIdentity(issue)) ?? null }
  )
}

/** Each record's hash in each earlier rulebook, by key. */
function indexByKey<R extends { key: string }>(
  earlier: readonly (readonly R[])[],
  hash: (record: R) => Promise<string>
) {
  return Promise.all(
    earlier.map(
      async (records) =>
        new Map(
          await Promise.all(records.map(async (record) => [record.key, { record, hash: await hash(record) }] as const))
        )
    )
  )
}

async function carryReviews<R extends Reviewed>(
  built: readonly R[],
  earlier: readonly (readonly R[])[],
  hash: (record: R) => Promise<string>
): Promise<R[]> {
  const indexes = await indexByKey(earlier, hash)
  return Promise.all(
    built.map(async (record) => {
      const content = await hash(record)
      const match = indexes.map((index) => index.get(record.key)).find((found) => found?.hash === content)
      return match
        ? { ...record, review: match.record.review, issues: withResolutions(record.issues, match.record.issues) }
        : record
    })
  )
}

type Clauses = Settings["clauses"]

/** Whether the documents state a clause: it cites a passage, rather than being a default or an administrator's choice. */
function isStated(clause: Clauses[keyof Clauses]) {
  if (clause === null) {
    return false
  }
  return Array.isArray(clause) ? clause.some((item) => item.citations.length > 0) : clause.citations.length > 0
}

/**
 * The built settings with the decision policy an administrator set (the build only proposes clauses), and each clause
 * the documents don't state as the latest rulebook had it, so a default an administrator changed survives a rebuild;
 * a clause the documents state comes from them. With the review of the first earlier settings with the same content.
 */
async function carrySettings(built: Settings, earlier: readonly Settings[]): Promise<Settings> {
  const [latest] = earlier
  const keep = <K extends keyof Clauses>(name: K): Clauses[K] =>
    !latest || isStated(built.clauses[name]) ? built.clauses[name] : latest.clauses[name]
  const clauses: Clauses = {
    precedence: keep("precedence"),
    time: keep("time"),
    liability: keep("liability"),
    cure: keep("cure"),
    deciders: keep("deciders"),
    sanctionPreconditions: keep("sanctionPreconditions")
  }
  const settings = latest ? { ...built, clauses, policy: latest.policy } : built
  const content = await settingsContentHash(settings)
  const hashes = await Promise.all(earlier.map(settingsContentHash))
  const match = earlier.find((_, index) => hashes[index] === content)
  return match
    ? { ...settings, review: match.review, issues: withResolutions(settings.issues, match.issues) }
    : settings
}

/** The built questions with the answer the first earlier rulebook asking the same question gave it. */
async function carryAnswers(
  built: readonly Question[],
  earlier: readonly (readonly Question[])[]
): Promise<Question[]> {
  const indexes = await Promise.all(
    earlier.map(
      async (questions) =>
        new Map(
          await Promise.all(questions.map(async (question) => [await questionContentHash(question), question] as const))
        )
    )
  )
  return Promise.all(
    built.map(async (question) => {
      const content = await questionContentHash(question)
      const match = indexes.map((index) => index.get(content)).find((found) => found !== undefined)
      return match ? { ...question, answer: match.answer } : question
    })
  )
}

/**
 * The built draft's records with the review of unchanged records carried forward: for each record, the first earlier
 * rulebook holding one with the same key and content decides its review.
 */
export async function carryForward(built: ReviewedRulebook, earlier: readonly ReviewedRulebook[]) {
  const [rules, terms, settings, questions] = await Promise.all([
    carryReviews(
      built.rules,
      earlier.map((rulebook) => rulebook.rules),
      ruleContentHash
    ),
    carryReviews(
      built.terms,
      earlier.map((rulebook) => rulebook.terms),
      termContentHash
    ),
    carrySettings(
      built.settings,
      earlier.map((rulebook) => rulebook.settings)
    ),
    carryAnswers(
      built.questions,
      earlier.map((rulebook) => rulebook.questions)
    )
  ])
  return { rules, terms, settings, questions }
}

/**
 * The built provisions with the no-rule reasons review decided on the same wording: a reason the build gives again keeps
 * its review, and a reason someone gave a provision the build leaves uncovered comes back with it.
 */
export async function carryNoRules(
  built: readonly Provision[],
  stored: readonly Provision[],
  uncovered: ReadonlySet<ProvisionKey>
): Promise<Provision[]> {
  const decided = new Map(
    stored.flatMap((provision) =>
      provision.noRule && provision.noRule.review.status !== "proposed" ? [[provision.key, provision] as const] : []
    )
  )
  return Promise.all(
    built.map(async (provision) => {
      const earlier = decided.get(provision.key)
      if (!earlier?.noRule || (await provisionContentHash(earlier)) !== (await provisionContentHash(provision))) {
        return provision
      }
      const { noRule } = provision
      if (noRule === null) {
        return uncovered.has(provision.key) ? { ...provision, noRule: earlier.noRule } : provision
      }
      const isSame = noRule.reason === earlier.noRule.reason && noRule.note === earlier.noRule.note
      return isSame ? { ...provision, noRule: { ...noRule, review: earlier.noRule.review } } : provision
    })
  )
}
