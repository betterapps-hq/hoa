const either = new Intl.ListFormat("en", { type: "disjunction" })

/** Items joined for prose as alternatives: "the Board or the committee". */
export const orList = (items: readonly string[]) => either.format(items)
