import type { DocumentKind } from "@/schema/types"

// Law (schema.md, Rank and conflicts): federal law, then state law, then county and city ordinances, each a rank of
// its own above every document an organization writes. No document can rank itself above law, so every order of
// authority starts with these ranks, whatever a document says.

const lawOrder: readonly (readonly DocumentKind[])[] = [
  ["federal-law"],
  ["state-law"],
  ["county-ordinance", "city-ordinance"]
]

const lawKinds = new Set(lawOrder.flat())

export const isLaw = (kind: DocumentKind) => lawKinds.has(kind)

/** An order of authority with law first, in its own ranks, and the other documents after it in their order. */
export function withLawFirst(order: readonly (readonly DocumentKind[])[]): DocumentKind[][] {
  return [
    ...lawOrder.map((rank) => [...rank]),
    ...order.map((rank) => rank.filter((kind) => !isLaw(kind))).filter((rank) => rank.length > 0)
  ]
}
