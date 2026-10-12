// Evaluation round 1's split of the sample Declaration (implementation-plan.md): dev is Articles 1 to 8 and the use
// restrictions (Exhibit C), test Articles 9 to 21. Selectors are provision or document keys (unitSelection.ts). Kept
// out of src/: the use restrictions' document key is also one of the sample's organization terms.

const articles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `declaration:article-${from + index}`)

const encodingSplits: Record<string, string[] | null> = {
  dev: [...articles(1, 8), "use-restrictions"],
  test: articles(9, 21),
  all: null
}

export function splitSelectors(split: string) {
  const selectors = encodingSplits[split]
  if (selectors === undefined) {
    throw new Error(`The split is dev, test or all, not ${split}`)
  }
  return selectors
}
