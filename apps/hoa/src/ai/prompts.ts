/**
 * Prompts the app uses. Langfuse prompt management is the source of truth: each prompt is fetched by name and label
 * at run time. The fallback text is used only when Langfuse is unreachable or the prompt hasn't been created yet, and
 * generations that use it aren't linked to a prompt version.
 */
export type PromptDefinition = {
  /** Prompt name in Langfuse prompt management. */
  name: string
  /** Text prompt using Langfuse `{{variable}}` syntax. */
  fallback: string
}

const ruleExtraction = `You turn a homeowners association's governing documents into a structured rulebook that its Design Review Committee (DRC) uses to review homeowners' architectural applications.

HOA: {{hoaName}}
Project types to extract rules for: {{projectTypes}}
Attached documents, in order: {{documentList}}

Read every attached document completely, including scanned pages, drawings, tables and exhibits. Extract every rule that a DRC reviewer would check when reviewing an application for the listed project types. That includes:
- what the project itself must satisfy: allowed materials, manufacturers, styles and colors; height and size limits; placement and setbacks; prohibitions;
- what the application must include: required documents, drawings, photos, neighbor approvals, signatures;
- process rules that affect the decision: approval authority, variances, deadlines, conditions.

For each rule:
- title: a short name, such as "Composite fence colors".
- requirement: the complete requirement in plain language, keeping every number, unit, list of allowed values and exception exactly as written. Keep values tied to their qualifiers, for example which colors apply to which manufacturer. Don't generalize or add requirements the documents don't state.
- kind: allowed-values, numeric-limit, placement, required-document, prohibition or process.
- projectTypes: the listed project types the rule applies to.
- source: the document's name as listed above, the section number or heading, the printed page number when visible (otherwise the PDF page number, or null), and a short verbatim quote of at most 25 words that supports the rule.

Make each rule atomic: split a section that sets several independent limits into separate rules. Skip general boilerplate that never affects a decision. Don't extract rules for project types that weren't listed.`

const applicationReview = `You review a homeowner's architectural application for the Design Review Committee (DRC) of {{hoaName}}, and recommend a decision. The DRC makes the final decision; write so a committee member can verify every finding.

Project type: {{projectType}}
Homeowner's description: {{description}}
Attached files, in order: {{documentList}}

The HOA's approved rules for this project type, as JSON. Each rule has an id, the requirement and its source:
{{rules}}

Instructions:
1. Read every attached file completely, including forms, letters, drawings, plot plans and photos. Work out what the homeowner proposes: materials, manufacturer, product line, colors, dimensions, location, gates and anything else the rules mention.
2. Fill in project.summary (two sentences at most) and project.details with the facts that matter to the rules, labeled clearly. When a fact the rules need isn't in the application, list it with the value "Not provided".
3. Evaluate every rule. Add one finding per rule, using its id as ruleId:
   - met: the application clearly satisfies the rule.
   - not-met: the application clearly conflicts with the rule.
   - unclear: the application doesn't contain enough to decide, or contradicts itself.
   In explanation, say why in one or two sentences. In evidence, point to where you saw it (file name and page, or "Not in the application"). Check claims against the attachments; a checklist answer of "Yes" doesn't prove an attachment exists or is complete. Compare values exactly, including manufacturer-specific lists.
4. List missingInformation: each item the homeowner must still provide, phrased as a request.
5. Choose the recommendation:
   - approve: every rule is met.
   - approve-with-conditions: only minor, clearly fixable gaps; list them in conditions.
   - request-information: required information or documents are missing or unclear.
   - reject: the project conflicts with a rule that a revision of details can't fix.
6. Write assessment: a short paragraph for the committee explaining the recommendation.
7. Write feedback: a courteous message to the homeowner, in plain language, that states the outcome, lists what to change or provide, and cites the relevant rules by section. Don't promise approval; the DRC decides.`

export const prompts = {
  modelCheck: {
    name: "hoa-model-check",
    fallback:
      "You are the assistant for a homeowners association's Design Review Committee. Reply with one short sentence confirming you're ready to review architectural applications."
  },
  ruleExtraction: { name: "hoa-rule-extraction", fallback: ruleExtraction },
  applicationReview: { name: "hoa-application-review", fallback: applicationReview }
} satisfies Record<string, PromptDefinition>
