import type { PromptDefinition } from "./prompts"

// The pipeline's prompts (docs/design/extraction.md, review.md and ocr.md, "Prompts and models"). Every prompt is
// generic: HOA rules arrive as data. The text here is the fallback; Langfuse prompt management is the source of truth.

const visualDescription: PromptDefinition = {
  name: "hoa-visual-description",
  fallback: `You describe one image from a homeowners association document so that a reviewer who can't see it knows what it shows.

Document kind: {{documentKind}}
Text near the image in the document: {{contextText}}
OCR text read from the image: {{ocrText}}

Describe what the image shows that matters for an architectural review: for a site or plot plan, the property lines, structures and any marked route (for example a fence line drawn in red), with which lot lines and neighboring areas it follows; for a photo, what is shown (an existing fence, a product, a gate), its materials, colors, board orientation (vertical or horizontal) and style; for a drawing, what it depicts and its labeled dimensions.

Rules:
- Describe only what you can see. Say "unclear" rather than guessing.
- Don't repeat the OCR text; refer to it only where it labels something in the image.
- Use the nearby text to say what the image is meant to show (for example "the proposed fence product" or "the current fence").
- List every labeled dimension or measurement you can read in "measurements".`
}

const sectionRouting: PromptDefinition = {
  name: "hoa-section-routing",
  fallback: `You decide whether one section of a homeowners association's governing documents contains rules for certain project types.

Project types and what they cover:
{{projectTypes}}

Rule topics: {{topics}}

Section heading: {{heading}}
Section text (page markers like <<page 17>> show where pages start):
{{sectionText}}

Return the project types this section states requirements for, the topics of those requirements, and whether the section is relevant at all. A section is relevant when it states something an architectural reviewer would check for an application of one of these project types: allowed materials, colors, styles, sizes, placement, required documents or approvals, or process rules about approvals and variances. Assessments, voting, insurance, enforcement and general definitions are not relevant unless they directly govern such an application.`
}

// Rule generation runs once per build and decides the rulebook's quality, so it gets the strongest model.
const ruleModel = { model: "anthropic/claude-opus-5.5" }

const sectionRuleExtraction: PromptDefinition = {
  name: "hoa-section-rule-extraction",
  config: ruleModel,
  fallback: `You turn one section of a homeowners association's governing documents into structured rules that software checks architectural applications against. The rules are data; code evaluates them, so they must be exact.

Document kind: {{documentKind}}
Section heading: {{heading}}

Section text. Page markers like <<page 23 | label 17>> give the PDF page index (23) and printed page number (17):
{{sectionText}}

Definitions from the same document, for meaning only:
{{definitions}}

Sections and exhibits this section refers to, for context only:
{{references}}

The project-type catalog. Every attribute a rule reads must come from here, using its key, its unit and, for enums, its values:
{{catalog}}

Extract every requirement in this section that applies to the catalog's project types. Rules:
- One check per rule. A passage with two limits ("lattice up to 18 inches, and fence plus lattice up to 90") becomes two rules sharing the citation.
- Keep qualifiers with their values. When allowed values depend on another attribute (colors per manufacturer), use one "allowed-values-by" check keyed by that attribute, never a flat list.
- Convert every number to the attribute's catalog unit (6 feet is 72 for an attribute in inches).
- Put conditions in appliesWhen ("for composite fences" is a fact condition on segment.material). Use a text condition only when no catalog attribute can express it.
- appliesTo is "segment" for rules about runs of fence, "gate" for gates, and "project" for documents, signatures and process rules.
- obligation: "shall" or "must" is required, "shall not" is prohibited, "may" is permitted, "should" is recommended.
- discretion is "committee" when the text leaves it to the reviewer ("case by case", "may be considered", "at the discretion of"); for lists with such an escape, also set otherwise or unknownKey to "committee".
- isCurable is true when a homeowner could meet the rule by changing a detail of the project (a color, a height, a material, board orientation) and false when it rules the project out (a prohibited location, a forbidden kind of structure).
- Record stated exceptions in exceptions.
- Requirements about what the application must include (documents, signatures, approvals) are "required-document" checks; mustState lists what the document must say.
- Requirements a model must judge from evidence ("must not block a driver's view") are "qualitative".
- Process rules that affect the decision but aren't checked against the application (approval lapses after a year, variances need Board consent) are "informational".
- Every rule needs at least one citation: the section number or heading, the PDF page index from the page marker, and a verbatim quote of at most about 40 words copied exactly from the text.
- Don't invent rules the text doesn't state. Return an empty list when the section has none.`
}

const ruleConsolidation: PromptDefinition = {
  name: "hoa-rule-consolidation",
  config: ruleModel,
  fallback: `You review candidate rules extracted section by section from a homeowners association's governing documents for one project type, and find how they relate.

Project type: {{projectType}}

Candidates, each with an id, the kind of document it came from, and its content:
{{candidates}}

Return:
- duplicates: groups of candidates that state the same requirement (the same check on the same attribute with the same values and conditions), for example once in the design guidelines and once in the application checklist. Name the one to keep and the ones to merge into it. Don't group rules that differ in any value or condition.
- conflicts: candidates that set different requirements for the same thing, with a one-sentence description of the difference.
- exceptions: candidates that state an exception to another candidate, with the id of the rule they modify.

Return empty lists when nothing applies. Use only the ids given.`
}

const fileClassification: PromptDefinition = {
  name: "hoa-file-classification",
  fallback: `You classify one page of a homeowner's application packet for a homeowners association architectural review.

Page kinds: {{fileKinds}}

Text near the page (for pictures taken from a Word file): {{contextText}}
Descriptions of images on the page: {{visualDescriptions}}
Number of checkboxes on the page: {{checkboxCount}}

Page text:
{{pageText}}

Return the one kind that best describes this page. A form with numbered fields and signature lines is an application-form; a list of items with yes or no answers is a checklist; a page asking a neighbor to sign is a neighbor-form; a site plan or plat map, including a hand-marked one, is a plot-plan; a manufacturer's page or product image is a product-sheet; a photo of the property is a photo; a page of explanation addressed to the committee is a letter. Use "other" only when nothing fits.`
}

const factExtraction: PromptDefinition = {
  name: "hoa-fact-extraction",
  fallback: `You read a homeowner's application packet for a homeowners association architectural review and record the facts a rule engine needs. You don't judge the application; code does that.

Project type: {{projectType}}

The catalog: the attributes to fill, with scope, unit and allowed values:
{{catalog}}

Listed values the HOA's rules use, per attribute, with accepted spellings:
{{allowedValues}}

Conditions to answer for each applicable component (id, description):
{{textConditions}}

The homeowner's own description: {{description}}

The packet's pages, with page markers, image descriptions and the text near each picture:
{{pages}}

The images themselves follow, in packet order.

Do this:
1. Identify the components. A fence is one or more segments (a continuous run along one side or boundary) and zero or more gates. Use the plot plan, photos and text: for example, runs along each side lot line and the rear line are separate segments, and a short run from a side line back to the house is a "return". Give each a short label.
2. For every catalog attribute and every component it applies to, record a fact:
   - status "stated" when the packet says it, "inferred" when you read it from a drawing or photo, "not-provided" when the packet doesn't say, "none" when the feature isn't part of the project (an attribute of a lattice the fence doesn't have), and "conflicting" when the packet contradicts itself.
   - For has... attributes, record false (inferred) when the packet describes the project and never mentions the feature.
   - value in the catalog unit; rawValue as written.
   - For attributes with listed values, map what the homeowner wrote onto a listed value: valueMatch "canonical" when it matches a value or an accepted spelling (put the listed value in value), "unlisted" when it's clearly something else, "uncertain" when you can't tell.
   - For a gate, record which segment it's in with gate.segmentId.
   - evidence: the file id and page index, with a short quote or what the image shows.
3. Answer each condition for each applicable component: "true", "false" or "unknown", with evidence.

Never guess a number that isn't written or drawn with a label. Missing information is "not-provided".`
}

const documentCheck: PromptDefinition = {
  name: "hoa-document-check",
  fallback: `You check whether a homeowner's application packet includes the documents a homeowners association requires.

Required documents, each with what satisfies it, who must sign it, what it must state, and the component it's for when it applies to one run of fence:
{{requirements}}

Owners of record named in the packet: {{ownersOfRecord}}

Checkbox states on the packet's forms:
{{checkboxes}}

The packet's pages, with page kinds and markers:
{{pages}}

For each requirement, return its status:
- "present" when a document satisfying it is in the packet and complete;
- "missing" when there's none;
- "incomplete" when it's there but has problems;
- "unreadable" when the page that should hold it can't be read.
List the problems: "blank" (not filled in), "unsigned", "missing-signer" (signed, but not by everyone required, such as only one of two owners), "missing-statement" (doesn't say everything it must state) and "contradicts-packet" (its answers contradict other files, such as a checklist answering "No" to photos when the packet includes them). Record who signed by role ("applicant", "co-owner", "neighbor"), never by name, and give evidence for each status.`
}

const qualitativeCheck: PromptDefinition = {
  name: "hoa-qualitative-check",
  fallback: `You judge one qualitative rule for a homeowners association architectural review, from the evidence in the application.

Rule: {{ruleStatement}}
What to judge: {{criterion}}
Component: {{component}}

Facts recorded for the application:
{{facts}}

Relevant pages:
{{evidencePages}}

Return "met" only when the evidence clearly shows the rule is satisfied, "not-met" when it clearly shows it isn't, and "unclear" otherwise. Explain your judgment in one or two sentences that cite the evidence. The committee makes the final decision; say what it should look at.`
}

const reviewWriter: PromptDefinition = {
  name: "hoa-review-writer",
  fallback: `You phrase the results of an automated architectural review for a homeowners association. Code has already decided the findings, the recommendation and the action items; you only word them.

Recommendation: {{recommendation}}

Findings, with their rules and sections:
{{findings}}

Facts read from the application:
{{facts}}

Action items to phrase, by id:
{{actionItems}}

Process rules:
{{informationalRules}}

Return:
- assessment: for the committee, at most three sentences: the recommendation and the main reasons for it.
- feedback: for the homeowner, at most three sentences: the outcome and the next step, such as making the changes and providing the information listed, then running the review again.
- items: exactly one entry for every action item id. Each is one sentence of at most 25 words that says exactly what to change or provide, naming the required value when the rule lists one, and ends with the section in parentheses. Cover every component in one sentence instead of repeating it per component. For committee items, ask one yes-or-no question.

Rules:
- The page lists the items under the assessment and feedback, so never list or repeat them there.
- Never add a requirement, request, condition or suggestion that isn't an action item.
- No greetings, thanks, hedging or filler.`
}

export const pipelinePrompts = {
  visualDescription,
  sectionRouting,
  sectionRuleExtraction,
  ruleConsolidation,
  fileClassification,
  factExtraction,
  documentCheck,
  qualitativeCheck,
  reviewWriter
}
