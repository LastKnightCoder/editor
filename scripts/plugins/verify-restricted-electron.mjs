import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, mkdir, cp, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const { build: buildApplication, Platform, Arch } = require("electron-builder");
const builderRequire = createRequire(require.resolve("electron-builder"));
const { listPackage, extractFile } = builderRequire("@electron/asar");
const quickRequire = createRequire(createRequire(import.meta.url).resolve("quickjs-emscripten"));
const electron = require("electron");
const output = path.join(root, "output/plugin-restricted-electron");
await mkdir(output, { recursive: true });
const report = {
  status: "running",
  platform: process.platform,
  arch: process.arch,
  phases: [],
  assets: [],
};
const directory = await mkdtemp(path.join(tmpdir(), "tau-restricted-中文 path-"));

async function run(executable, args, phase) {
  const env = {
    ...process.env,
    TAU_RESTRICTED_TEST_DIRECTORY: directory,
    TAU_RESTRICTED_TEST_PHASE: phase,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  let stderr = "";
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: directory,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 60000);
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timeout);
      resolve({ code, timedOut });
    });
  });
  let result;
  try {
    result = JSON.parse(await readFile(path.join(directory, phase + ".json"), "utf8"));
  } catch {
    throw new Error(`${phase}: 无报告，exit=${exit.code}, timeout=${exit.timedOut}\n${stderr}`);
  }
  report.phases.push(result);
  assert.equal(exit.code, 0, result.error ?? stderr);
  assert.equal(exit.timedOut, false);
  assert.equal(result.status, "passed", result.error);
  for (const pid of result.pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  console.log(`[C12-B] ${phase}: ${result.cases.length} 项通过`);
}

try {
  assert.equal(process.platform, "darwin", "当前打包验证只实现 macOS，不冒充跨平台验收");
  const source = path.join(directory, "application");
  const resources = path.join(source, "restricted");
  await mkdir(resources, { recursive: true });
  const common = {
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["electron"],
    banner: {
      js: "import {createRequire as __createRequire} from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  };
  for (const [entry, outfile] of [
    ["electron-main.mjs", path.join(source, "main.mjs")],
    ["electron-worker.mjs", path.join(resources, "worker.mjs")],
  ]) {
    const built = await build({
      ...common,
      entryPoints: [path.join(root, "scripts/plugins/restricted", entry)],
      outfile,
      metafile: true,
    });
    const imports = Object.values(built.metafile.outputs).flatMap(value => value.imports);
    assert.ok(
      imports.every(value => value.path === "electron" || value.path.startsWith("node:")),
      JSON.stringify(imports)
    );
  }
  await cp(
    quickRequire.resolve("@jitl/quickjs-wasmfile-release-sync/wasm"),
    path.join(resources, "quickjs.wasm")
  );
  await cp(
    path.join(
      path.dirname(createRequire(import.meta.url).resolve("quickjs-emscripten/package.json")),
      "LICENSE"
    ),
    path.join(resources, "LICENSE.quickjs-emscripten")
  );
  await cp(
    path.join(
      path.dirname(quickRequire.resolve("@jitl/quickjs-wasmfile-release-sync/package.json")),
      "LICENSE"
    ),
    path.join(resources, "LICENSE.quickjs")
  );
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({
      name: "tau-restricted-verification",
      version: "0.0.0",
      main: "main.mjs",
      type: "module",
    })
  );
  for (const name of ["main.mjs", "restricted/worker.mjs", "restricted/quickjs.wasm"]) {
    const bytes = await readFile(path.join(source, name));
    report.assets.push({
      name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await run(electron, [source], "development");

  const electronBundle = path.resolve(electron, "../../..");
  const productName = "Tau Restricted Probe";
  const packagedOutput = path.join(directory, "packaged");
  await buildApplication({
    projectDir: source,
    publish: "never",
    targets: Platform.MAC.createTarget("dir", Arch[process.arch]),
    config: {
      appId: "dev.tau.restricted-probe",
      productName,
      electronVersion: require("electron/package.json").version,
      electronDist: path.dirname(electronBundle),
      asar: true,
      npmRebuild: false,
      files: ["main.mjs", "package.json"],
      extraResources: [{ from: resources, to: "restricted" }],
      mac: { identity: null },
      directories: { output: packagedOutput },
    },
  });
  const bundle = path.join(
    packagedOutput,
    process.arch === "arm64" ? "mac-arm64" : "mac",
    productName + ".app"
  );
  const packagedResources = path.join(bundle, "Contents/Resources");
  const archive = path.join(packagedResources, "app.asar");
  assert.deepEqual(listPackage(archive).sort(), ["/main.mjs", "/package.json"]);
  assert.equal(
    createHash("sha256").update(extractFile(archive, "main.mjs")).digest("hex"),
    report.assets[0].sha256
  );
  for (const asset of report.assets.slice(1)) {
    const bytes = await readFile(path.join(packagedResources, asset.name));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  }
  await rm(source, { recursive: true });
  const binary = path.join(bundle, "Contents/MacOS", productName);
  await stat(binary);
  await run(binary, [], "packaged");
  const wasm = path.join(packagedResources, "restricted/quickjs.wasm");
  await rename(wasm, wasm + ".backup");
  await run(binary, [], "missing-wasm");
  await writeFile(wasm, "invalid wasm");
  await run(binary, [], "corrupt-wasm");
  await rm(wasm);
  await rename(wasm + ".backup", wasm);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await rm(directory, { recursive: true, force: true });
  console.log(`[C12-B] ${report.status}: ${path.join(output, "report.json")}`);
}
process.exit(report.status === "passed" ? 0 : 1);
