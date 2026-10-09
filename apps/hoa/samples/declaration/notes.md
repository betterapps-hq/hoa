# Encoders' notes

The judgment calls and schema gaps each encoder recorded while encoding the sample Declaration into
[rules.json](rules.json). A note starting with "SCHEMA GAP:" marks a clause the schema can't express faithfully yet; the
closest faithful form is encoded.

## Articles 1 and 2: the shared vocabulary

- SCHEMA GAP: precedence orders only this organization's document kinds, so "the Governing Documents control over a
  Neighborhood Association's covenants" (1.3/p3) can't be expressed; it's the open question on master and
  sub-associations.
- SCHEMA GAP: Use Restrictions and Board Rules and Regulations are both document kind rules, so precedence can't rank
  one above the other; the Declaration doesn't rank them either.
- SCHEMA GAP: perBase must be an exact decimal of inches, and a meter is 39.370078740157... inches without end, so
  meter's perBase is rounded to 20 decimal places; meter belongs in the core units.
- SCHEMA GAP: Class "B" Control Period (d) lets the Declarant, by a Recorded document, add its own consent to every
  action that needs the Board's consent while it, its Affiliates or any Builder owns a Unit; no construct adds a party
  to other rules' approval checks, so it's not encoded beyond the definition.
- RENAMED: lot.declarant-owned, lot.owned-by-declarant -> lot.owned-by (party; byParty(ref("lot.owned-by"), "declarant",
  "affiliate")).
- RENAMED: lot.owned-by-association -> lot.owned-by (party; = organization).
- RENAMED: lot.held-by-declarant -> lot.owned-by or lot.leased-by (party; any of the two in [declarant, affiliate,
  authorized-builder]; lot.leased-by is absent when unstated).
- RENAMED: lot.landscaping-by-declarant-or-builder -> lot.landscaping-installed-by (party; in [declarant, builder]).
- RENAMED: lot.insured-by-association -> lot.insured-by (party among organization, neighborhood-association, owner; in
  [organization, neighborhood-association]).
- RENAMED: community.declarant-owns-property -> community.exhibit-property-owned-by (many-valued party among declarant,
  affiliate, builder); import declarantOwnsProperty from ./vocab.ts, or write { type: "some", from: "community", path:
  ["community.exhibit-property-owned-by"], where: null, test: { type: "in", left: { type: "ref", path: [] }, values:
  [declarant, affiliate as value operands] } }; "no longer owns" is { type: "not", of: declarantOwnsProperty }.
- RENAMED: community.declarant-or-builder-owns-property -> community.exhibit-property-owned-by (import
  declarantOrBuilderOwnsProperty from ./vocab.ts, or ownsExhibitProperty("declarant", "affiliate", "builder")).
- RENAMED: title-transfer.first-sale-by-declarant -> title-transfer.transferred-by in [declarant, affiliate] together
  with title-transfer.unit-improved = true (8.10, 8.11).
- RENAMED: title-transfer.transferor-is-declarant -> title-transfer.transferred-by (party; in [declarant, affiliate]).
- RENAMED: title-transfer.buyer-excluded -> title-transfer.transferred-to (party; in [declarant, affiliate,
  declarant-rights-grantee, mortgagee]).
- RENAMED: work.performed-by (choice of work-performer.*) -> work.performed-by (party, defined here; values declarant,
  affiliate, governmental-entity, public-utility); drop the work-performer set, and drop the work thing too, which is
  core now (refine it only for labels).
- RENAMED: vote.unilateral-by-declarant -> vote.by (party; = declarant for an amendment the Declarant makes alone).
- RENAMED: vote.declarant-consents -> an approval check { type: "approval", by: ["declarant"], needs, prior, written }
  on a requirement rule (bearer omitted) whose subject is the vote, so the approval covers the vote itself; consents
  that must all be given go in one by list with needs "all", and "A or B" is needs "any".
- RENAMED: vote.class-b-member-approves -> an approval check with by ["class-b-member"] on a requirement rule about the
  vote, covering the vote itself, with appliesWhen community.class-b-control-period = true instead of an any() inside
  the check.
- RENAMED: insured-party set (insured-party.association / .owner / .neighborhood-association) ->
  insurance-policy.insured is party-valued (organization, owner, neighborhood-association).
- RENAMED: compliance-period and compliance-period.scheduled-on are no longer vocab core additions; they're core (with
  compliance-period.completed-on), like approval, work, violation.observed-on and violation.cured-on.
- Other per-party flags in your part (timeshare-program.declarant-operated, water-draw.by-declarant,
  drainage-alteration.by-declarant-or-association, business-activity.conducted-by's business-operator set,
  community.declarant-selling-units) become party-valued properties in your part ({thing}.operated-by,
  {thing}.performed-by, or work.performed-by when the thing is Work), and approval booleans
  (exterior-item.reviewer-approved, vote.king-county-approves, mortgagee and board consents) become approval checks
  covering the thing itself (the exterior item, the vote, the lease), or approved conditions where a rule depends on an
  approval already given.
- TERMS, parties: organization (Association), board (Board of Directors), members, owner, occupant, tenant, guest,
  committee (Reviewer/DRC), declarant, affiliate, builder, authorized-builder (category of builder),
  declarant-rights-grantee, governmental-entity, public-utility, person, mortgagee, class-b-member,
  neighborhood-association, neighborhood-committee, trrs, private-amenity-owner, king-county, managing-agent,
  contractor.
- TERMS, who did or holds what (party-valued; = for one party, in for several, byParty(path, ...parties) exported from
  ./vocab.ts): lot.owned-by, lot.leased-by, lot.landscaping-installed-by, lot.insured-by, work.performed-by, vote.by,
  title-transfer.transferred-by, title-transfer.transferred-to, insurance-policy.insured,
  community.exhibit-property-owned-by (many); core approval.by.
- TERMS, documents: document keys declaration, use-restrictions, guidelines (loaded) and by-laws, articles, board-rules
  (referenced, declared here) for enforces.documents and override selectors; the terms governing-documents, declaration,
  supplemental-declaration, articles-of-incorporation, by-laws, residential-design-guidelines, use-restrictions,
  board-rules are for {{links}} in statements.
- TERMS, places: community (Residential Community), lot (Unit), common-area, limited-common-area (category;
  common-area.limited), recreational-facility, area-of-common-responsibility, neighborhood (lot.neighborhood),
  voting-group, private-amenity, community-wide-standard, mortgage, recording (.on), covenant-to-share-costs,
  master-plan, upd-permit; expense-type.common / .neighborhood.
- TERMS, Declarant control: community.class-b-control-period (derived from community.units-conveyed-to-class-a,
  .master-plan-units, .five-year-conveyance-gap, .class-b-ended-by-member and the governing date),
  community.exhibit-property-owned-by with the exported conditions declarantOwnsProperty and
  declarantOrBuilderOwnsProperty.
- TERMS, votes: community.total-voting-power (relabeled Class "A" votes), community.non-declarant-votes, vote.in-favor,
  vote.in-favor-non-declarant, vote.against, vote.eligible-votes, vote.by; consents and ratifications are approval
  checks covering the vote itself, on requirement rules; add vote-subject.* values for each kind of vote.
- TERMS, age and occupancy (3.1(a), (b)): occupant.born-on, occupant.permanent, qualifying-permanent-resident and minor
  (categories of occupant), residence, residence.occupants, community.occupied-residences,
  community.residences-with-qualifying-resident, occupancy-change (.on, .reported-on), business-activity.
- TERMS, leasing (3.1(c)): lease (document), lease-registration.term (core), .premises
  (leased-premises.principal-dwelling / .part-of-dwelling / .accessory-dwelling), .in-writing, .signed-on, .reported-on.
- TERMS, transfers: title-transfer request (core addition, flow filing) with .transferred-on, .notice-received-on,
  .sales-price, .transferred-by, .transferred-to, .unit-improved; lot.first-conveyed-on.
- TERMS, vehicles (Exhibit C (a)(i), (ii)): vehicle, vehicle.class (vehicle-class.commercial / .recreational /
  .mobile-home / .watercraft), vehicle.oversized, .inoperable, .stored; parking (.vehicle, .location, .start, .end,
  .loading); vehicle-repair (.location); location set: location.enclosed-garage, .dwelling, .unit-exterior, .driveway,
  .street, .vehicle-storage-area, .common-area.
- TERMS, animals (Exhibit C (a)(iv), (v)): animal, animal.kind (animal-kind.dog / .cat / .household-pet / .livestock /
  .poultry), pet (category), lot.animals (many), animal.roams-free, animal.leashed-outside; nuisance, noise and danger
  are judgments decided by the board.
- TERMS, exterior items (Exhibit C (a)(x), (xii), (b)(ii); 3.5(b)): exterior-item, exterior-item.type
  (exterior-item-type.sign, .play-equipment, .clothesline, .fountain, .birdbath, .lawn-statuary, .flagpole,
  .ornamentation, .garbage-can, .woodpile, .above-ground-pool, .hot-tub, .dock, .hedge, .wall, .dog-run, .animal-pen,
  .fence, .satellite-dish, .antenna, .garden), exterior-item.antenna-service (antenna-service.direct-broadcast-satellite
  / .multipoint-distribution / .television-broadcast), exterior-item.size (in meter), exterior-item.display-kind
  (display-kind.religious-holiday / .political / .advertising).
- TERMS, other use and maintenance: stored-item (.kind, .location), burning (open-air burning, an event), fireplace
  (.type: fireplace-type.wood-stove / .zero-clearance / .outdoor-cooking), garage-sale (event),
  lot.landscaping-installed-on, lot.landscaping-installed-by, party-structure, plans, photo, inspection-report
  (documents for judgments).
- TERMS, assessments (Article 8): assessment (core: .due-on, .paid-on, .unpaid-balance), assessment.type
  (assessment-type.base / .neighborhood / .special / .specific / .use-fee / .working-capital / .reserve-contribution /
  .transfer-fee), assessment.amount, community.fiscal-year-start (schedule), community.annual-base-assessments,
  community.reserves-on-hand, budget (.adopted-on, .sent-on).
- TERMS, enforcement (7.4, 4.8): violation (core: .observed-on, .notice-delivered-on, .cured-on, .hearing-requested-on,
  .hearing-held-on, .occurrence), violation.cure-by, .emergency, .location, .continuing, .cost-of-work; privilege.vote /
  .recreational-facilities / .association-services / .common-area-facilities for suspensions; cure.curedBy is usually
  violation.cured-on or assessment.paid-on.
- TERMS, insurance (5.4, 7.3): insurance-policy, .coverage (insurance-coverage.property / .general-liability /
  .workers-compensation / .directors-officers / .crime-fidelity), .insured (party), .full-replacement-cost,
  .limit-per-occurrence, .amount, .endorsements (insurance-endorsement.*); lot.insured-by.
- TERMS, easements (Article 11, 10.9): easement, easement.type (easement-type.*), entry (.at, .notice-given, .emergency,
  .into-structure), encroachment (.distance in feet, .willful).
- TERMS, request types: title-transfer and certificate-request are core additions (flow filing, lot required;
  certificate-request.type: certificate-type.approval / .assessment-payment); the core ones are
  architectural-application (application), violation and assessment (enforcement), lease-registration, meeting,
  records-request, nomination (filing), and compliance-period (duty, for rules with recurs).
- Terms used only outside Articles 1 and 2 have an empty definedIn and a scopeNote naming the sections that use them;
  the article encoders' rules cite those provisions.
- Definitions in Article 2 are unnumbered, so each is labeled article-2/{term} with num null, and the lettered ends of
  the Class "B" Control Period are points under it; its lead-in ("expires upon the first to occur of the following:") is
  the definition's intro.
- Sections 1.1, 1.2 and 1.3 have several paragraphs with different content, so each is split into counted paragraphs and
  the section itself is marked heading.
- The preamble (which names the Declarant) and the Part One and Part Two introductions sit outside the article ranges,
  so they're encoded here.
- Article 1 and 2 hold no rule of their own: 1.1/p2 (55 and over) duplicates 3.1(a), 1.3/p2 (consent to Record
  covenants, a requirement with an approval check) duplicates 10.5, and the rest is purpose, definitions or settings.
- No sanctionPreconditions here: Articles 1 and 2 state no notice-and-hearing procedure, so the Article 7 encoder sets
  it from 7.4.
- The precedence clause is from 1.3/p3 (Washington law, then the Declaration, the Articles, the By-Laws); design
  guidelines above the Use Restrictions comes from 3.3(d), which the Article 3 encoder should add as a citation, and
  ranking both below the By-Laws is a judgment call.
- "Washington law" in 1.3/p3 is read as statute and ordinance alike, since King County ordinances and the UPD Permit
  bind the community as law.
- The Supplemental Declaration ranks with the Declaration, so its more restrictive provisions (1.3/p2) and its
  exceptions (9.3) can override the Declaration's rules.
- Party values name the most specific party, and affiliate stays a party of its own rather than a category of declarant,
  because the Declaration sometimes names the Declarant without its Affiliates; rules list both where it says "Declarant
  or any Affiliate".
- community.exhibit-property-owned-by is a many-valued party property limited to the Declarant, Affiliates and Builders,
  rather than one boolean per combination of them; the feature states which of them still own property, as a complete
  list.
- authorized-builder is a category of builder with a text criterion, so a fact naming it also matches builder; nothing
  in Articles 1 and 2 says how the Declarant authorizes a Builder.
- title-transfer and certificate-request are filing requests: the transfer is filed when the organization learns of it,
  and both concern one Unit.
- The Class "B" Control Period is a derived boolean; end (b) needs the conveyance history, so it's a stated fact
  (community.five-year-conveyance-gap) rather than computed.
- The Reviewer (committee) is refined with the DRC's labels; when the Declarant reviews applications itself it's still
  the committee party, as 4.2(c) defines the Reviewer as whichever has jurisdiction.
- community.total-voting-power is relabeled Class "A" votes, because the Class "B" Member doesn't vote (6.3(b)).
- Governing documents and instruments (Use Restrictions, Plans aside) are things of nature object, not document, since
  document means a file a requester provides; as governing documents they're the document keys above.
- Provision text joins line breaks and separates paragraphs with a blank line; 1.3/p1's table is one row per line, and
  definitions use the colon most of them print after the defined term, since the OCR renders that mark inconsistently.
- OCR repairs in the text are only certain ones: dropped section dots ("8 1" to "8.1"), dropped sentence periods, "rich
  standards" to "such standards", "U.S.0 �3607" to "U.S.C. §3607"; part-two keeps "procedures adopting" without
  inserting a missing "for".
- Vehicle class is single-valued (commercial, recreational, mobile home, watercraft), and oversized, inoperable and
  stored are separate booleans, since a vehicle can be both a class and inoperable.

## Article 3 and Exhibit C, the Use Restrictions

- SCHEMA GAP: the daily fine for an unreported occupancy change (3.1(a)(v)) has no stated amount, so amounts is
  set-by-imposer, but repeats needs a fixed amount per day, and the fines run from the change itself, a date the
  violation request can't reach by path; so the per-day accrual isn't encoded.
- SCHEMA GAP: whether the personal property was on the Unit, in compliance, before the rule was adopted (3.5(f)) stays a
  text condition: an approved condition doesn't fit, since property kept in compliance needs no one's approval and no
  approval is false; and the selector can't carry it, since a rule without appliesTo reads only lot, request and
  community paths, the selected subjects (vehicles, animals, stored and exterior items) share no date property for when
  they arrived, and adoptedAfter takes one path, already the current Owner's title date.
- SCHEMA GAP: duties that hold "at all times" or "periodically" (the 80 percent rule, age records, the age-compliance
  policies) have no schedule, so they run in compliance periods without recurs and no compliance-period request is
  created for them automatically.
- SCHEMA GAP: judgments about the Association's or the Board's own duties (age records, compliance policies) still need
  a decidedBy party, and the Board is the only one that fits.
- The three unnumbered paragraphs after 3.1(a)(vi) are split by subject: enforcement and the attorney-in-fact
  appointment (named in (vi)'s heading) and the Owner's responsibility are 3.1(a)(vi)/p2 and /p3, and the amendment
  power, which reads as part of 3.1(a) as a whole, is 3.1(a)/p2.
- The tail of Exhibit C (a)(x) after item (3), "(collectively, Permitted Antennas) shall be permitted...", stays the
  counted paragraph a(x)/p2 rather than a(x)'s wrapUp, because it also carries the separate master-antenna sentence and
  its key is cited; Exhibit C itself is the exhibit provision use-restrictions:exhibit-c, the parent of p1, p2, a and b.
- Lead-ins moved to intro: Exhibit C (a) and (b), 3.5, and the business-activity half of 3.1(b), whose first sentence
  (residential use) stays its text.
- Sections with no text of their own (3.3) take their heading line as text, like articles; items' headings
  ("Restrictions on Occupancy") are in heading, not text.
- OCR repairs beyond spelling: missing sentence-final periods and the semicolons ending Exhibit C items were restored;
  "(1)" in "Section 3 1(a)(1)" was read as (i); "addition," in 3.5(e) as "In addition,"; "rechandeling" as
  "rechanneling". "distributing" in Exhibit C (b)(v), probably "disturbing", was kept as recorded.
- Exhibit C (a)'s intro ("prohibited ... unless expressly authorized by ... the Board") is an approval check by the
  board on each listed activity's rule, so the former outright prohibitions there (wildlife, animals, drainage,
  conversions, garage sales) are obligations with that check, and the rules with a test (parking, vehicle work, storage)
  moved the test into appliesWhen and check the Board's authorization instead.
- The Board's approvals under (a) are neither prior nor written: (a) says only "expressly authorized"; conditions the
  Board attaches to an authorization are decision rules citing use-restrictions:a as their authority, and Board Rules
  apply on their own.
- Read literally, (a)'s intro also reaches pets harming wildlife ((a)(iv)), so that rule checks the Board's
  authorization when a pet chases, injures or kills wildlife; the leash, waste, roaming and nuisance sentences in (a)(v)
  are separate requirements the intro doesn't govern.
- The loading allowance in (a)(i) is now a permission whose appliesWhen includes the 7 a.m. to 10 p.m. window, so
  loading outside it falls back on the Board's authorization rather than failing outright.
- (a)(viii) is evaluated on a water-supply-activity with an adverse-impact fact, instead of a Board judgment on the
  Unit, so the Board's authorization can be its check; the adverse-impact definition carries the examples (a)(viii)
  lists.
- Garage enclosures have two deciders, the Board under (a) and the Reviewer under (a)(vii) "in accordance with Article
  4", so the garage rule displaces the Board-authorization rule for garages with an approval check by either one (needs
  any).
- The (a)(x) rule, "strict compliance with Article 4" unless the Board expressly authorizes otherwise under (a)'s intro,
  is one approval check by the Reviewer or the Board (needs any).
- The (a)(vii) and (a)(x) either-or checks are neither prior nor written, since the Board's authorization under (a) is
  neither; the Reviewer's prior written approval of the work is still required by Article 4's own rule (4.1), which
  applies alongside them.
- The (a)(x) rule runs only in violations: in an application, the application is the Article 4 compliance, and the
  guideline rules apply there.
- Permitted Antennas are permissions overriding only the (a)(x) approval rule, so the Residential Design Guidelines'
  location and screening rules still apply to them; the master-antenna permission now also needs the apparatus to be
  erected by the Declarant or the Association (exterior-item.erected-by).
- The Declarant's and Association's drainage right in (a)(vi) is a permission exempting them from the prohibition, plus
  two obligations on its limits: a Board judgment on Owners' value and use and the UPD Permit, and King County's prior
  approval as an approval check; their bearer is the organization, though the Declarant shares them.
- Exhibit C (b)(iii)'s "Declarant and its designees" is a permission for the Declarant itself and, for anyone else
  drawing water, an obligation displacing the prohibition whose check is the Declarant's approval (its designation),
  both only where the UPD Permit allows the draw.
- The household-pet exception in (a)(v) is read as permitting keeping pets, not breeding them; a reasonable number of
  pets is a Board judgment on the Unit, since no number is stated.
- The pet removal in (a)(v) is a self-help sanction (amounts none) the Board may impose against the pet's keeper, after
  its request (the violation notice), on the roaming and nuisance rules.
- The Board's "sole and absolute discretion" to decide when a person occupies or resides in a Unit (3.1(a)) isn't a
  rule; it's who settles the facts behind residence.occupants.
- The 55-or-older and no-minors rules run on a residence rather than a lot, so a Unit with a separately occupied guest
  house is judged dwelling by dwelling; 3.1(a) says "Unit" and 3.1(a)(i) defines "Residence" for the 80 percent rule.
- Guests under 18 (3.1(a)(ii)) are occupants who aren't permanent; when every minor in a Residence is a guest, the
  60-day rule displaces the no-minors rule and its own check decides.
- The surviving-occupant permission (3.1(a)(i)) is the Board's approval, not a discretion rule, because it's granted on
  a request and must hold up in a violation; the rule displaces the 55-or-older rule only while the community stays at
  80 percent, condition (A), and condition (B), jeopardizing the older-persons status, is left to the Board's approval.
- The 80 percent rule is the Association's, checked in a compliance period; no single Owner can be found in violation of
  it.
- 3.1(a)/p2's amendment power is two requirements on a vote with its own subject: who may amend (the Declarant while it
  or an Affiliate owns Exhibit A or B property, then the Board, by vote.by) and King County's prior approval; that the
  amendment is needed for the Act is left to the amending body, as it "deems".
- The written request for the surviving-occupant permission (3.1(a)(i)/p2) and the duty to disclose the age restriction
  to prospective tenants and purchasers (3.1(a)(iii)) aren't evaluated: no request type carries them.
- Reporting a change in occupancy "immediately" (3.1(a)(v)) is encoded as the 10-day deadline after which fines run, the
  only measurable bound.
- The Board's waiver of the lease writing and term requirements (3.1(c)/p2) is one obligation per requirement, applying
  only to a lease that fails it and displacing it, with the Board's prior written consent as its check; the Declarant's
  exemptions also exempt the matching waiver rules, and its waiver through a Supplemental Declaration is that document's
  own rule.
- The business exemptions (3.1(b)/p3) are one permission over every rule under 3.1(b), with a party-valued conducted-by;
  Persons the Declarant approves are a category of person with a text criterion, like authorized-builder, and the
  permission's bearer is the generic party person, since the exempt parties vary.
- "Other developers" the Declarant or an Affiliate permits to run a time-share program (3.1(e)/p2) are read as Builders:
  their program needs the approval of either one (needs any) instead of being prohibited.
- The wildlife exception "as a governmental authority requires or permits" (Exhibit C (a)(iii)) is an approved condition
  on the taking by a governmental entity or King County (needs any), reading an authority's requirement to take the
  wildlife as its approval.
- Converting Units into Common Area by the Declarant (3.1(e)) overrides no rule, so it's left in the provision text
  without a rule.
- The Class "B" Member's disapproval "if any" (3.3(a)/p2) is moot: disapproval is only available after the Class "B"
  Control Period, when the Class "B" membership has ended (6.2(b)), so only the Class "A" threshold is encoded; its
  approval of Members' Use Restrictions (3.3(b)) is a separate requirement during the Control Period.
- Member disapproval of a Board change (3.3(a)) uses its own vote subject with vote.in-favor, rather than vote.against
  on the change, so a passing vote means the change is disapproved.
- "A meeting called for such purpose" (3.3(b)) is in the statement only; no meeting term records a meeting's purpose.
- The 3.3 procedures' effect on when a Use Restrictions change takes effect (after distribution, at least 30 days, or
  after a petitioned meeting) isn't a rule; it sets the effectiveFrom of the use-restrictions editions.
- 3.5's limits apply only to Use Restrictions and Board Rules adopted under 3.3, not to the initial Exhibit C (3.5's
  intro and 3.5/p2), so (a) to (e) override no Exhibit C rule, and they stay not-evaluated because they limit what later
  rules may say, with time, place and manner exceptions a selector can't separate; 3.5(f) is a grandfathering permission
  whose selector covers the use-restrictions and board-rules documents, adopted after the current Owner took title
  (lot.owner-took-title-on), which also leaves out the initial Exhibit C.
- The precedence clause repeats the vocab order (design guidelines above rules) and cites 3.3(d), which is where "the
  Residential Design Guidelines shall control" over the Use Restrictions comes from.
- Liability: 3.1(d) and 3.1(a)(vi)/p3 make the Owner answer for occupants, tenants and guests; 3.1(d) also makes them
  answer for losses to the Area of Common Responsibility, which no rule here evaluates.

## Articles 4 and 5

- SCHEMA GAP: a selector rule's appliesWhen is read on each selected rule's subject, so the Declarant exemption, the
  prospective-amendments permission and the estoppel, which hinge on Work (who did it, when it began, when the
  Association knew), are encoded on work and reach a guidelines rule only where that rule's subject is the Work itself,
  not a fence run or other thing the Work installs.
- TERMS, Work (4.1, 4.3(b)): the core work thing, refined with the Declaration's labels; work.kind
  (work-kind.new-structure / .site-work / .exterior-alteration / .landscaping / .repaint-approved-colors / .interior /
  .visible-interior / .garage-enclosure), work.started-on, .completed-on, .completion-deadline-approved, .complete-by
  (derived), .exempt-by-resolution, .pre-approved-plan, .association-notified-on; who did the Work is vocab's
  work.performed-by, and approvals are the core approval thing.
- TERMS, the Reviewer (4.2): community.declarant-design-rights (derived), community.declarant-design-rights-ended,
  architectural-application.delegated-to-drc, architectural-application.reviewer (derived; reviewer.declarant /
  reviewer.drc); the Reviewer party itself is vocab's committee.
- TERMS, fees, amendments and variances: architectural-application.review-fee, .review-fee-paid-on, .variance-requested;
  community.guidelines-amendment-delegated; the vote-subject.design-guidelines-amendment value is part-property's
  (10.6).
- TERMS, the response (4.3(b)): architectural-application.response-mailed-on, .response-delivered-on, .response-given-on
  (derived deeming clause), .declarant-notified-on, .vetoed-on; core additions decision-status.approved-with-conditions
  and .partially-approved (both broader than approved), .disapproved, and approval-status.withdrawn.
- TERMS, Article 5, 4.7 and 4.8: lot.adjacent-landscape-strip, lot.adjacent-strip-common-responsibility,
  lot.insurance-policies (many), lot.damaged-on, lot.approval-certificate-on, violation.association-failed-to-enforce,
  privilege.community-access; vocab's lot.landscaping-installed-by and lot.insured-by replace this part's former
  booleans.
- 4.1/p1 and 4.3(b) state one requirement, so the former #approval-before-work rule is merged into
  declaration:4.1/p1#approval-required, an approval check by the committee, prior and written (4.3(b)/p3 makes every
  response written); it runs in applications too, where an undecided approval goes to the committee, as the schema's
  example does. Other parts that list declaration:4.3(b)#approval-before-work should drop it.
- "Approval deemed withdrawn" (4.3(b)/p7) is a requirement on the approval itself: a deadline for construction to start
  within a year of approval.on, whose miss deems approval.status withdrawn (a proposed core value); the approvals
  feature records it, so the approval check sees the withdrawal from the next evaluation on, not in the evaluation that
  reports it.
- The 4.3(b)/p5 deeming clause (notice given when mailed, or when personally delivered) stays a derived property,
  architectural-application.response-given-on, taking the earlier of the two dates when both are recorded.
- The Declaration sets no response time for the Reviewer and deems nothing approved or disapproved if it doesn't
  respond; 4.3(b)/p3#written-response is a deadline with no latest offset, so it stays pending until a written response
  is recorded and never fails.
- The completion deadline applies to all Work once construction commences ("All Work shall be completed within one year
  of commencement"), using the derived work.complete-by, checked as a deadline with a zero offset from it.
- "10 days" for the Declarant's veto (4.3(b)/p6) is encoded as calendar days, though the sentence before it counts three
  business days; the organization's time clause should confirm what an unqualified "days" means.
- The Declarant's veto is now a requirement (what a veto needs to take effect: written notice within 10 days of
  receiving the DRC's notice), anchored on the date the DRC notified it, since receipt isn't recorded separately.
- The DRC's duty to notify the Declarant applies only while the Declarant holds design review rights and the DRC decided
  the application; approved-with-conditions and approved-in-part count as approved through broader.
- Review fees paid before review (4.2(d)) are a requirement on the application, applying when the Reviewer requires
  prepayment (architectural-application.review-fee is stated); the fee amounts, hiring reviewers and budgeting their pay
  aren't evaluated.
- The Declarant exemption (4.1/p4) is a permission whose selector covers every rule under Article 4 and the guidelines
  document (the guidelines bind only through 4.1/p1's "in compliance with ... this Article and the Residential Design
  Guidelines"), excepting Article 4's own exemptions so no selector selects itself; the same selector serves the 4.7
  estoppel.
- The word before "of Declarant" in 4.1/p4 is illegible in the scan, kept as "[illegible]" in the text and read as
  Affiliate (vocab's affiliate party), which needs confirming against the recorded original.
- 4.3(a)/p3 (amendments prospective only) is a permission over the guidelines document with adoptedAfter
  work.started-on, applying only to Work with an approved condition (the committee's prior written approval, as 4.1/p1
  requires), so guideline versions adopted after construction began don't reach previously approved Work, while
  unapproved Work and new Work, which has its own start date, meet the guidelines as amended.
- The variance power (4.5) is a discretion rule over the guidelines document, in applications only, applying when the
  application asks for a variance (architectural-application.variance-requested), so ordinary failed guideline findings
  stay not-met rather than all going to the committee; it never reaches the Declaration's rules, as 4.5(b) requires.
- The written consent a variance needs (the Declarant's while it, an Affiliate or a Builder owns property, then the
  Board's) is two requirement rules with approval checks on the Work, chosen by vocab's declarantOrBuilderOwnsProperty.
- 4.3(a)/p2 (who may amend the guidelines) is two requirements on the amending vote in a meeting request, following
  part-property's 10.6: the Declarant alone while it, an Affiliate or a Builder owns property and hasn't delegated, and
  the DRC only with the Board's consent; a guidelines amendment isn't usually a meeting, but vote is the only thing that
  carries an act of adoption.
- The 4.7 estoppel is a permission with the Article 4 and guidelines selector, applying to Work whose condition the
  Association had notice of on or before the latest certificate's date; lot.approval-certificate-on is absent when
  unstated, which raises absent-in-exception by design, since most Units have no certificate.
- work.performed-by is unknown when unstated, so in a violation the Declarant exemption is missing-information until the
  violation feature states who did the Work; work.exempt-by-resolution and work.pre-approved-plan are absent when
  unstated, which raises absent-in-exception on 4.3(b)/p9#exempt-by-resolution by design.
- Interior work that needs approval anyway (visible porches and patios, garage enclosures) is a separate work-kind
  value, not narrower than interior, so the 4.1/p2 permission doesn't exempt it.
- Removing trees or shrubs from the adjacent strip without approval (5.2/p2) is covered by the approval rule, which
  cites 5.2/p2, since 4.1/p1 reaches removal of landscaping anywhere in the community.
- Article 4 violations have a cure of zero days after violation.cure-by, the reasonable time the written request names
  (4.8/p1), cured by violation.cured-on; Article 5 rules use the organization's default cure, since 7.4 gives reasonable
  notice and an opportunity to cure.
- 4.8's sanctions each enforce this part's Article 4 obligations run in violations and the guidelines document in one
  enforces, replacing the former twin sanctions for the Declaration rules and the guidelines; harmony (4.3(b)/p2) runs
  only in applications, so no sanction enforces it.
- 4.8's notice and hearing (4.8/p2, 4.8/p3, "in accordance with the By-Laws") are the settings' sanctionPreconditions,
  which the Article 7 encoder sets from 7.4, so the sanctions here no longer repeat them in appliesWhen.
- Interest on self-help costs (4.8/p1) is an interest sanction with amounts set-by-imposer, imposed by the Board, which
  sets the rate; the cap at the maximum lawful rate isn't encoded, as no statute is loaded.
- 4.8 gives its self-help and removal powers to the Association and the Declarant; the Association's are imposedBy
  organization, and the Declarant's are one sanction (4.8/p4) conditioned on the Association's failure to act and on
  vocab's declarantOrBuilderOwnsProperty; 4.8/p5's legal action is imposedBy organization, though the Declarant has
  standing too.
- The acts of an owner's contractors, agents, employees and invitees count as the owner's (4.8/p3), encoded as a
  liability clause from contractor to owner that excepts the contractor exclusions (this part's
  4.8/p3#exclude-contractor and part-assoc's 7.4(a)(vii)#exclude-contractor), so excluding a contractor never reaches
  the owner.
- 4.8/p5 also enforces "the Reviewer's decisions" (conditions of approval), which are decision rules in decision
  documents; enforces.documents can't select every decision document, so only Article 4 and the guidelines are listed.
- The Declarant's assertion of the Association's lien (4.8/p4) isn't a separate sanction: the cost is a Specific
  Assessment, collected and secured in the assessment flow under Article 8.
- The certificate of approval (4.7) runs in the certificate-request core addition.
- Conditions of approval are decision rules (scope and authority 4.3(b)/p3) created by the approvals feature; 4.8/p2
  makes every approval conditional on completing all elements, encoded as the completion deadline citing 4.8/p2.
- Limits of liability (4.6, the last sentence of 4.8/p3) aren't rules: no request evaluates whether the Association or
  the Reviewer is liable, and limit rules only cap sanctions.
- This Declaration's Article 4 has no inspection provision; entry to inspect is in Article 11 and 7.4.
- SELF-HELP FOR MAINTENANCE: Article 5 itself grants no self-help; the Association's right to perform maintenance an
  owner neglects and charge it as a Specific Assessment is in 7.4 (the paragraph after 7.4(a)(viii)), so the Article 7
  encoder's sanction should enforce declaration:5.2/p1#maintain-unit, declaration:5.2/p2#adjacent-landscaping,
  declaration:5.4/p2#property-insurance and declaration:5.4/p3#rebuild-or-clear, and a Neighborhood Association variant
  should enforce declaration:5.3/p2#neighborhood-association-maintenance and
  declaration:5.4/p4#neighborhood-association-repair.
- Maintenance standards tied to the Community-Wide Standard are judgments decided by the board, with photos and
  inspection reports as evidence; 5.4/p1 (maintenance includes repair and replacement) is folded into 5.2/p1's judgment.
- 5.2/p1's exceptions (Area of Common Responsibility, maintenance the Association or a Neighborhood Association assumed)
  are per portion of the Unit, such as the front-yard landscaping 7.2(c) assigns to the Association, so they're in the
  judgment's question rather than appliesWhen.
- The owner's insurance duty applies unless vocab's lot.insured-by names the Association or a Neighborhood Association;
  it's an ongoing duty checked in violations, not a recurring compliance period, since compliance periods concern no
  lot.
- 5.4/p4 is one judgment covering a Neighborhood Association's repair, insurance and rebuilding, rather than three rules
  mirroring the owner's.
- The owner's duty to pay costs insurance doesn't cover (5.4/p3) and premiums levied as assessments (5.4/p2) aren't
  encoded; they're charges, not compliance checks.
- The DRC's size (three to seven persons) and appointment by the Board (4.2(b)) aren't encoded: no request type
  evaluates committee composition, though 4.2(b) is covered by the reviewer terms that cite it.
- Sections whose heading is on its own line and that have several paragraphs (4.1, 4.6, 4.8, 5.2, 5.3, 5.4) are headings
  with counted paragraphs p1 onward; single-paragraph sections (4.4, 4.5, 4.7, 5.1) keep heading and paragraph in their
  own text; lettered points whose heading is inline keep their first paragraph and count continuations from p2. No
  provision here is a lead-in, so intro and wrapUp are null throughout.
- The inline lists (i) and (ii) in 4.2(a)/p2, (i) to (iii) in 4.3(b)/p3 and (a) to (c) in 4.5 are inside single
  sentences, so they stay in their provision's text rather than becoming points.
- OCR repairs are only certain ones: dropped section dots, dropped sentence periods, "5.t" to 5.2, "(m)" to (iii),
  "objection's anclior" to "objections and/or", "Rekiewer's" to Reviewer's, "his"" to his; the margin marks ("x,",
  "cri", "wu") and page footers are removed.
- The Part Three introduction (lines 1505-1512) falls in this range, so it's encoded here as part-three, matching
  vocab's part-one and part-two.

## Articles 6 to 8

- SCHEMA GAP: an intro governs only a provision's children, but 7.2/p1, 7.3(b)/p3, 8.5/p1 and 8.9/p1 are lead-ins for
  the lettered items that follow them as siblings under the same section (7.2(a)-(d), 7.3(b)(i)-(ix), 8.5(a)-(b),
  8.9(a)-(c)); they stay counted paragraphs, so a citation of an item doesn't show its lead-in, and the rules on those
  items cite the lead-in paragraph alongside them.
- SCHEMA GAP: charging a negligent Owner the deductible (7.3(b)/p2) follows an insured loss, not a breach, but a
  sanction must enforce a rule, so the implied duty not to cause an insured loss by negligence is encoded as
  7.3(b)/p2#negligent-loss, a judgment decided by the Board in a violation.
- SCHEMA GAP: a precondition can't read the evaluation date, so 7.4(a)/p3's "opportunity to cure" is only that the
  notice set a cure-by date; whether that date has passed comes from the enforced rules' cure periods, which only
  7.2(c)#enclosed-area sets (part-arch's Article 5 rules rely on a default cure that isn't set).
- SCHEMA GAP: barring an Owner who owes TRRS (7.4(a)(iii)) enforces a debt to another organization, not a rule here;
  it's a suspension enforcing the declaration document, conditioned on TRRS's notice.
- SCHEMA GAP: allocating assessments (equal per Unit in 8.1/p2 and 8.2/p2, proration by months remaining in 8.6/p1,
  benefit-based allocation in 8.2/p2, pro rata shares in 8.8/p2, same administrative charge per Unit in 6.4(a)/p3) is
  the schema's open computations question; those are marked not-evaluated or left to the assessment feature, and
  lot.assessments-commence-on derives only the commencement date.
- SCHEMA GAP: lien priority (8.8/p1: superior to all but taxes and first Mortgages) concerns other creditors and isn't a
  sanction property; only extinguishment by first-Mortgage foreclosure is encoded, as a limit rule, with the buyer's
  freedom from earlier assessments as a permission.
- TERMS, votes and Units: class-a-member, officer (parties); lot.votes-cast, .vote-designation-filed,
  .persons-seeking-to-vote, .exempt-from-assessment, .owner-tax-exempt, .assessment-exemption-granted-by (party),
  .first-mortgage-foreclosed-on, .in-sensitive-area, .submitted-on, .assessments-commence-on (derived),
  .landscaping-enclosure (reference to the enclosing work); community.first-levy-on, .voting-groups, .class-a-directors;
  vote.disapproved-by (party, many), .owners-in-favor, .eligible-owners, .insurance-shortfall; meeting.purpose (on the
  core vote-subject set), meeting.materials-mailed-on; vote-subject.combine-neighborhoods / .neighborhood-services /
  .discontinue-operation / .reduce-common-responsibility / .not-restore-damage / .budget-ratification /
  .neighborhood-budget-ratification / .special-assessment-ratification / .benefit-allocation-petition.
- TERMS, maintenance and insurance: association-maintained-landscaping, planting (.in-association-landscaping);
  community.insurance-policies (many), .coverage-not-reasonably-available (many), insurance-review-report (document),
  insurance-policy.insurer-qualified, .co-insurance-clause; insurance-endorsement.volunteer-waiver / .no-contribution /
  .certificate / .broad-waiver-of-subrogation / .cash-settlement; neighborhood.insurance-required, .property-insured.
- TERMS, enforcement: violation.trrs-notice-received-on, .parking-violation, .association-prevailed, .enforcement-costs,
  .administrative-charge, .neighborhood-wide, .deductible, .fine-due-by, .fine-paid-on, .owner-fine-notice-on;
  assessment.notice-delivered-on; part-arch's privilege.community-access is reused for excluding contractors.
- TERMS, finance: budget.type (budget-type.common / .neighborhood / .special-assessment), budget.prepared-on,
  budget.declarant-subsidy; community.reserves-segregated, .reserve-study-on, reserve-study (document),
  reserve-withdrawal (.board-signatures, .officer-signatures, .for-reserve-purpose); assessment.accrued-interest,
  .late-charges-due, .collection-costs; community.transfer-fee; assessment-payment-certificate (document);
  declarant-election set, community.declarant-election (derived) with .declarant-election-notice-on,
  .declarant-noticed-election, .declarant-prior-election, .fiscal-year-begins-on; community.declarant-deficit-payments,
  .association-expenditures, .other-units-assessments; title-transfer.working-capital-paid(-on),
  .reserve-contribution-paid(-on), .transfer-fee-paid(-on).
- Replaced terms: lot.owned-by-association and lot.owned-by-declarant became vocab's lot.owned-by (= organization; in
  declarant, affiliate), title-transfer.buyer-excluded became vocab's title-transfer.transferred-by / .transferred-to
  with .unit-improved, vote.class-b-member-disapproves became vote.disapproved-by, insured-party.association became
  insurance-policy.insured = organization, community.declarant-owns-property became vocab's declarantOwnsProperty;
  violation.fine-amount and community.late-charge gave way to amounts set-by-imposer, violation.days-delinquent(-base)
  to sanction after periods, violation.corrected-on to core violation.cured-on, and community.insurance-reviewed-on to
  core compliance-period.completed-on.
- Provisions follow part-arch's layout: sections with several paragraphs are headings with counted paragraphs; lettered
  points keep their first paragraph and count continuations from p2; inline lists inside one sentence ((i) and (ii) in
  7.2(c), (a) to (d) in 8.3/p2, (a) and (b) in 8.6/p1 and 8.8/p1, (a) to (c) in 8.8/p2) stay in their provision's text.
- 7.3(b) and 7.4(a) each have a second numbered list after a counted paragraph, so those items are children of the
  paragraph (7.3(b)/p4(i), 7.4(a)/p2(i)) to keep labels unique; 7.3(b)/p4(ii) and 7.4(a)/p2(ii) lost their numbers in
  the scan and are inferred.
- Lead-ins moved to intro: all of 7.3(a), 7.3(b)/p4 and 7.4(a)/p2, and the last sentence of 7.4(a) ("The following
  sanctions require prior notice ...") and of 7.4(c) ("Without limiting ... the Board may determine that ..."), whose
  earlier sentences stay in text.
- OCR repairs: dropped section dots and sentence periods, (1)/(n)/(in)/(m) to (i)/(ii)/(iii), "00v t4e violator" to
  "paid by the violator" and "notice fit in the Board" to "notice from the Board" in 7.4(a)(i), "self-helP:. 0. ,taking"
  to "self-help or taking", "(WY b9ngnig" to "(iii) bringing", "'op'iti" to "or its", "flied yi,ar 4which" to "fiscal
  year in which", "( 5%)" to "(.5%)", "Budget* ibrkeserves" to "Budgeting for Reserves" and "Article g AsSociatinn
  finances" to "Article 8 Association Finances"; the 7.4(a)(i) repairs are certain from context but worth a look against
  the recorded original.
- Text that looks incomplete in the scan is kept as scanned: 7.1(b) ends "minor adjustments in property", 7.3(a)(i)
  reads "full replacement cost all insurable improvements", 8.9/p2 reads "grant exemptions certain Persons".
- The Part Three introduction is part-arch's; the Part Four introduction falls in this range and is encoded here as
  part-four.
- Vote thresholds, consents and ratifications are requirements with no bearer: what a vote, a decision or a designation
  needs to take effect (6.3(a), 6.3(c), 8.8/p2's votes per Unit; 6.4(a)/p2, 6.4(a)/p3, 6.4(b), 7.2/p4, 7.2/p5,
  7.3(c)/p2, 8.1/p4, 8.2/p2, 8.2/p3, 8.4; and the two signatures on a reserve withdrawal in 8.3/p1).
- Consents of a single party are approval checks on their own requirement rules: the Class "B" Member's written
  agreement (7.2/p4#discontinue-class-b) and decision (7.3(c)/p2#not-restore-class-b), applying during the Class "B"
  Control Period, and the Declarant's prior written approval (7.2/p5) while it or an Affiliate owns Exhibit property;
  the Class "A" thresholds are separate requirements, so each consent reports its own finding.
- Vote thresholds use explicit bases: Class "A" thresholds (7.2/p4 67 percent, 7.3(c)/p2 75 percent, 8.1/p4 67 percent)
  divide by community.total-voting-power (all Class "A" votes, not votes cast); Neighborhood and Special Assessment
  thresholds divide by vote.eligible-votes (the Units in the Neighborhood or subject to the assessment); the 8.2/p2
  petition counts Owners, not Units.
- "A majority" is encoded as more than one half (> 1/2), and "at least 67%" as >= 67/100.
- "Ratified unless disapproved" is a requirement that's met when the budget stands: disapproving votes below 67 percent,
  or, during the Class "B" Control Period, the Class "B" Member not among vote.disapproved-by, since disapproval needs
  both; it isn't an approval check because the Class "B" Member's silence ratifies.
- "And the Class "B" Member, if any" is read as required only during the Class "B" Control Period, since the Class "B"
  membership ends with it (6.2(b)).
- "Ratification shall be effective whether or not a quorum is present" (8.1, 8.2, 8.4) should override the By-Laws
  quorum rule; the By-Laws are a referenced document with no rules yet, so the three ratification rules should gain that
  override when the By-Laws are loaded.
- 6.3(a)'s one vote per Unit, the exempt-property rule and 8.8/p2's no vote for Association-owned Units are requirements
  on lot.votes-cast in meeting requests, with the meeting feature supplying each Unit as an entity.
- 6.4(b) is encoded only as the limit on the number of Voting Groups; equal numbers of directors per Voting Group and
  separate slates are election mechanics the schema's computations open question covers.
- 7.2(c)'s enclosed area applies once the enclosing fence or wall (lot.landscaping-enclosure, a work) is approved by the
  Declarant or the DRC "as applicable": an approved condition with needs any, replacing the boolean
  lot.landscaping-enclosed.
- Continuing Association duties (maintenance, insurance coverage and policy terms, the annual insurance review, budgets,
  reserves, the reserve study, the Declarant's deficit funding, the transfer fee's reasonableness) are compliance-period
  rules recurring on community.fiscal-year-start, the only yearly schedule the Declaration names; the text sets no
  schedule for checking the continuing ones, so yearly is a judgment call.
- The annual insurance review and the Common Expense budget are deadlines on compliance-period.completed-on from the
  scheduled date (within a year; 60 days before), so a missed duty is found even with no record of it; Neighborhood
  budgets stay per budget entity, since one compliance period can't tell the Neighborhoods apart, and the five-year
  reserve study looks back from the scheduled date to community.reserve-study-on.
- Budget mailings measured from adoption (8.1/p4, 8.4, 8.1/p6, and 8.2/p3's after-adoption reading) run in the
  ratification meeting request, where the budget is an entity, since Special Assessments and revised budgets aren't on a
  schedule; 8.2/p3's readings measured from the fiscal year run in the yearly compliance period.
- Insurance coverage duties are compliance-period obligations on community, using community.insurance-policies with
  count or some; per-policy terms (7.3(b)(i) to (ix)) apply to each insurance-policy entity.
- "If reasonably available, or if not reasonably available, the most nearly equivalent coverages" (7.3(a)) is an
  obligation that displaces the five coverage rules when the Board has found some coverage not reasonably available
  (community.coverage-not-reasonably-available), with a judgment on every required coverage; it was a discretion rule,
  which no longer applies outside applications.
- "Shall use reasonable efforts to secure" (7.3(b)/p4) is encoded as recommendations on the Board: a duty of effort, not
  of result, so a missing term is advisory.
- 7.3(a)(iii) applies only "to the extent required by law", which is a text condition: the law isn't encoded.
- The general liability and D&O coverage rules also cite 7.6/p3, which requires the same insurance to fund
  indemnification.
- Sanction preconditions are four entries: violations need notice and a hearing if requested (7.4(a), 8.5(b), 8.5/p2,
  7.3(b)/p2, 4.8/p2, 4.8/p3, 11.1(iv)(B)), except the 7.4(a)/p2 actions, part-arch's 4.8/p5 suit and the 7.4(a)/p3
  sanctions; the 7.4(a)/p3 sanctions alone need notice with a cure-by date unless there's an emergency; assessment
  requests need notice (the new assessment.notice-delivered-on) for the 7.4(a)(ii) to (iv) delinquency suspensions; and
  a hearing only for part-property's after-hearing reading of 11.1(iv)(B). Collection sanctions (acceleration, interest,
  late charges, collection costs, liens, lien suits, 8.12) need neither.
- 7.4(b)'s recovery of enforcement costs is excepted from notice and a hearing, since it follows a suit, which
  7.4(a)/p2(iii) exempts; 8.12's conditioning facility use on paying use fees is excepted from the notice for
  suspensions, read as a condition of use rather than a 7.4(a)(iii) suspension.
- The 11.1(iv)(B) reading that a delinquent charge alone allows suspension (#delinquency-suspension) is excepted from
  the assessment notice too, so the interpretation question's two options stay distinct; 7.4(a)(iii)'s own delinquency
  suspension carries the notice either way.
- 8.5(b)'s hearing before any Specific Assessment for compliance costs could reach 7.4(a)/p3's maintenance assessments;
  7.4(a)/p3's own procedure (notice and a chance to cure, no hearing) is read as the specific one.
- 7.4(a)(ii) to (iv)'s delinquency exceptions are separate sanctions in assessment requests enforcing the payment rule,
  available after 90 days (Base Assessment, voting) or 30 days (any assessment, facilities and services) from
  assessment.due-on; their violation-request twins cover other Governing Document violations.
- Sanctions for "Governing Document violations" enforce the declaration, use-restrictions and guidelines documents and
  the referenced by-laws, articles and board-rules; towing enforces the use-restrictions and board-rules ("parking rules
  and regulations").
- Fines and Common Area, towing, suit and cost-recovery sanctions are against the owner, occupants, tenants and guests,
  since the fine is "first assessed against the violator"; the liability clauses make the Owner answer for them. For the
  fine, 7.4(a)(i) makes the Owner liable only if the violator hasn't paid by the time the Board set and the Board then
  gives the Owner notice: each of the occupant, guest and tenant entries excepts the fine, and a second entry per actor
  reaches only the fine with that appliesWhen (a tenant read as an occupant).
- 7.4(a)(vi) enforces part-arch's Article 4 rules that run in violations (4.1/p1#approval-required,
  4.3(b)/p7#complete-within-year and #diligent-pursuit, 4.3(b)/p8#landscaping-90-days), the set its 4.8 sanctions
  enforce; 7.4(a)(vii) enforces those and the guidelines document together, against the contractor.
- 7.4(a)/p3's maintenance self-help and Recorded notice of violation enforce part-arch's Article 5 rules (5.2/p1,
  5.2/p2, 5.4/p2, 5.4/p3) plus 7.2(c)#enclosed-area, and the Neighborhood Association variant enforces 5.3/p2 and
  5.4/p4, against the Neighborhood Association and the Owners whose Units are assessed.
- "Reasonable notice and an opportunity to cure" (7.4(a)/p3) states no number of days, so no default cure clause is set;
  7.2(c)#enclosed-area's cure ends on violation.cure-by, the time the notice sets, cured by violation.cured-on.
- Fines and the fine's lien are set-by-imposer: the Declaration leaves the amount to the Board's range of penalties
  (7.4(a)); the lien is an obligation since the fine "shall constitute a lien".
- LIABILITY: occupants, guests and tenants answer to the Owner (7.4(a)(i), 7.3(b)/p2, 8.5(b)); the merge must combine
  this liability list with part-arch's contractor-to-owner entry (4.8/p3), which 8.5(b) also supports.
- 7.4(c)'s enforcement discretion isn't a discretion rule: every sanction is already a permission the Board chooses
  whether to impose, and discretion applies only in applications.
- The 7.7/p3 duty of a Neighborhood Association is a deadline for violation.cured-on, measured from violation.cure-by,
  the time the Association's notice sets.
- The assessment payment rule (8.6/p2#due-date) runs on assessment.due-on for every assessment type, with a zero-day
  cure ending on the due date and cured by assessment.paid-on, so payment stops repeating interest; the Board-set dates
  and the first-day-of-fiscal-year default are how the assessment feature sets due-on.
- Interest runs from the due date (repeats.from assessment.due-on) at 1/120 of the unpaid balance per month, which is 10
  percent a year exactly but monthly rather than daily; a higher Board rate would be a new rule version.
- Acceleration on delinquency (8.6/p2) is an acceleration sanction with no amount of its own, and the Board's late
  charges (8.7(a)) are set-by-imposer.
- "Subject to the limitations of Washington law" on interest and late charges needs limit rules from the statute, which
  isn't loaded.
- The Declarant's deficit option (8.7(b)) is a permission exempting Units the Declarant or an Affiliate owns
  (lot.owned-by) from the payment rule during the Class "B" Control Period when community.declarant-election is
  fund-deficit, plus a yearly obligation to pay at least expenditures minus other Units' assessments; the deemed
  continuation of last year's election is a derived property (notice at least 60 days before the fiscal year changes
  it).
- The Declarant's subsidies (8.1/p3, 8.2/p6) are voluntary, so only their disclosure as a budget line item is a rule.
- The working capital contribution is 1/200 of the sales price (one-half percent), checked as at least that amount so
  cent rounding can't fail it; it and the reserve contribution run in the title-transfer core addition, on a transfer by
  the Declarant or an Affiliate of an improved Unit to a buyer other than the Declarant, an Affiliate, a grantee of
  Declarant's rights or a Mortgagee.
- 8.9's exemption is encoded as prohibitions on assessing exempt property and Association-owned Units (lot.owned-by =
  organization); 8.9/p2's optional 501(c) exemption is a permission over the payment rule once the Declarant or the
  Association has granted it (lot.assessment-exemption-granted-by), replacing a discretion rule that no longer applies
  in assessment requests.
- Judgments about the Association's own duties (maintaining the Area of Common Responsibility, continuous operation,
  nearest-equivalent insurance, the transfer fee approximating cost) are decided by the board, the only deciding body
  the schema has for them.

## Articles 9 to 13

- The vote thresholds and consents of 9.2, 10.6, 12.2/p2 and 12.3 are requirement rules on the vote (no bearer), with
  test checks for thresholds and approval checks for consents, replacing obligations on an invented bearer (members,
  organization) and the consent booleans vote.declarant-consents, vote.board-approves and vote.property-owner-consents.
- 9.2's owner consent is an approval by a new party, annexed-property-owner, written because the owner signs the
  Supplemental Declaration; a Declarant that owns the annexed property approves as declarant under #declarant-consent,
  so the feature has to state it as both when it is both.
- 10.6's Declarant approval is written but not prior, because "prior" in 10.6 modifies the notice; the prior notice
  itself has no fact to check and is presupposed by the approval.
- 12.2/p2's affected-Neighborhood vote uses vocab's vote.eligible-votes as its base instead of the old
  vote.votes-affected-neighborhoods, still read as the affected Neighborhoods' votes combined, not a majority in each
  one.
- 12.3 (a majority of the Owners of the assigned Units) is a requirement on the vote, counting one Owner per assigned
  Unit in vote.eligible-votes; the Association's permission to admit others needs that vote to take effect.
- 11.3(a)/p3 is an approval check on a utility-work category of core work (work.utility-installation), by the Declarant
  prior and written while it or an Affiliate owns property, then by the Board; the Board's consent is read as prior (it
  replaces the Declarant's in the same "without consent" prohibition) but not necessarily written. The written-consent
  document and utility-work.board-consents are gone.
- 11.3(a)/p3's exceptions for the Declarant and governmental entities aren't conditions on work.performed-by, since the
  rules bind an Owner and an unstated performer would make every Owner's utility work missing-information.
- The 10.3 permissions override with a selector: every rule under use-restrictions:a(x) and every Design Guidelines
  rule, but only on the sales facility or sign itself (an overriding rule counts only on subjects it applies to), which
  matches "in such number, of such size, and in such locations as Declarant deems appropriate" better than the single
  key use-restrictions:a(x)#article-4.
- The 10.3 selector leaves out Article 4: the Declarant's own Work is already exempt from review under 4.1
  (work.performed-by), and the Article 4 approval rule's subject is the Work rather than the exterior item, so an
  authorized Builder's sales facility or sign still needs the Reviewer's approval as encoded; a human should confirm
  that reading.
- 10.3's "Units owned or leased by Declarant, its Affiliates, or Builders authorized by Declarant" is lot.owned-by or
  lot.leased-by in [declarant, affiliate, authorized-builder], replacing lot.held-by-declarant; "while such Persons are
  selling Units" is the new many-valued party property community.selling-units containing that same holder, replacing
  community.declarant-selling-units.
- 10.3's signs cover advertising, identification and directional signs, so this part adds display-kind.identification
  and display-kind.directional to vocab's display-kind set.
- 10.3's permissions have bearer declarant, though they also cover its Affiliates and authorized Builders, whose holding
  of the Unit is in appliesWhen.
- 11.1(iv)(B)'s suspension for a single violation lasts { atMost: 30 calendar days } ("not to exceed"), and "a longer
  period in the case of any continuing violation" is until-cured.
- The violation suspensions enforce every governing document by key (declaration, use-restrictions, guidelines, and the
  referenced by-laws, articles and board-rules), resolving the old gap; their notice-and-hearing conditions moved to the
  organization's sanctionPreconditions (from 7.4), so they're no longer in each appliesWhen.
- The 11.1(iv)(B) delinquency sanctions enforce every declaration rule evaluated in an assessment request, which are the
  payment rules, rather than naming rule keys from the Article 8 part; 7.4(a)(iii) states the same suspension with its
  own hearing exception, so the Article 7 encoder's rule may make one of these a duplicate.
- The two 11.1(iv)(B) delinquency readings now differ only by key: the organization's sanctionPreconditions (part-assoc)
  give #delinquency-suspension-after-hearing an assessment notice (assessment.notice-delivered-on) and a hearing (the
  new assessment.hearing-requested-on and .hearing-held-on) and except #delinquency-suspension from both, replacing the
  text condition.
- Most of Articles 9 to 11 grant rights to the Declarant, the Association, golf course owners or utilities that override
  no rule an Owner request could test, so those provisions are not-evaluated with a note rather than permissions with
  nothing to exempt.
- The Association's right of entry (11.5) overrides no stated Owner rule, so it isn't a permission; its stated
  conditions (notice except in an emergency, reasonable hours) are obligations on the organization, evaluated in the
  violation whose inspection entered the Unit, with the entry as an entity.
- Entries and work by the Declarant and utility easement holders (10.9(b), 10.9(c), 11.3(a)/p2, 11.3(d)) have the same
  kind of conditions but no request type carries them, so they're not-evaluated.
- 10.11 is read as ending the Article 10 rights at the earlier of December 4, 2031 or a Recorded statement that sales
  have ceased (community.declarant-reserved-rights-in-force), though "shall not terminate until" could also be read as a
  minimum duration only.
- The 30 years in 10.11 run from the Declaration's Recording, taken as 2001-12-04 from its edition; the scan doesn't
  show the recording stamp.
- The vote requirements for 9.2, 10.6, 12.2 and 12.3 run in meeting requests on a vote entity, as the Declaration
  amendment example does, even where approval may come by written consent or Board action rather than at a meeting.
- 10.5 (no Recording of covenants without the Declarant's, later the Board's, written consent) would be a requirement
  with an approval check, but no request type carries a Recording by a Person other than the Association, so it stays
  not-evaluated, and vocab marks 1.3/p2 a duplicate of it.
- 12.1's cost allocation is an obligation on the Association evaluated in an assessment request: an assessment that
  charges Limited Common Area costs must fall on a Unit the area is assigned to.
- Article 13 has no requirement that an Owner get a neighbor's consent before altering a party structure; it only
  applies the general rules of law on party walls (13.1), so nothing about alteration is encoded.
- The party structure and shared utility line cost rules (13.2, 11.7/p2) run in violation requests, since any Owner may
  enforce the Declaration (1.2); a cost-sharing dispute could also go through Article 14's dispute resolution.
- Equal cost shares are checked as contribution times the number of Units sharing, at least the cost (less insurance for
  a casualty), using product with a count, since the schema's quotient divides only like dimensions.
- 13.2/p2's permission for any sharing Owner to restore a casualty-damaged party structure isn't encoded as overriding
  design review; restoring still needs whatever Article 4 approval applies.
- Party structure is defined in 13.1, but vocab.ts defines the party-structure term with no definedIn; 13.1 is cited as
  the second citation of the 13.2 rules instead.
- 11.6 and 11.7/p2's damage duties are judgments decided by the board on a property-damage entity, since "promptly" and
  "without cost to the other Owners" need judging.
- 11.7/p1 grants easements; a duty not to obstruct them is only implied, so no obstruction rule is encoded and the
  paragraph is covered by the 11.7/p2 maintenance rules, which cite it second.
- 11.2's encroachment easement isn't encoded because no rule prohibits encroachment for it to override; the encroachment
  terms in vocab.ts (encroachment, .distance, .willful) go unused here.
- 11.1, 11.1(iv) and 11.3(a) are lead-ins to their lettered items, so their words are the provision's intro and their
  text is empty.
- 11.1's closing paragraph is labeled 11.1/p2, treating the section's own lead-in as its first paragraph; likewise
  11.3(a)/p2, 11.3(a)/p3 and 11.8(a)/p2.
- OCR: 11.3(a)(iv) is printed in the scan as "a6pis.and read utility meters; and", read as "(iv) access and read utility
  meters; and" with its number inferred; 13.1's number is lost in the scan and inferred.
- OCR: 11.9 has an illegible word before "authorization" (scanned as "iip?"), kept as [illegible].
- Part Five's introduction (and Part Six's, which ends this range) are encoded here as explanatory paragraphs; Part
  Four's introduction precedes Article 9 and isn't in this range.

## Articles 14 to 21 and Exhibits A and B

- SCHEMA GAP: a unilateral Declarant amendment (20.1, 15.5) is no meeting, and amendments and terminations may be
  adopted by written consent without one, but no request type covers adopting an amendment, so all of them are a vote
  (vote.by declarant for the Declarant's own) in a meeting request, as the schema's Declaration amendment example does.
- SCHEMA GAP: an approval check names party terms, so 'the Owner' whose title or rights an amendment affects (20.1) and
  'all Owners and Mortgagees' (19.2) are approvals by owner and mortgagee that the feature records only once every
  affected one has consented; nothing in the check counts individual Owners.
- Disputes have no core request type, so dispute (with raised-on, notice-given-on, mediation-submitted-on,
  mediation-terminated-on, suit-filed-on and resolved-on) is a core addition, a filing request (governing date
  dispute.raised-on, lot optional, since most Claims concern no one Unit); the organization's Claim is a category of it
  whose criteria encode 14.3's scope and exemptions (a) to (g), and the parties' agreement that brings an exempt dispute
  back in.
- Who is a party to a dispute is the many-valued party property dispute.parties, so 14.3(e) (a suit between Owners
  without the Declarant, an Affiliate or the Association) is every party being owner, and 14.3(g) is some party being a
  governmental entity; both need the list stated complete.
- Bound Party, Claimant and Respondent are things of nature party rather than categories, because who is a Claimant
  can't be tested from properties.
- Termination of Negotiations is a derived property: the agreed end of negotiations when the Parties set one, otherwise
  30 days after the Notice.
- The mediation deadline counts the Claimant's 30 days from the Termination of Negotiations and deems the Claim waived
  when missed (14.4(b)(iii)); the other ground for waiver, failing to appear for and participate in good faith in the
  mediation, isn't encoded because the Declaration names no one to judge it.
- The mediator's duty to issue a Termination of Mediation after 30 days (14.4(b)(iv)) isn't a rule: the mediator isn't
  bound by the Declaration, so only its date is a fact (dispute.mediation-terminated-on).
- 14.2's promise to use the procedures 'in lieu of filing suit' is encoded as a rule that suit may be filed only on or
  after the Termination of Mediation, which also fails when the Claim was waived and mediation never happened.
- 14.5's cost and fee recovery isn't encoded; it's an award between the Parties that no request type evaluates.
- Every vote threshold and consent in 14.1, 15.5, 15.6, 19.1, 20.1 to 20.3 and Article 21 is a requirement on the vote
  (no bearer): the act doesn't take effect without it; 14.1's bar on the Association commencing a proceeding is the
  requirement on the vote that authorizes it, and its exempt proceedings are a permission exempting that vote.
- Consents of the Declarant, the Class "B" Member, King County, a Private Amenity owner and affected Owners are approval
  checks on those requirements, written where the text says written (20.1, 20.3 Declarant and Class "B", 15.5, 15.6,
  19.1/p1's written direction), prior only where it says prior (15.6), so a consent given after the vote still counts.
- Declarant consent 'so long as Declarant or any Affiliate owns property in Exhibit A or B' is a separate requirement
  applying while vocab's declarantOwnsProperty holds (community.exhibit-property-owned-by), in 19.1, 20.2 and
  Article 21.
- The Declarant's unilateral amendment powers (20.1/p1 before the first sale, 20.1/p1 for required purposes, 20.1/p2
  while it owns property) are permissions on a vote by the Declarant with an overrides selector of every rule under
  20.2, so they exempt the Members' thresholds and the Declarant's own consent, including any 20.2 rule added later, but
  not 14.1's own amendment vote, 15.5 (overridden by its own Declarant permission) or the consents in 20.3.
- vote.by must be stated on every amendment vote, since it's unknown when unstated: a Members' vote with no vote.by
  leaves the Declarant permissions' applicability unknown and the 20.2 requirements missing-information.
- 20.1/p2's proviso (no material adverse effect on an Owner's right unless the Owner consents in writing) is a
  requirement of its own, applying only to Declarant amendments that don't rest on 20.1/p1's grounds, rather than a
  condition inside the permission.
- 20.3's consent of the Class "B" Member 'or the assignee of such right or privilege' is one approval check with needs
  any over class-b-member and a new class-b-rights-assignee party, written for both; the parenthetical is read as
  reaching only the Class "B" Member's rights, so the Declarant's consent stays its own.
- Article 21's Mortgagee consent is a share weighted by votes (first Mortgagees of Units holding 67% of the votes),
  which neither an approval check nor an approved condition can weigh (needs is only all or any), so it stays a
  requirement comparing vote.mortgagee-approved-votes, which counts 16.4's deemed approvals, against an explicit base.
- Each vote threshold uses an explicit base: community.total-voting-power (the Class "A" votes) for '67% of the
  Association's Class "A" votes', and community.non-declarant-votes for '67% of the Class "A" votes held by Members
  other than Declarant'; no rule here counts votes cast.
- 15.6's bar on Use Restrictions affecting a Private Amenity is a requirement with the owner's prior written approval on
  any vote that adopts them (vote.restricts-private-amenity-use), whoever votes: the Board under 3.3(a) or the Members
  under 3.3(b).
- 19.2's partition bar is an obligation on the claimant in a dispute of kind partition, with an approval check by owner
  and mortgagee, prior and written; the Board's power to acquire and dispose of property overrides nothing.
- 20.3/p3's six-month window for procedural challenges is a requirement on the challenge (a dispute of kind
  amendment-challenge) rather than a duty, deeming the amendment presumed valid when missed.
- 20.2/p2 (a clause can't be amended by less than the percentage it requires for action) is a requirement comparing the
  share of all Class "A" votes in favor with the clause's percentage as a fact; if a clause counts its percentage
  against votes cast, the comparison overstates what's needed.
- 20.2's 'approval requirements set forth in Article 16' has nothing to point to: this Article 16 sets no Mortgagee
  approval percentage, only notice (16.1(d)) and deemed approval (16.4).
- Section 14.1's own amendment clause is encoded separately (14.1#amendment-vote) and isn't overridden by the
  Declarant's unilateral amendment rights, reading the specific limit as controlling.
- Article 21's 'subject to the terms and conditions of the UPD Permit' and the Board's duty to Record a signed
  Certificate of Termination aren't encoded: the first has no testable content here and the second has no request type.
- 16.1's 'timely written notice' has no period, so the delinquency, violation and consent notices are judgments decided
  by the board; (a) casualty or condemnation losses and (c) insurance lapses are not-evaluated, since no request type
  covers those events.
- 16.1(b) uses facts the ledger and enforcement features supply (assessment.delinquent-60-days,
  violation.uncured-60-days), because a condition can't read the evaluation date to count 60 days.
- 16.4's deemed approval is a deadline on the Mortgagee, evaluated in a meeting on a mortgagee-consent-request, deeming
  it approved when no written response arrives within 30 days of a request sent by certified or registered mail.
- Article 18's notice duty excludes transfers by the Declarant or an Affiliate through the party-valued
  title-transfer.transferred-by (not in declarant, affiliate), which the feature must state; the transferee's 7-day
  confirmation binds the new owner, so its bearer is owner.
- Article 18's joint and several liability is a liability clause from owner to a new transferor party, ending on
  lot.transfer-notice-received-on (the latest transfer's notice date, carried on the Unit because the sanction's request
  is a violation or assessment, not the title-transfer) and excepting no sanction, since it reaches all obligations of
  the Owner.
- A transfer by the Declarant or an Affiliate needs no Article 18 notice, so read literally the clause never ends for
  such a transferor; whether 'such notice' limits the joint liability to transfers that need one is worth confirming.
- 19.1/p1's right of every Owner to written notice of a taking before an award is disbursed, and 19.1/p2's duty to
  restore improvements under Board-approved plans, aren't encoded: no request type covers a condemnation.
- 19.3's conveyance deadline and 11.5-acre park run in a compliance-period request without recurs, since neither recurs
  on a schedule; acre is added as an organization unit (43,560 square feet) and belongs in the core units.
- 15.4's access and parking easement for the Private Amenity is encoded as easement-type.private-amenity-access; its
  right to park on roads overrides nothing, because the Use Restrictions' parking rule
  (use-restrictions:a(i)#restricted-vehicles) covers only commercial, recreational and similar vehicles and binds
  occupants.
- Article 17's disclosures are explanatory, except the covenants with a duty in them (17.1 not to object to Master Plan
  changes, 17.2 to inform tenants, 15.3 and 17.5 to indemnify), which are not-evaluated.
- The lead-ins of 14.4(a) and 16.1 are their provisions' intro, with empty text; 14.3/p2, 17.6/p1 and 19.1/p1 also end
  in lead-ins, but their items are children of the section rather than of the paragraph, so they keep their text and the
  items keep their keys.
- No sanctions, recurring duties or discretion rules come from Articles 14 to 21 and Exhibits A and B; the one settings
  clause is Article 18's liability.
- The Bodies of Water (17.6) are a term so the Use Restrictions' rules on ponds and wetlands can refer to them.
- Sections with paragraphs that say different things (14.3, 15.2, 15.3, 17.2, 17.3, 17.6, 19.1, 19.3, 20.1, 20.2, 20.3)
  are split into counted paragraphs with the section marked heading; lettered items set on their own lines are points
  under the section (14.3(a), 17.6(a)), while lettered lists run into a sentence (14.1, 15.2/p2, 15.3/p1, 17.1, 20.1/p1)
  stay in their paragraph's text.
- Articles 18 and 21 have no sections, so each article carries its whole text and is cited by its rules.
- The Part Seven introduction falls in Article 17's line range, so it's encoded here as part-seven, like vocab's
  part-one and part-two.
- The execution clause is kept as one explanatory paragraph (execution); the signature blocks and notarial
  acknowledgments, which name individuals, are left out.
- OCR repairs that rest on the standard form and the surrounding text: 'the legal basis of the Claim' in 14.4(a)(ii)
  (the word Claim is missing in the scan), 'any suit or dispute' in 14.3(g), 'strict liability) to any Owner' in 17.5,
  'Article 21' for 'Article 211', and 'EP-1' and 'PB-4' in Exhibit A.
- The recording volume and page numbers in Exhibits A and B are illegible in the scan and are shown as [illegible]
  rather than guessed.
