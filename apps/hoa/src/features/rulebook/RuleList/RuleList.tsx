import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { RuleLine } from "../rulebookView"

export type RuleListProps = {
  rules: RuleLine[]
  /** Shows each rule's review status, for a draft. */
  showStatus?: boolean
}

const statusLabels: Record<string, string> = { proposed: "To review", approved: "Approved", rejected: "Rejected" }

/** A rulebook's rules: title, statement and key, until the rules UX's table replaces it. */
export function RuleList({ rules, showStatus = false }: RuleListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rule</TableHead>
          <TableHead className="hidden md:table-cell">Key</TableHead>
          {showStatus ? <TableHead>Status</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.key}>
            <TableCell className="whitespace-normal">
              <div className="font-medium">{rule.title}</div>
              <div className="text-sm text-muted-foreground">{rule.statement}</div>
            </TableCell>
            <TableCell className="hidden align-top font-mono text-xs md:table-cell">{rule.key}</TableCell>
            {showStatus ? (
              <TableCell className="align-top">
                <Badge variant="outline">{statusLabels[rule.status] ?? rule.status}</Badge>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
