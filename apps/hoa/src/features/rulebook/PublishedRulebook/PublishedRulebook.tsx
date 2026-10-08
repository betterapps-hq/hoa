import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCitation, ruleKindLabels, type Rulebook } from "@/rules/rules"

export type PublishedRulebookProps = {
  rulebook: Rulebook
}

export function PublishedRulebook({ rulebook }: PublishedRulebookProps) {
  const publishedOn = new Date(rulebook.publishedAt).toLocaleDateString("en-US", { dateStyle: "long" })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{rulebook.hoaName} rulebook</h2>
        </CardTitle>
        <CardDescription>
          {rulebook.rules.length} rules, published {publishedOn} from {rulebook.documents.join(", ")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulebook.rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium whitespace-normal">{rule.title}</TableCell>
                  <TableCell className="min-w-64 whitespace-normal">{rule.requirement}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="px-1.5 text-muted-foreground">
                      {ruleKindLabels[rule.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatCitation(rule.source)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
