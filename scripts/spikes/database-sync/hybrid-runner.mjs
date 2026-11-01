import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = new URL("./", import.meta.url);
const require = createRequire(
  new URL("../../../apps/collaboration-server/package.json", import.meta.url)
);
const mode = process.argv[2] ?? "test";
if (!["test", "all", "demo"].includes(mode))
  throw new Error("用法：hybrid-runner.mjs test|all|demo");
const loader = pathToFileURL(require.resolve("tsx")).href;
const files =
  mode === "all"
    ? readdirSync(directory).filter(name => name.endsWith(".test.mjs"))
    : [mode === "demo" ? "verify-hybrid.mjs" : "hybrid.test.mjs"];
const result = spawnSync(
  process.execPath,
  [
    "--import",
    loader,
    ...(mode === "demo" ? [] : ["--test"]),
    ...files.map(name => fileURLToPath(new URL(name, directory))),
  ],
  { stdio: "inherit", cwd: fileURLToPath(new URL("../../../", import.meta.url)), env: process.env }
);
process.exit(result.status ?? 1);
