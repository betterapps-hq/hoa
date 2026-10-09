// Choosing encoding units for an evaluation slice: a selector is a provision key, which keeps the units holding that
// provision or lying under it, or a document key, which keeps that document's units.

type Keyed = readonly { key: string }[]

export function selectsUnit(selectors: readonly string[]) {
  const wanted = new Set(selectors)
  return (unit: { documentKey: string; provisions: Keyed; context: Keyed }) =>
    wanted.has(unit.documentKey) || [...unit.context, ...unit.provisions].some((provision) => wanted.has(provision.key))
}
