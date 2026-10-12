import { z } from "zod"
import { projectAnswers, projectTypeDefinition } from "@/projectTypes/projectType"
import { recommendations } from "@/review/reviewModel"
import { factValue, outcome } from "@/schema/zod"
import { packetFixture } from "./packetFixture"

// Evaluation round 2's cases (implementation-plan.md, E2.1): an application, its packet and what its review should
// find, as data. The synthetic garage enclosure cases are committed under samples/garage-enclosure/; the fence packet's
// stays in the git-ignored .fixtures/ because it describes a real packet.

const actionGroup = z.object({ ruleKey: z.string(), entities: z.array(z.string()) })

export const expectedReview = z.object({
  /** Every entity the packet is about, the request, lot and community left out. */
  entities: z.array(z.object({ id: z.string(), type: z.string(), label: z.string() })),
  /** Facts per entity and property; "unknown" means the packet doesn't state it. */
  facts: z.array(
    z.object({
      entity: z.string(),
      property: z.string(),
      state: z.enum(["known", "absent", "conflicting", "uncertain", "unknown"]),
      value: factValue.nullable().default(null)
    })
  ),
  documents: z.array(z.object({ ruleKey: z.string(), entity: z.string(), present: z.boolean() })).default([]),
  /** Outcomes by "ruleKey entity". */
  findings: z.record(z.string(), outcome),
  recommendation: z.enum(recommendations),
  actionItems: z.object({
    changes: z.array(actionGroup),
    missingInformation: z.array(actionGroup),
    committeeDecisions: z.array(actionGroup)
  })
})
export type ExpectedReview = z.infer<typeof expectedReview>

export const reviewCase = z.object({
  id: z.string(),
  title: z.string(),
  application: z.object({
    /** The organization's project type the homeowner chose, as its label and description; null for none. */
    projectType: z
      .object({ label: z.string(), description: z.string().nullable(), definition: projectTypeDefinition.nullable() })
      .nullable(),
    /** The homeowner's answers to the project type's form; null when there's none. */
    answers: projectAnswers.nullable().default(null),
    description: z.string().nullable(),
    submittedOn: z.string().nullable()
  }),
  /** When the review runs. */
  now: z.string(),
  /** The packet itself, or the name of a packet fixture under .fixtures/ocr/. */
  packet: z.union([packetFixture, z.object({ fixture: z.string() })]),
  expected: expectedReview
})
export type ReviewCase = z.infer<typeof reviewCase>
