import { CheckIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RulebookRecords } from "@/rulebook/assemble"
import { ChangesTab, type DraftChanges } from "../ChangesTab/ChangesTab"
import { CoverageTab } from "../CoverageTab/CoverageTab"
import { QuestionsTab } from "../QuestionsTab/QuestionsTab"
import { RuleCard } from "../RuleCard/RuleCard"
import { reviewLabels } from "../ruleLabels"
import { RuleTable } from "../RuleTable/RuleTable"
import { SettingsTab } from "../SettingsTab/SettingsTab"
import { RulebookWorkspaceContext, type RulebookActions, type RulebookSource } from "../useRulebookWorkspace"
import { VocabularyTab } from "../VocabularyTab/VocabularyTab"
import { tabWork, workspaceOf, workspaceTabs, type WorkspaceTab, type WorkspaceView } from "./RulebookWorkspace.utils"

export type RulebookWorkspaceProps = {
  records: RulebookRecords
  /** The uploads with pages, for showing citations on their pages. */
  source: RulebookSource
  /** What an administrator can do to a draft; null shows the rulebook read-only. */
  actions: RulebookActions | null
  /** Who's reading: a homeowner sees the rules and their terms, not coverage, questions or settings. */
  audience: "administrator" | "member"
  /** A draft's differences from the published rulebook; null when there's nothing to compare. */
  changes?: DraftChanges | null
  /** The tab and filter shown, when the page leads to them (a to-do item); the workspace keeps its own otherwise. */
  view?: WorkspaceView
  onViewChange?: (view: WorkspaceView) => void
}

const labels: Record<WorkspaceTab, string> = {
  changes: "Changes",
  rules: "Rules",
  terms: "Terms",
  coverage: "Coverage",
  questions: "Questions",
  settings: "Settings"
}

/**
 * A rulebook's records in quiet tabs (encoding.md, UX): what a draft changes, rules, terms, coverage, questions and
 * settings, as the reader needs them; a rule's card opens in a side sheet from every rule link. In a draft each tab
 * says how much it has left to decide, so the tabs are the review's to-do list.
 */
export function RulebookWorkspace({
  records,
  source,
  actions,
  audience,
  changes = null,
  view,
  onViewChange
}: RulebookWorkspaceProps) {
  const tabs = workspaceTabs(records, { audience, hasChanges: changes !== null })
  const [ownView, setOwnView] = useState<WorkspaceView>({ tab: tabs[0] ?? "rules", filter: null, request: 0 })
  const shown = view ?? ownView
  const tab = tabs.includes(shown.tab) ? shown.tab : (tabs[0] ?? "rules")
  const setView = (next: WorkspaceView) => {
    setOwnView(next)
    onViewChange?.(next)
  }
  const [openKey, setOpenKey] = useState<string | null>(null)
  const workspace = workspaceOf(records, { source, actions, openRule: setOpenKey, audience })
  const work = actions ? tabWork(records, workspace.coverage) : null
  const open = records.rules.find((rule) => rule.key === openKey)
  // A to-do link sets a filter; each request starts the tab afresh with it.
  const filterFor = (item: WorkspaceTab) => (item === tab ? shown.filter : null)

  return (
    <RulebookWorkspaceContext.Provider value={workspace}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = tabs.find((item) => item === value)
          if (next) {
            setView({ tab: next, filter: null, request: shown.request + 1 })
          }
        }}
        className="gap-4"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <TabsList variant="line" aria-label="Rulebook">
            {tabs.map((item) => (
              <TabsTrigger key={item} value={item}>
                {labels[item]}
                {work && item !== "changes" ? <TabLeft tab={item} count={work[item]} /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {changes ? (
          <TabsContent value="changes">
            <ChangesTab changes={changes} />
          </TabsContent>
        ) : null}
        <TabsContent value="rules">
          <RuleTable key={`rules-${shown.request}`} initialStatus={filterFor("rules")} />
        </TabsContent>
        <TabsContent value="terms">
          <VocabularyTab key={`terms-${shown.request}`} />
        </TabsContent>
        {tabs.includes("coverage") ? (
          <TabsContent value="coverage">
            <CoverageTab key={`coverage-${shown.request}`} initialFilter={filterFor("coverage")} />
          </TabsContent>
        ) : null}
        {tabs.includes("questions") ? (
          <TabsContent value="questions">
            <QuestionsTab />
          </TabsContent>
        ) : null}
        {/* Kept mounted, so a settings draft survives a look at another tab. */}
        {tabs.includes("settings") ? (
          <TabsContent value="settings" keepMounted>
            <SettingsTab />
          </TabsContent>
        ) : null}
      </Tabs>
      <Sheet open={open !== undefined} onOpenChange={(isOpen) => (isOpen ? undefined : setOpenKey(null))}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {open ? (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle className="leading-snug">{open.title}</SheetTitle>
                {actions ? (
                  <SheetDescription>{reviewLabels[open.review.status]}</SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">A rule of the published rulebook</SheetDescription>
                )}
              </SheetHeader>
              <div className="px-4 pb-6">
                <RuleCard key={open.key} rule={open} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </RulebookWorkspaceContext.Provider>
  )
}

/** How much a tab has left to decide: a count, a dot for the settings (one record), or a check once it's done. */
function TabLeft({ tab, count }: { tab: WorkspaceTab; count: number }) {
  if (count === 0) {
    return <CheckIcon aria-hidden className="size-3.5 text-muted-foreground" />
  }
  if (tab === "settings") {
    return (
      <>
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        <span className="sr-only">to review</span>
      </>
    )
  }
  return (
    <Badge variant="secondary" className="h-4.5 px-1.5 tabular-nums">
      {count}
    </Badge>
  )
}
