import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const folder = path.resolve(".test-build");
await mkdir(folder, { recursive: true });
const filename = path.join(folder, "schema-fixture.cjs");
try {
  await build({ entryPoints: ["tests/database.ts"], outfile: filename, bundle: true, platform: "node", format: "cjs", packages: "external" });
  const { schemaStatements, client } = createRequire(import.meta.url)(filename);
  await writeFile("tests/backup-fixture.sql", "-- Generated from src/db/schema.ts; synthetic testing only.\n" + schemaStatements().join(";\n") + ";\n");
  await client.close();
} finally {
  await rm(filename, { force: true });
}
