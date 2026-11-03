import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is, SQL } from "drizzle-orm";
import { PgTable, PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";

export const client = new PGlite();
export const queries: string[] = [];
export const db = drizzle(client, { logger: { logQuery(query: string) { queries.push(query); } } });

export function schemaStatements() {
  const statements: string[] = [];
  const dialect = new PgDialect();
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const tables = Object.values(schema).filter((value) => is(value, PgTable));
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      let definition = `${quote(column.name)} ${column.getSQLType()}`;
      if (column.primary) definition += " PRIMARY KEY";
      if (column.isUnique) definition += " UNIQUE";
      if (column.notNull) definition += " NOT NULL";
      if (column.default !== undefined) {
        const value = column.default;
        const expression = is(value, SQL) ? dialect.sqlToQuery(value).sql :
          typeof value === "string" ? "'" + value.replaceAll("'", "''") + "'" : String(value);
        definition += ` DEFAULT ${expression}`;
      }
      return definition;
    });
    statements.push(`CREATE TABLE ${quote(config.name)} (${columns.join(", ")})`);
  }
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const foreignKey of config.foreignKeys) {
      const reference = foreignKey.reference();
      statements.push(`ALTER TABLE ${quote(config.name)} ADD FOREIGN KEY (${reference.columns.map((c) => quote(c.name)).join(", ")}) REFERENCES ${quote(getTableConfig(reference.foreignTable).name)} (${reference.foreignColumns.map((c) => quote(c.name)).join(", ")})`);
    }
  }
  return statements;
}

export async function createTestSchema() {
  for (const statement of schemaStatements()) await client.exec(statement);
}
