import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RulebookRecords } from "@/rulebook/assemble"
import { CoverageTab } from "../CoverageTab/CoverageTab"
import { QuestionsTab } from "../QuestionsTab/QuestionsTab"
import { citationLabel } from "../rulebookRecords"
import { RuleCard } from "../RuleCard/RuleCard"
import { RuleTable } from "../RuleTable/RuleTable"
import { SettingsTab } from "../SettingsTab/SettingsTab"
import { RulebookWorkspaceContext, type RulebookActions, type RulebookSource } from "../useRulebookWorkspace"
import { VocabularyTab } from "../VocabularyTab/VocabularyTab"
import { workspaceOf, workToDo } from "./RulebookWorkspace.utils"

export type RulebookWorkspaceProps = {
  records: RulebookRecords
  /** The uploads with pages, for showing citations on their pages. */
  source: RulebookSource
  /** What an administrator can do; null shows the rulebook read-only. */
  actions: RulebookActions | null
}

const tabs = ["rules", "vocabulary", "coverage", "questions", "settings"] as const
type Tab = (typeof tabs)[number]

/**
 * A rulebook's records in tabs (encoding.md, UX): rules, vocabulary, coverage, questions and settings, with a rule's
 * card in a side sheet that every rule link opens.
 */
export function RulebookWorkspace({ records, source, actions }: RulebookWorkspaceProps) {
  const [tab, setTab] = useState<Tab>("rules")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const workspace = workspaceOf(records, { source, actions, openRule: setOpenKey })
  const open = records.rules.find((rule) => rule.key === openKey)
  const counts = workToDo(workspace)
  const labels: Record<Tab, string> = {
    rules: "Rules",
    vocabulary: "Vocabulary",
    coverage: "Coverage",
    questions: "Questions",
    settings: "Settings"
  }

  return (
    <RulebookWorkspaceContext.Provider value={workspace}>
      <Tabs value={tab} onValueChange={(value) => setTab(tabs.find((item) => item === value) ?? "rules")}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList aria-label="Rulebook">
            {tabs.map((item) => (
              <TabsTrigger key={item} value={item}>
                {labels[item]}
                {counts[item] > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                    {counts[item]}
                    <span className="sr-only"> to do</span>
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="rules">
          <RuleTable />
        </TabsContent>
        <TabsContent value="vocabulary">
          <VocabularyTab />
        </TabsContent>
        <TabsContent value="coverage">
          <CoverageTab />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
      <Sheet open={open !== undefined} onOpenChange={(isOpen) => (isOpen ? undefined : setOpenKey(null))}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{open.title}</SheetTitle>
                <SheetDescription>
                  {open.citations[0] ? citationLabel(open.citations[0].provisionKey) : "No citation"}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <RuleCard key={open.key} rule={open} onDeleted={() => setOpenKey(null)} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </RulebookWorkspaceContext.Provider>
  )
}
