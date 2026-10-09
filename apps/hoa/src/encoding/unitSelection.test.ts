import { describe, expect, it } from "vitest"
import { selectsUnit } from "./unitSelection"

describe("selectsUnit", () => {
  const unit = (documentKey: string, keys: string[], context: string[] = []) => ({
    documentKey,
    provisions: keys.map((key) => ({ key })),
    context: context.map((key) => ({ key }))
  })
  const select = selectsUnit(["declaration:article-4", "conduct-rules"])

  it("keeps units holding or under a selected provision, and every unit of a selected document", () => {
    expect(select(unit("declaration", ["declaration:article-4", "declaration:4.1"]))).toBe(true)
    expect(select(unit("declaration", ["declaration:4.3"], ["declaration:article-4"]))).toBe(true)
    expect(select(unit("conduct-rules", ["conduct-rules:a"]))).toBe(true)
    expect(select(unit("declaration", ["declaration:article-5"]))).toBe(false)
  })
})
