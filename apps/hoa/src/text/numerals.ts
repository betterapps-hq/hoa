import * as D from "@/engine/decimal"

// Numerals as text writes them, read exactly (application-review.md, Recognition): digits with thousands separators
// and decimals ("1,000", "6.5"), fractions and mixed numbers ("2/3", "6 1/2", "6-1/2", "6½"), and number words from a
// small fixed list ("six", "seventy-two", "one hundred and five", "six and a half", "two-thirds", "a quarter"). The
// verifier checks every numeral in a quote against a proposed value, and the quantity grammar reads its numbers here.

export type Numeral = { value: D.Exact; length: number }

const ones: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
}
const tens: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}
/** The denominators fraction words name: "two thirds", "a quarter", "one half". */
const fractionWords: Record<string, number> = {
  half: 2,
  halves: 2,
  third: 3,
  thirds: 3,
  quarter: 4,
  quarters: 4,
  fourth: 4,
  fourths: 4
}
const vulgarFractions: Record<string, D.Exact> = {
  "¼": D.fraction(1, 4),
  "½": D.fraction(1, 2),
  "¾": D.fraction(3, 4),
  "⅓": D.fraction(1, 3),
  "⅔": D.fraction(2, 3)
}

const digitNumber = /^(\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:(?:\s+|-)(\d+)\/(\d+))?([¼½¾⅓⅔])?/
const fractionOnly = /^(\d+)\/(\d+)/
const vulgarOnly = /^[¼½¾⅓⅔]/
const wordPattern = /^[a-z]+/
const articleFraction = /^an?[\s-]+(half|third|quarter|fourth)\b/

/** Whether a character is a letter, so a numeral glued to a word ("R2", "2x4"'s 4) isn't read. */
export const isLetter = (character: string | undefined) => character !== undefined && /[a-z]/i.test(character)

/** A run of number words at the start of a lowercase text ("seventy-two", "one hundred and five", "two-thirds"). */
function readWords(text: string): Numeral | null {
  const article = articleFraction.exec(text)
  if (article?.[1]) {
    return { value: D.fraction(1, fractionWords[article[1]] ?? 1), length: article[0].length }
  }
  let position = 0
  let total = 0
  let current = 0
  let isFound = false
  let length = 0
  let isAfterScale = false
  for (;;) {
    const rest = text.slice(position)
    const separator = /^[\s-]*/.exec(rest)?.[0] ?? ""
    const word = wordPattern.exec(rest.slice(separator.length))?.[0]
    if (!word) {
      break
    }
    const next = position + separator.length + word.length
    const denominator = fractionWords[word]
    if (denominator !== undefined) {
      // "two thirds", "one half"; "half" on its own is a half.
      if (isFound && total === 0 && !isAfterScale) {
        return { value: D.fraction(current, denominator), length: next }
      }
      if (!isFound && word === "half") {
        return { value: D.fraction(1, 2), length: next }
      }
      break
    }
    if (word in ones) {
      current += ones[word] ?? 0
      isAfterScale = false
    } else if (word in tens) {
      current += tens[word] ?? 0
      isAfterScale = false
    } else if (word === "hundred" && isFound) {
      current = (current || 1) * 100
      isAfterScale = true
    } else if (word === "thousand" && isFound) {
      total += (current || 1) * 1000
      current = 0
      isAfterScale = true
    } else if (word === "and" && isFound && /^\s+a\s+half\b/.test(text.slice(next))) {
      const half = /^\s+a\s+half/.exec(text.slice(next))?.[0] ?? ""
      return { value: D.add(D.integer(total + current), D.fraction(1, 2)), length: next + half.length }
    } else if (word === "and" && isAfterScale) {
      // "one hundred and five"; "four and six" is two numbers.
      position = next
      continue
    } else {
      break
    }
    isFound = true
    position = next
    length = position
  }
  return isFound ? { value: D.integer(total + current), length } : null
}

/** The numeral at the start of a lowercase text, digits or words; null when it doesn't start with one. */
export function readNumeral(text: string): Numeral | null {
  const fraction = fractionOnly.exec(text)
  if (fraction?.[1] && fraction[2] && Number(fraction[2]) !== 0) {
    return { value: D.fraction(Number(fraction[1]), Number(fraction[2])), length: fraction[0].length }
  }
  const digits = digitNumber.exec(text)
  if (digits?.[1]) {
    const whole = D.exact(digits[1].replaceAll(",", ""))
    const mixed = digits[2] && digits[3] ? D.fraction(Number(digits[2]), Number(digits[3])) : D.zero
    const vulgar = vulgarFractions[digits[4] ?? ""] ?? D.zero
    return { value: D.add(D.add(whole, mixed), vulgar), length: digits[0].length }
  }
  const vulgar = vulgarOnly.exec(text)?.[0]
  const vulgarValue = vulgar ? vulgarFractions[vulgar] : undefined
  if (vulgar && vulgarValue) {
    return { value: vulgarValue, length: vulgar.length }
  }
  return isLetter(text.charAt(0)) ? readWords(text) : null
}

/** Every numeral in a text, in order. */
export function numeralsIn(source: string): D.Exact[] {
  const text = source.toLowerCase()
  const found: D.Exact[] = []
  let position = 0
  while (position < text.length) {
    const numeral = isLetter(text.charAt(position - 1)) ? null : readNumeral(text.slice(position))
    if (numeral) {
      found.push(numeral.value)
      position += numeral.length
      continue
    }
    const word = isLetter(text.charAt(position)) ? (wordPattern.exec(text.slice(position))?.[0] ?? "") : ""
    position += Math.max(word.length, 1)
  }
  return found
}
