import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const published = process.argv[2] === "--published";
if (!published && (!process.argv[2] || !process.argv[3]))
  throw new Error(
    "用法：verify-official-authors.mjs <SDK.tgz> <UI.tgz> [报告]，或 --published [报告]"
  );
const sdk = published ? undefined : path.resolve(process.argv[2]);
const ui = published ? undefined : path.resolve(process.argv[3]);
const sdkVersion = JSON.parse(
  await readFile(path.join(root, "packages/plugins/package.json"), "utf8")
).version;
const reportPath = path.resolve(
  (published ? process.argv[3] : process.argv[4]) ??
    path.join(root, "output/author-contract/authors.json")
);
const directory = await mkdtemp(path.join(tmpdir(), "tau-official-authors-"));
const store = path.join(directory, "store");
const sources = execFileSync("git", ["config", "--file", ".gitmodules", "--get-regexp", "path"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .map(line => line.slice(line.indexOf(" ") + 1));
const results = [];
let reportWrite = Promise.resolve();
await mkdir(path.dirname(reportPath), { recursive: true });

async function run(cwd, command, args, log) {
  const result = await new Promise((resolve, reject) => {
    const env = { ...process.env, pnpm_config_verify_deps_before_run: "warn" };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
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
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")} 失败，见 ${log}`);
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
    if (published) {
      const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
      const dependency =
        pkg.dependencies?.["@tau/plugins"] ?? pkg.devDependencies?.["@tau/plugins"];
      if (dependency !== `npm:@xiongtao.xt/tau-plugins@${sdkVersion}`)
        throw new Error("正式验证要求固定 npm SDK 依赖");
    } else {
      await cp(
        path.join(root, "plugins/tau-plugin-template/use-local-sdk.mjs"),
        path.join(author, "use-local-sdk.mjs")
      );
      await run(
        author,
        process.execPath,
        ["use-local-sdk.mjs", sdk, ui],
        path.join(logs, "sdk.log")
      );
      await run(
        author,
        "pnpm",
        [
          "install",
          "--no-frozen-lockfile",
          "--ignore-scripts",
          "--prefer-offline",
          "--store-dir",
          store,
        ],
        path.join(logs, "install.log")
      );
    }
    await run(
      author,
      "pnpm",
      [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--registry=https://registry.npmjs.org",
        "--store-dir",
        store,
      ],
      path.join(logs, "frozen.log")
    );
    if (published) {
      const installed = JSON.parse(
        await readFile(path.join(author, "node_modules/@tau/plugins/package.json"), "utf8")
      );
      if (installed.name !== "@xiongtao.xt/tau-plugins" || installed.version !== sdkVersion)
        throw new Error("安装后的 SDK 身份不一致");
      result.sdkVersion = installed.version;
    }
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
  reportWrite = reportWrite.then(() =>
    writeFile(
      reportPath,
      JSON.stringify(
        {
          directory,
          sdkSource: published ? "npm" : "local-tarball",
          sdkVersion,
          store,
          sdk,
          ui,
          results,
        },
        null,
        2
      )
    )
  );
  await reportWrite;
  console.log(`${name}: ${result.status}${result.error ? ` ${result.error}` : ""}`);
}

const queue = [...sources];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let source = queue.shift(); source; source = queue.shift()) await verify(source);
  })
);
if (results.some(result => result.status !== "passed")) process.exitCode = 1;
