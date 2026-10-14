import type { Holds, Reference } from "./extract.ts"

// The tables as tbls's schema JSON (github.com/k1LoW/tbls), the format Liam ERD reads. Liam draws a line only for a
// FOREIGN KEY constraint, so every link is one here; those D1 doesn't check are named *_by_name, and their column's
// comment says so. They're also tbls's virtual relations, for other tbls readers.

export type ErdColumn = {
  name: string
  type: string
  holds: Holds | null
  notNull: boolean
  default: string | null
  description: string | null
  references: Reference | null
}

export type ErdIndex = { name: string; columns: readonly string[]; unique: boolean; where: string | null }

export type ErdTable = {
  name: string
  description: string | null
  columns: readonly ErdColumn[]
  primaryKey: readonly string[]
  indexes: readonly ErdIndex[]
}

const commentOf = (column: ErdColumn) => {
  const reference = column.references
  const byName =
    reference && !reference.enforced
      ? `Points at ${reference.table}.${reference.column} by its name only: D1 doesn't check it.`
      : null
  return [column.description, byName].filter(Boolean).join(" ")
}

export function toTbls(tables: readonly ErdTable[], migration: string) {
  const linked = tables.flatMap((table) =>
    table.columns.flatMap((column) => (column.references ? [{ table, column, reference: column.references }] : []))
  )
  return {
    name: "hoa",
    desc: `The D1 tables as of migration ${migration}.`,
    tables: tables.map((table) => ({
      name: table.name,
      type: "table",
      comment: table.description ?? "",
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.holds ? `${column.type} (${column.holds})` : column.type,
        nullable: !column.notNull,
        default: column.default,
        comment: commentOf(column)
      })),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        def: `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${index.name} ON ${table.name} (${index.columns.join(", ")})${index.where ? ` WHERE ${index.where}` : ""}`,
        table: table.name,
        columns: index.columns,
        comment: ""
      })),
      constraints: [
        {
          name: `${table.name}_pk`,
          type: "PRIMARY KEY",
          def: `PRIMARY KEY (${table.primaryKey.join(", ")})`,
          table: table.name,
          referenced_table: "",
          columns: table.primaryKey,
          referenced_columns: []
        },
        ...linked
          .filter((link) => link.table === table)
          .map(({ column, reference }) => ({
            name: `${table.name}_${column.name}_${reference.enforced ? "fk" : "by_name"}`,
            type: "FOREIGN KEY",
            def: `FOREIGN KEY (${column.name}) REFERENCES ${reference.table} (${reference.column})${reference.onDelete ? ` ON DELETE ${reference.onDelete.toUpperCase()}` : ""}`,
            table: table.name,
            referenced_table: reference.table,
            columns: [column.name],
            referenced_columns: [reference.column]
          }))
      ],
      triggers: [],
      def: ""
    })),
    relations: linked.map(({ table, column, reference }) => ({
      table: table.name,
      columns: [column.name],
      cardinality: "zero_or_more",
      parent_table: reference.table,
      parent_columns: [reference.column],
      parent_cardinality: column.notNull ? "exactly_one" : "zero_or_one",
      def: `${table.name}.${column.name} -> ${reference.table}.${reference.column}`,
      virtual: !reference.enforced
    })),
    driver: { name: "sqlite", database_version: "3" }
  }
}
