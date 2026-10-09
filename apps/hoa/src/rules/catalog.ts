/**
 * The global project-type catalog (docs/design/rules.md). Attributes and enum values are append-only: published
 * rulebooks store the catalog version they were built with, and nothing they reference may be renamed or removed.
 */
export const componentKinds = ["segment", "gate"] as const
export type ComponentKind = (typeof componentKinds)[number]

export const applicationFileKinds = [
  "application-form",
  "checklist",
  "letter",
  "plot-plan",
  "photo",
  "product-sheet",
  "neighbor-form",
  "permit-form",
  "other"
] as const
export type ApplicationFileKind = (typeof applicationFileKinds)[number]

export const documentRequirementIds = [
  "application-form",
  "project-description",
  "plot-plan",
  "product-specification",
  "photos",
  "neighbor-acknowledgment",
  "neighbor-approval",
  "owner-signatures",
  "checklist",
  "permit-acknowledgment"
] as const
export type DocumentRequirementId = (typeof documentRequirementIds)[number]

export type DocumentRequirement = {
  id: DocumentRequirementId
  label: string
  satisfiedBy: { pageKinds?: readonly ApplicationFileKind[]; formField?: string }
  signedBy?: "applicant" | "all-owners" | "neighbor"
}

export type AttributeScope = "project" | ComponentKind

export type Attribute = {
  /** "segment.height": the scope, then the name. */
  key: string
  scope: AttributeScope
  label: string
  kind: "number" | "text" | "enum" | "boolean"
  /** Numbers are stored in this unit. */
  unit?: "in" | "ft"
  values?: readonly string[]
  /** For an attribute of an optional feature, the boolean attribute that says whether the feature exists. */
  presence?: string
  /** Whether the homeowner is asked for it when it's missing, always or only when another attribute has a value. */
  isRequiredForReview: boolean | { when: string; in: readonly string[] }
}

export const projectTypeIds = ["fence"] as const
export type ProjectTypeId = (typeof projectTypeIds)[number]

export type ProjectType = {
  id: ProjectTypeId
  label: string
  components: readonly ComponentKind[]
  attributes: readonly Attribute[]
  documents: readonly DocumentRequirement[]
}

const boundaries = ["unit", "common-area", "open-space", "golf-course", "street", "none"] as const
const materials = ["wood", "composite", "metal", "vinyl", "other"] as const
const orientations = ["vertical", "horizontal"] as const
const compositeOnly = { when: "segment.material", in: ["composite"] } as const

const fence: ProjectType = {
  id: "fence",
  label: "Fence",
  components: ["segment", "gate"],
  attributes: [
    {
      key: "project.replacesExisting",
      scope: "project",
      label: "Replaces an existing fence",
      kind: "boolean",
      isRequiredForReview: false
    },
    {
      key: "project.ownersOfRecord",
      scope: "project",
      label: "Owners of record",
      kind: "number",
      isRequiredForReview: false
    },
    {
      key: "segment.location",
      scope: "segment",
      label: "Location",
      kind: "enum",
      values: ["rear", "side", "front", "return"],
      isRequiredForReview: true
    },
    {
      key: "segment.boundaryWith",
      scope: "segment",
      label: "Boundary with",
      kind: "enum",
      values: boundaries,
      isRequiredForReview: true
    },
    {
      key: "segment.length",
      scope: "segment",
      label: "Length",
      kind: "number",
      unit: "ft",
      isRequiredForReview: false
    },
    {
      key: "segment.height",
      scope: "segment",
      label: "Height without lattice or arbor",
      kind: "number",
      unit: "in",
      isRequiredForReview: true
    },
    {
      key: "segment.material",
      scope: "segment",
      label: "Material",
      kind: "enum",
      values: materials,
      isRequiredForReview: true
    },
    {
      key: "segment.openness",
      scope: "segment",
      label: "Open or solid",
      kind: "enum",
      values: ["open", "solid"],
      isRequiredForReview: false
    },
    {
      key: "segment.manufacturer",
      scope: "segment",
      label: "Manufacturer",
      kind: "text",
      isRequiredForReview: compositeOnly
    },
    { key: "segment.productLine", scope: "segment", label: "Product line", kind: "text", isRequiredForReview: false },
    { key: "segment.color", scope: "segment", label: "Color", kind: "text", isRequiredForReview: compositeOnly },
    { key: "segment.style", scope: "segment", label: "Style", kind: "text", isRequiredForReview: false },
    {
      key: "segment.boardOrientation",
      scope: "segment",
      label: "Board orientation",
      kind: "enum",
      values: orientations,
      isRequiredForReview: false
    },
    { key: "segment.postColor", scope: "segment", label: "Post color", kind: "text", isRequiredForReview: false },
    {
      key: "segment.finishManufacturer",
      scope: "segment",
      label: "Stain or paint manufacturer",
      kind: "text",
      isRequiredForReview: false
    },
    {
      key: "segment.finishColor",
      scope: "segment",
      label: "Stain or paint color",
      kind: "text",
      isRequiredForReview: false
    },
    {
      key: "segment.isFinishedBothSides",
      scope: "segment",
      label: "Finished on both sides",
      kind: "boolean",
      isRequiredForReview: false
    },
    { key: "segment.hasLattice", scope: "segment", label: "Has lattice", kind: "boolean", isRequiredForReview: false },
    {
      key: "segment.latticeHeight",
      scope: "segment",
      label: "Lattice height",
      kind: "number",
      unit: "in",
      presence: "segment.hasLattice",
      isRequiredForReview: false
    },
    { key: "segment.hasArbor", scope: "segment", label: "Has an arbor", kind: "boolean", isRequiredForReview: false },
    {
      key: "segment.arborHeight",
      scope: "segment",
      label: "Arbor height",
      kind: "number",
      unit: "in",
      presence: "segment.hasArbor",
      isRequiredForReview: false
    },
    {
      key: "segment.setbackFromFrontCorner",
      scope: "segment",
      label: "Setback from the front corner of the house",
      kind: "number",
      unit: "ft",
      isRequiredForReview: false
    },
    { key: "gate.segmentId", scope: "gate", label: "Segment", kind: "text", isRequiredForReview: false },
    { key: "gate.width", scope: "gate", label: "Width", kind: "number", unit: "in", isRequiredForReview: false },
    {
      key: "gate.height",
      scope: "gate",
      label: "Height including lattice or arbor",
      kind: "number",
      unit: "in",
      isRequiredForReview: false
    },
    {
      key: "gate.material",
      scope: "gate",
      label: "Material",
      kind: "enum",
      values: materials,
      isRequiredForReview: false
    },
    { key: "gate.color", scope: "gate", label: "Color", kind: "text", isRequiredForReview: false },
    { key: "gate.style", scope: "gate", label: "Style", kind: "text", isRequiredForReview: false },
    {
      key: "gate.boardOrientation",
      scope: "gate",
      label: "Board orientation",
      kind: "enum",
      values: orientations,
      isRequiredForReview: false
    },
    { key: "gate.hasLattice", scope: "gate", label: "Has lattice", kind: "boolean", isRequiredForReview: false },
    { key: "gate.hasArbor", scope: "gate", label: "Has an arbor", kind: "boolean", isRequiredForReview: false },
    { key: "gate.isNewOpening", scope: "gate", label: "New opening", kind: "boolean", isRequiredForReview: false },
    {
      key: "gate.opensTo",
      scope: "gate",
      label: "Opens to",
      kind: "enum",
      values: ["own-lot", "unit", "common-area", "open-space", "golf-course", "street"],
      isRequiredForReview: false
    }
  ],
  documents: [
    {
      id: "application-form",
      label: "Application form",
      satisfiedBy: { pageKinds: ["application-form"] },
      signedBy: "applicant"
    },
    {
      id: "project-description",
      label: "Project description",
      satisfiedBy: { pageKinds: ["letter", "application-form"], formField: "description" }
    },
    { id: "plot-plan", label: "Plot plan", satisfiedBy: { pageKinds: ["plot-plan"] } },
    {
      id: "product-specification",
      label: "Product specification",
      satisfiedBy: { pageKinds: ["product-sheet", "photo"] }
    },
    { id: "photos", label: "Photos of the site", satisfiedBy: { pageKinds: ["photo"] } },
    {
      id: "neighbor-acknowledgment",
      label: "Neighbor acknowledgment",
      satisfiedBy: { pageKinds: ["neighbor-form"] },
      signedBy: "neighbor"
    },
    {
      id: "neighbor-approval",
      label: "Neighbor approval",
      satisfiedBy: { pageKinds: ["neighbor-form", "letter"] },
      signedBy: "neighbor"
    },
    {
      id: "owner-signatures",
      label: "Owner signatures",
      satisfiedBy: { pageKinds: ["application-form"] },
      signedBy: "all-owners"
    },
    { id: "checklist", label: "Checklist", satisfiedBy: { pageKinds: ["checklist"] }, signedBy: "applicant" },
    {
      id: "permit-acknowledgment",
      label: "Permit acknowledgment",
      satisfiedBy: { pageKinds: ["permit-form"] },
      signedBy: "applicant"
    }
  ]
}

export const projectTypes: Record<ProjectTypeId, ProjectType> = { fence }

export function getAttribute(projectType: ProjectTypeId, key: string): Attribute | undefined {
  return projectTypes[projectType].attributes.find((attribute) => attribute.key === key)
}
