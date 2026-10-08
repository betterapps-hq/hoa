import type { ReactNode } from "react"
import { badgeVariants } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
import { documentLabel, findAttribute, scopeLabels } from "@/rules/catalog"
import type { AllowedValue, Check, Condition } from "@/rules/rule"

const kindLabels = { number: "A number", text: "Text", enum: "One of a fixed list", boolean: "Yes or no" } as const
const unitLabels = { in: "inches", ft: "feet" } as const

/**
 * A rule's reference to something read from an application, shown by name. Selecting it explains what it is, its
 * type and unit, and the values the catalog allows.
 */
export function AttributeChip({ attributeKey }: { attributeKey: string }) {
  const attribute = findAttribute(attributeKey)
  const name = attribute ? `${scopeLabels[attribute.scope]}: ${attribute.label}` : attributeKey
  return (
    <Popover>
      <PopoverTrigger className={`${badgeVariants({ variant: "secondary" })} cursor-pointer align-baseline`}>
        {name}
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
          <PopoverDescription>
            {attribute
              ? `Something the review reads from each ${scopeLabels[attribute.scope].toLowerCase()} in an application.`
              : "This isn’t in the catalog, so the review can’t read it. Edit the rule to use a listed attribute."}
          </PopoverDescription>
        </PopoverHeader>
        {attribute ? (
          <dl className="grid grid-cols-[6rem_1fr] gap-1 text-sm">
            <dt className="text-muted-foreground">Kind</dt>
            <dd>
              {kindLabels[attribute.kind]}
              {attribute.unit ? `, in ${unitLabels[attribute.unit]}` : ""}
            </dd>
            {attribute.values ? (
              <>
                <dt className="text-muted-foreground">Values</dt>
                <dd>{attribute.values.join(", ")}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Key</dt>
            <dd className="font-mono text-xs">{attribute.key}</dd>
          </dl>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function values(list: readonly AllowedValue[]) {
  return list.map((value) => value.value).join(", ")
}

function unitOf(key: string | undefined) {
  const unit = key ? findAttribute(key)?.unit : undefined
  return unit ? ` ${unit === "in" ? "inches" : "feet"}` : ""
}

function rangeLimit(min: number | null, max: number | null, unit: string) {
  if (min !== null && max !== null) {
    return `between ${min} and ${max}${unit}`
  }
  if (min !== null) {
    return `at least ${min}${unit}`
  }
  return max === null ? "(no limit given)" : `at most ${max}${unit}`
}

/** What a rule checks, with each attribute as a chip. */
export function CheckSummary({ check }: { check: Check }): ReactNode {
  switch (check.type) {
    case "allowed-values":
      return (
        <>
          <AttributeChip attributeKey={check.attribute} /> must be one of {values(check.values)}
          {check.otherwise === "committee" ? "; anything else goes to the committee" : ""}
        </>
      )
    case "allowed-values-by":
      return (
        <div className="flex flex-col gap-1">
          <span>
            <AttributeChip attributeKey={check.attribute} /> depends on{" "}
            <AttributeChip attributeKey={check.keyAttribute} />:
          </span>
          <ul className="list-disc pl-5">
            {check.table.map((row) => (
              <li key={row.key.value}>
                {row.key.value}: {values(row.values)}
              </li>
            ))}
          </ul>
          {check.unknownKey === "committee" ? <span>Anything not listed goes to the committee.</span> : null}
        </div>
      )
    case "prohibited-values":
      return (
        <>
          <AttributeChip attributeKey={check.attribute} /> must not be {values(check.values)}
        </>
      )
    case "range": {
      const limit = rangeLimit(check.min, check.max, unitOf(check.attributes[0]))
      return (
        <>
          {check.attributes.map((attribute, index) => (
            <span key={attribute}>
              {index > 0 ? " plus " : ""}
              <AttributeChip attributeKey={attribute} />
            </span>
          ))}{" "}
          must be {limit}
        </>
      )
    }
    case "matches":
      return (
        <>
          <AttributeChip attributeKey={check.attribute} /> must match{" "}
          <AttributeChip attributeKey={check.otherAttribute} />
        </>
      )
    case "required-fact":
      return (
        <>
          The application must give <AttributeChip attributeKey={check.attribute} />
        </>
      )
    case "required-document":
      return (
        <>
          The application must include the {documentLabel(check.document).toLowerCase()}
          {check.mustState.length > 0 ? `, stating ${check.mustState.join("; ")}` : ""}
        </>
      )
    case "qualitative":
      return <>Judged from the application: {check.criterion}</>
    case "informational":
      return <>For information; not checked against applications</>
  }
}

const operatorText = { equals: "is", in: "is", "not-in": "isn’t", exists: "is given" } as const

/** When a rule applies, with each attribute as a chip; null when it always applies. */
export function ConditionsSummary({ conditions }: { conditions: readonly Condition[] }) {
  if (conditions.length === 0) {
    return null
  }
  return (
    <span>
      {conditions.map((condition, index) => (
        <span key={condition.type === "text" ? condition.id : `${condition.attribute}:${index}`}>
          {index > 0 ? ", and " : ""}
          {condition.type === "text" ? (
            condition.description
          ) : (
            <>
              <AttributeChip attributeKey={condition.attribute} /> {operatorText[condition.operator]}
              {condition.operator === "exists"
                ? ""
                : ` ${Array.isArray(condition.value) ? condition.value.join(" or ") : String(condition.value)}`}
            </>
          )}
        </span>
      ))}
    </span>
  )
}
