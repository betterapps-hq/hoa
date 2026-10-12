import { readFileSync } from "node:fs"
import { z } from "zod"
import type { DefinedTermsItem } from "../src/evaluation/encoding/steps/datasets.ts"
import { expectedDefinedTerms } from "../src/evaluation/encoding/steps/golden.ts"
import type * as T from "../src/schema/types.ts"

// Step B's input and expectation for comparing finders (evaluation.md, Datasets): `--finder <file>` gives B the
// provisions another finder picked, in full, instead of the ones code picks; `--expect all` scores B against every
// term the golden defines in the document, not only those in the provisions code picks, so a finder that picks more
// gets the credit.

const finderFile = z.record(z.string(), z.array(z.string()))

/** The provision keys a finder picked, by item id, from a JSON file ({"defined-terms:declaration": [keys]}). */
export const readFinder = (path: string) => finderFile.parse(JSON.parse(readFileSync(path, "utf8")))

export function withFinder(
  items: readonly DefinedTermsItem[],
  golden: T.RulesFile,
  options: { finder: Readonly<Record<string, readonly string[]>> | null; expectAll: boolean }
): DefinedTermsItem[] {
  const byKey = new Map(golden.provisions.map((provision) => [provision.key, provision]))
  return items.map((item) => {
    const picked = options.finder?.[item.id]
    const definitions = picked
      ? picked.flatMap((key) => {
          const provision = byKey.get(key)
          return provision ? [provision] : []
        })
      : item.input.definitions
    if (!options.expectAll) {
      return { ...item, input: { ...item.input, definitions } }
    }
    // A term the document defines cites one of its definitions, or one of its provisions that quotes one of the term's
    // labels ('the "Committee"'); provisions that only use a term don't define it.
    const document = item.input.document.key
    const textOf = (provision: T.Provision) =>
      [provision.heading, provision.intro, provision.text, provision.wrapUp].filter(Boolean).join(" ").toLowerCase()
    const provisions = new Set<string>()
    const names: string[] = []
    for (const term of golden.terms) {
      const labels = term.labels.map((label) => label.text)
      for (const citation of term.citations) {
        const provision = byKey.get(citation.provisionKey)
        if (!provision?.key.startsWith(`${document}:`)) {
          continue
        }
        const text = textOf(provision)
        const quoted = (label: string) => ['"', "“"].some((open) => text.includes(`${open}${label.toLowerCase()}`))
        if (provision.kind === "definition" || labels.some(quoted)) {
          provisions.add(provision.key)
          names.push(...labels)
        }
      }
    }
    const expected = expectedDefinedTerms(golden, { provisions, names })
    return { ...item, input: { ...item.input, definitions }, expected: { terms: expected } }
  })
}
