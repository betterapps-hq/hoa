const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumSignificantDigits: 3
})

export function formatCost(costUsd: number | undefined) {
  return costUsd === undefined ? "Not reported" : usd.format(costUsd)
}

export function formatTokens(inputTokens: number | undefined, outputTokens: number | undefined) {
  if (inputTokens === undefined && outputTokens === undefined) {
    return "Not reported"
  }
  return `${(inputTokens ?? 0).toLocaleString("en-US")} in, ${(outputTokens ?? 0).toLocaleString("en-US")} out`
}
