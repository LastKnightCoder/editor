import { mkdtemp, mkdir, writeFile, realpath, symlink } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { build } from "vite";
import react from "@vitejs/plugin-react-swc";

if (process.env.TAU_QUERY_STRESS !== "1")
  throw new Error("请显式设置 TAU_QUERY_STRESS=1，仅对隔离副本执行");
if (!process.env.TAU_QUERY_STRESS_COPY)
  throw new Error("TAU_QUERY_STRESS_COPY 需要指向包含 data.db 的隔离副本目录");
const baseline = await realpath(process.env.TAU_QUERY_STRESS_COPY);
const original = resolve(homedir(), ".editor");
if (baseline === original || baseline.startsWith(original + sep))
  throw new Error("拒绝在原资料库目录内执行变更测试");
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktop, "../..");
const scratch = await mkdtemp(join(tmpdir(), "tau-query-stress-run-"));
const copy = join(scratch, "workspace");
await mkdir(join(copy, "index/data"), { recursive: true });
const Sqlite = createRequire(join(root, "apps/collaboration-server/package.json"))(
  "better-sqlite3"
);
for (const name of ["data.db", "index/data/data.index.db"]) {
  const source = new Sqlite(join(baseline, name), { readonly: true, fileMustExist: true });
  try {
    await source.backup(join(copy, name));
  } finally {
    source.close();
  }
}
await mkdir(join(scratch, "profile"), { recursive: true });
await symlink(join(desktop, "node_modules"), join(scratch, "node_modules"), "dir");
const alias = {
  "@": join(desktop, "src"),
  "@tau/shared": join(root, "packages/shared"),
  "@tau/db-schema": join(root, "packages/db-schema"),
  "@tau/rpc": join(root, "packages/rpc"),
};
await writeFile(
  join(scratch, "index.html"),
  '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/entry.tsx"></script></body></html>'
);
await writeFile(
  join(scratch, "entry.tsx"),
  `import ${JSON.stringify(join(desktop, "scripts/query-database/fixture-renderer.tsx"))};`
);
await build({
  configFile: false,
  root: scratch,
  base: "./",
  logLevel: "error",
  resolve: { alias, dedupe: ["react", "react-dom"] },
  plugins: [react()],
  build: { outDir: "renderer", emptyOutDir: true },
});
const native = [
  "electron",
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  "@node-rs/jieba",
  "@silvia-odwyer/photon-node",
  "@vscode/ripgrep",
  "node-llama-cpp",
  "@firecrawl/anydoc",
  "@tailwindcss/oxide",
  "tailwindcss",
  "turndown",
  "7zip-min",
  "electron-updater",
  "font-list",
  "ws",
];
const external = id => native.some(name => id === name || id.startsWith(name + "/"));
await build({
  configFile: false,
  logLevel: "error",
  resolve: { alias },
  ssr: { noExternal: true, external: native },
  build: {
    ssr: join(desktop, "scripts/query-database/fixture-main.ts"),
    outDir: join(scratch, "native"),
    emptyOutDir: true,
    rolldownOptions: { external, output: { format: "cjs", entryFileNames: "main.cjs" } },
  },
});
const logFile = join(scratch, "diagnostics.log");
const chunks = [];
let report;
const executable = createRequire(import.meta.url)("electron");
const code = await new Promise((resolveRun, reject) => {
  const child = spawn(executable, [join(scratch, "native/main.cjs")], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TAU_QUERY_STRESS_COPY: copy,
      TAU_QUERY_STRESS_RUN: scratch,
      TAU_QUERY_DESKTOP_ROOT: desktop,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
    timeout: 310_000,
  });
  let output = "";
  let pendingOutput = "";
  child.stdout.on("data", data => {
    const text = String(data);
    output += text;
    chunks.push(text);
    pendingOutput += text;
    const lines = pendingOutput.split("\n");
    pendingOutput = lines.pop() ?? "";
    for (const line of lines) if (line.startsWith("QUERY_CASE:")) console.log(line);
  });
  child.stderr.on("data", data => chunks.push(String(data)));
  child.once("error", reject);
  child.once("exit", code => {
    for (const line of output.split("\n"))
      if (line.startsWith("QUERY_STRESS:")) report = JSON.parse(line.slice(13));
    resolveRun(code);
  });
});
await writeFile(logFile, chunks.join(""), { mode: 0o600 });
if (!report) {
  console.error(JSON.stringify({ failed: true, phase: "native-bootstrap", diagnostics: logFile }));
  process.exitCode = 1;
} else {
  const reportFile = process.env.TAU_QUERY_STRESS_REPORT ?? join(scratch, "report.json");
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile, diagnostics: logFile }));
  process.exitCode = code === 0 ? 0 : 1;
}
