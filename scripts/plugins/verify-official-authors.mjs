import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdk = path.resolve(process.argv[2]);
const ui = path.resolve(process.argv[3]);
const reportPath = path.resolve(
  process.argv[4] ?? path.join(root, "output/author-contract/authors.json")
);
const directory = await mkdtemp(path.join(tmpdir(), "tau-official-authors-"));
const sources = execFileSync("git", ["config", "--file", ".gitmodules", "--get-regexp", "path"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .map(line => line.slice(line.indexOf(" ") + 1));
const results = [];
await mkdir(path.dirname(reportPath), { recursive: true });

async function run(cwd, command, args, log) {
  const result = await new Promise((resolve, reject) => {
    const env = { ...process.env, pnpm_config_verify_deps_before_run: "warn" };
    delete env.NODE_PATH;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", value => {
      output += value;
    });
    child.stderr.on("data", value => {
      output += value;
    });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output }));
  });
  await writeFile(log, result.output);
  if (result.code) throw new Error(`${command} ${args.join(" ")} 失败，见 ${log}`);
}

async function verify(source) {
  const name = path.basename(source);
  const author = path.join(directory, name);
  const logs = path.join(path.dirname(reportPath), "logs", name);
  const result = { name, author, status: "running", tests: "not-run" };
  try {
    await mkdir(logs, { recursive: true });
    await cp(path.join(root, source), author, {
      recursive: true,
      filter: value => !["node_modules", ".git", "dist", ".sdk"].includes(path.basename(value)),
    });
    await cp(
      path.join(root, "plugins/tau-plugin-template/use-local-sdk.mjs"),
      path.join(author, "use-local-sdk.mjs")
    );
    await run(author, process.execPath, ["use-local-sdk.mjs", sdk, ui], path.join(logs, "sdk.log"));
    await run(
      author,
      "pnpm",
      ["install", "--no-frozen-lockfile", "--ignore-scripts", "--prefer-offline"],
      path.join(logs, "install.log")
    );
    await run(
      author,
      "pnpm",
      ["install", "--frozen-lockfile", "--ignore-scripts"],
      path.join(logs, "frozen.log")
    );
    await run(author, "pnpm", ["build"], path.join(logs, "build.log"));
    const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
    if (pkg.scripts?.test) {
      await run(author, "pnpm", ["test"], path.join(logs, "test.log"));
      result.tests = "passed";
    } else result.tests = "not-defined";
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error);
  }
  results.push(result);
  await writeFile(reportPath, JSON.stringify({ directory, sdk, ui, results }, null, 2));
  console.log(`${name}: ${result.status}${result.error ? ` ${result.error}` : ""}`);
}

const queue = [...sources];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let source = queue.shift(); source; source = queue.shift()) await verify(source);
  })
);
if (results.some(result => result.status !== "passed")) process.exitCode = 1;
