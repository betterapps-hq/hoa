import { MinusIcon, PlusIcon } from "lucide-react"
import { createContext, useContext, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText
} from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { sentenceCase } from "@/lib/text"
import { layoutOf, readBox, toBoxes, toValue, type QuantitySpec, type QuantityUnit, type UnitSystem } from "./quantity"

// The shared inputs for amounts (docs/ux.md, Forms): feet and inches, meters and centimeters, an area, a duration
// with its unit, a count with a stepper, or a number with its unit, chosen by what the amount measures, never free
// text to format. The value is the amount in the property's own unit; a box that isn't a number gives its text back,
// so validation can say how to fix it.

const UnitSystemContext = createContext<UnitSystem>("imperial")

/** The organization's unit system for every quantity input below it. */
export const UnitSystemProvider = UnitSystemContext.Provider

export type QuantityInputProps = {
  /** The first box's id, so the question's label names it. */
  id: string
  /** The question's label element, which names every box with its unit. */
  labelId: string
  spec: QuantitySpec
  value: number | string | null
  onChange: (value: number | string | null) => void
  onBlur?: () => void
  isInvalid?: boolean
  isRequired?: boolean
  describedBy?: string
}

const ownUnit = (spec: QuantitySpec): QuantityUnit | null =>
  spec.unit
    ? (spec.units.find((unit) => unit.unit === spec.unit?.key) ?? {
        unit: spec.unit.key,
        labels: [spec.unit.label],
        perBase: null
      })
    : null

/** An amount, entered in the boxes its dimension calls for. */
export function QuantityInput({
  id,
  labelId,
  spec,
  value,
  onChange,
  onBlur,
  isInvalid = false,
  isRequired = false,
  describedBy
}: QuantityInputProps) {
  const system = useContext(UnitSystemContext)
  const layout = layoutOf(spec, system)
  const own = ownUnit(spec)
  const [texts, setTexts] = useState(() => toBoxes(typeof value === "number" ? value : null, layout, own))
  const [durationUnit, setDurationUnit] = useState(() =>
    layout.type === "duration" ? (layout.boxes.find((box) => box.unit.unit === own?.unit) ?? layout.boxes[0]) : null
  )
  const emit = (next: string[], units: QuantityUnit[]) => {
    setTexts(next)
    const fallback = own ?? { unit: "", labels: [], perBase: null }
    const result = toValue(
      next.map((text, index) => ({ text, unit: units[index] ?? units[0] ?? fallback })),
      own
    )
    onChange(result === "unreadable" ? next.join(" ").trim() : result)
  }
  const common = {
    inputMode: "decimal" as const,
    autoComplete: "off",
    onBlur,
    "aria-invalid": isInvalid,
    "aria-required": isRequired,
    "aria-describedby": describedBy
  }

  if (layout.type === "count") {
    const count = readBox(texts[0] ?? "")
    const step = (by: number) => {
      const current = count ? Math.round(Number(count.numerator) / Number(count.denominator)) : 0
      emit([String(Math.max(0, current + by))], [])
    }
    return (
      <InputGroup className="w-40">
        <InputGroupAddon>
          <InputGroupButton size="icon-xs" aria-label="One fewer" onClick={() => step(-1)}>
            <MinusIcon />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput
          {...common}
          id={id}
          inputMode="numeric"
          className="text-center"
          value={texts[0] ?? ""}
          onChange={(event) => emit([event.target.value], [])}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="One more" onClick={() => step(1)}>
            <PlusIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    )
  }

  if (layout.type === "compound") {
    const boxes = [layout.major, layout.minor]
    return (
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-labelledby={labelId}>
        {boxes.map((box, index) => (
          <InputGroup key={box.unit.unit} className="w-32">
            <InputGroupInput
              {...common}
              id={index === 0 ? id : `${id}-${box.unit.unit}`}
              aria-labelledby={`${labelId} ${id}-${box.unit.unit}-unit`}
              value={texts[index] ?? ""}
              onChange={(event) =>
                emit(
                  texts.map((text, at) => (at === index ? event.target.value : text)),
                  boxes.map((item) => item.unit)
                )
              }
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText id={`${id}-${box.unit.unit}-unit`}>{box.name}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        ))}
      </fieldset>
    )
  }

  if (layout.type === "duration") {
    const chosen = durationUnit ?? layout.boxes[0]
    return (
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-labelledby={labelId}>
        <Input
          {...common}
          id={id}
          className="w-28"
          value={texts[0] ?? ""}
          onChange={(event) => emit([event.target.value], chosen ? [chosen.unit] : [])}
        />
        {layout.boxes.length > 1 ? (
          <NativeSelect
            aria-label="Unit"
            value={chosen?.unit.unit ?? ""}
            onChange={(event) => {
              const next = layout.boxes.find((box) => box.unit.unit === event.target.value)
              if (next) {
                setDurationUnit(next)
                emit(texts, [next.unit])
              }
            }}
          >
            {layout.boxes.map((box) => (
              <NativeSelectOption key={box.unit.unit} value={box.unit.unit}>
                {sentenceCase(box.unit.labels.find((label) => /^\p{L}{3,}/u.test(label)) ?? box.name)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <span className="self-center text-sm text-muted-foreground">{chosen?.name}</span>
        )}
      </fieldset>
    )
  }

  const { box } = layout
  return (
    <InputGroup className="w-48">
      {box.isPrefix ? (
        <InputGroupAddon>
          <InputGroupText>{box.name}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupInput
        {...common}
        id={id}
        value={texts[0] ?? ""}
        onChange={(event) => emit([event.target.value], [box.unit])}
      />
      {box.isPrefix ? null : (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{box.name}</InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
