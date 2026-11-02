import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(".test-build");
await mkdir(output, { recursive: true });
try {
  await build({
    entryPoints: ["tests/run.ts"], outfile: path.join(output, "tests.cjs"),
    bundle: true, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "isolated-test-database", setup(build) {
      build.onResolve({ filter: /^@\/db$/ }, () => ({ path: path.resolve("tests/database.ts") }));
    } }],
  });
  const result = spawnSync(process.execPath, ["--test", path.join(output, "tests.cjs")], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(output, { recursive: true, force: true });
}
