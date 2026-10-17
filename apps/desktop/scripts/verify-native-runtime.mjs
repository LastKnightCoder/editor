import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import pruneNativeModules from "./prune-packaged-native-modules.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");

const firstExistingPackage = packages =>
  packages.find(({ appExe }) => existsSync(appExe)) ?? packages[0];

const resolvePackagePaths = () => {
  if (process.platform === "win32") {
    const unpackedDir = path.join(desktopDir, "release", "win-unpacked");
    return {
      unpackedDir,
      appExe: path.join(unpackedDir, "Tau.exe"),
      appAsar: "./resources/app.asar",
    };
  }

  if (process.platform === "darwin") {
    const outputDirs = [`mac-${process.arch}`, "mac"];
    return firstExistingPackage(
      outputDirs.map(outputDir => {
        const unpackedDir = path.join(desktopDir, "release", outputDir, "Tau.app", "Contents");
        return {
          unpackedDir,
          appExe: path.join(unpackedDir, "MacOS", "Tau"),
          appAsar: "./Resources/app.asar",
        };
      })
    );
  }

  return null;
};

const packagePaths = resolvePackagePaths();

const checks = [
  {
    name: "tau-cli",
    code: `
      const fs = require("node:fs");
      const os = require("node:os");
      const path = require("node:path");
      const resources = path.resolve(path.dirname(${JSON.stringify(packagePaths?.appAsar ?? "")}));
      const runCli = (args, extraEnv = {}) => require("node:child_process").execFileSync(process.execPath, [path.join(resources, "cli", "index.js"), ...args], {
        env: { ...process.env, ...extraEnv, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: [path.join(resources, "app.asar.unpacked", "node_modules"), path.join(resources, "app.asar", "node_modules")].join(path.delimiter) },
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000,
      });
      if (!runCli(["--help"]).includes("Usage: tau")) throw new Error("packaged Tau CLI failed to start");
      // 打开数据库会加载 sqlite-vec：CLI 须自行改写到 app.asar.unpacked，SQLite 的 dlopen 不经 Electron 重定向
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "tau-cli-"));
      try {
        fs.mkdirSync(path.join(home, ".editor"));
        const Database = require(path.join(resources, "app.asar", "node_modules", "better-sqlite3"));
        new Database(path.join(home, ".editor", "data.db")).close();
        if (!runCli(["db", "status"], { HOME: home }).includes("Journal Mode")) throw new Error("packaged Tau CLI failed to open database");
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
      console.log("tau-cli=ok");
    `,
  },
  {
    name: "pi-runtime",
    code: `
      process.env.TAU_SMOKE_ASAR = require("node:path").resolve(${JSON.stringify(packagePaths?.appAsar ?? "")});
      import(${JSON.stringify(pathToFileURL(path.join(__dirname, "pi-smoke.mjs")).href)})
        .catch(error => { console.error(error); process.exit(1); });
    `,
  },
  {
    name: "better-sqlite3",
    code: `
      const Database = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/better-sqlite3");
      const db = new Database(":memory:");
      db.prepare("select 1 as ok").get();
      db.close();
      console.log("better-sqlite3=ok");
    `,
  },
  {
    name: "sqlite-vec",
    code: `
      const fs = require("node:fs");
      const Database = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/better-sqlite3");
      const sqliteVec = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/sqlite-vec");
      const defaultPath = sqliteVec.getLoadablePath();
      const unpackedPath = defaultPath.replace(/([\\\\/])app\\.asar([\\\\/])/, "$1app.asar.unpacked$2");
      if (!fs.existsSync(unpackedPath)) {
        throw new Error("sqlite-vec unpacked extension not found: " + unpackedPath);
      }
      const db = new Database(":memory:");
      db.loadExtension(unpackedPath);
      const row = db.prepare("select vec_version() as version").get();
      db.close();
      console.log("sqlite-vec=" + row.version);
    `,
  },
  {
    name: "sharp",
    code: `
      (async () => {
      const sharp = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/sharp");
        const output = await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 3,
            background: { r: 255, g: 0, b: 0 },
          },
        }).png().toBuffer();
        if (!Buffer.isBuffer(output) || output.length === 0) {
          throw new Error("sharp produced an empty output");
        }
        console.log("sharp=ok");
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `,
  },
  {
    name: "@node-rs/jieba",
    code: `
      const { Jieba } = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@node-rs/jieba");
      const { dict, idf } = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@node-rs/jieba/dict");
      if (dict.length < 1_000_000 || idf.length < 1_000_000) {
        throw new Error("jieba dictionaries are missing or truncated");
      }
      const jieba = Jieba.withDict(dict);
      const words = jieba.cutForSearch("南京市长江大桥", true);
      if (!words.includes("南京市") || !words.includes("长江大桥")) {
        throw new Error("jieba dictionary segmentation failed: " + words.join("/"));
      }
      console.log("jieba=ok");
    `,
  },
  {
    name: "@firecrawl/anydoc",
    code: `
      (async () => {
        const { toMarkdownBytes } = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@firecrawl/anydoc");
        const markdown = await toMarkdownBytes(new Uint8Array(Buffer.from("name,age\\nAlice,30")), "csv");
        if (typeof markdown !== "string" || !markdown.includes("Alice")) {
          throw new Error("anydoc produced unexpected CSV markdown: " + markdown);
        }
        console.log("anydoc=ok");
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `,
  },
  {
    name: "node-llama-cpp",
    // ESM-only 包（含顶层 await），不能用 require，须动态 import unpacked 入口
    code: `
      (async () => {
        const mod = await import("./resources/app.asar.unpacked/node_modules/node-llama-cpp/dist/index.js");
        const llama = await mod.getLlama();
        await llama.dispose();
        console.log("node-llama-cpp=ok");
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `,
  },
  {
    name: "@tailwindcss/oxide",
    code: `
      const oxide = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@tailwindcss/oxide");
      if (typeof oxide.Scanner !== "function") {
        throw new Error("Tailwind oxide Scanner export missing");
      }
      console.log("tailwind-oxide=ok");
    `,
  },
  {
    name: "@vscode/ripgrep",
    code: `
      const fs = require("node:fs");
      const { spawnSync } = require("node:child_process");
      const ripgrep = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@vscode/ripgrep");
      // spawn 不会像 execFile 那样重定向到 app.asar.unpacked，必须显式改写，
      // 规则与 src-electron/main/utils/asarPath.ts 保持一致；这条断言必须真实执行
      // 二进制——fs.existsSync 对 asar 路径会回退到 unpacked，只查存在会假通过
      const binaryPath = ripgrep.rgPath.replace(/([\\\\/])app\\.asar([\\\\/])/, "$1app.asar.unpacked$2");
      if (!fs.existsSync(binaryPath)) {
        throw new Error("ripgrep binary not found: " + binaryPath);
      }
      const result = spawnSync(binaryPath, ["--version"], { encoding: "utf8" });
      if (result.error) {
        throw new Error("ripgrep spawn failed: " + result.error.message);
      }
      if (!String(result.stdout).includes("ripgrep")) {
        throw new Error("unexpected ripgrep output: " + result.stdout);
      }
      console.log("ripgrep=" + String(result.stdout).trim());
    `,
  },
  {
    name: "@ffprobe-installer/ffprobe",
    code: `
      const probe = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@ffprobe-installer/ffprobe");
      const binary = probe.path.replace(/([\\\\/])app\\.asar([\\\\/])/, "$1app.asar.unpacked$2");
      const result = require("node:child_process").spawnSync(binary, ["-version"], { encoding: "utf8" });
      if (result.error || result.status !== 0 || !result.stdout.includes("ffprobe version")) {
        throw new Error("ffprobe 执行失败：" + (result.error?.message || result.stderr));
      }
      console.log("ffprobe=ok");
    `,
  },
  {
    name: "@myriaddreamin/typst-ts-node-compiler",
    code: `
      const { NodeCompiler } = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@myriaddreamin/typst-ts-node-compiler");
      const compiler = NodeCompiler.create();
      const result = compiler.tryHtml({
        mainFileContent: "= Runtime check",
        inputs: {},
      });
      if (!result.result) {
        result.printDiagnostics();
        throw new Error("typst compiler produced no HTML result");
      }
      const html = result.result.body();
      if (typeof html !== "string" || html.length === 0) {
        throw new Error("typst compiler produced an empty HTML body");
      }
      console.log("typst=ok");
    `,
  },
  {
    name: "7zip-min",
    code: `
      const fs = require("node:fs");
      const sevenZip = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/7zip-min");
      // 规则与 src-electron/main/utils/seven-zip.ts 保持一致：7zip-min 自带的 asar
      // 探测看 process.argv[1]，安装版恒为 false，必须显式改写才能让 spawn 命中实体文件
      const binaryPath = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/7zip-bin").path7za
        .replace(/([\\\\/])app\\.asar([\\\\/])/, "$1app.asar.unpacked$2");
      if (!fs.existsSync(binaryPath)) {
        throw new Error("7zip binary not found: " + binaryPath);
      }
      sevenZip.config({ binaryPath });
      sevenZip.cmd(["i"], (error, output) => {
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (typeof output !== "string" || !output.includes("7-Zip")) {
          console.error("unexpected 7zip output");
          process.exit(1);
        }
        console.log("7zip-min=ok");
      });
    `,
  },
  {
    name: "font-list",
    code: `
      require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/font-list").getFonts({ disableQuoting: true })
        .then((fonts) => {
          if (!Array.isArray(fonts)) {
            throw new Error("font-list returned a non-array result");
          }
          console.log("font-list=ok count=" + fonts.length);
        })
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
    `,
  },
];

if (!packagePaths) {
  console.log(`[native-runtime] skipped: unsupported platform ${process.platform}`);
  process.exit(0);
}

if (!existsSync(packagePaths.appExe)) {
  throw new Error(`[native-runtime] packaged app not found: ${packagePaths.appExe}`);
}

// llama.cpp 后端集合必须与 prune allowlist 完全一致：多了意味着本地 node_modules
// 带入了 allowlist 外的后端（包体积膨胀），少了意味着产物缺失推理后端。
// 与 run-electron-builder 的补拉逻辑对称，仅校验 win32/linux；mac 后端由 arch 决定
const verifyLlamaCppBackendSet = () => {
  const expected = pruneNativeModules.llamaBackendAllowlistByPlatform[process.platform];
  if (process.platform === "darwin" || !expected) {
    return;
  }

  const backendsDir = path.join(
    packagePaths.unpackedDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "@node-llama-cpp"
  );
  const actual = existsSync(backendsDir) ? readdirSync(backendsDir).sort() : [];
  const expectedSorted = [...expected].sort();
  if (actual.join(",") !== expectedSorted.join(",")) {
    throw new Error(
      `[native-runtime] @node-llama-cpp backend set mismatch. Expected [${expectedSorted.join(", ")}], got [${actual.join(", ")}]`
    );
  }
  console.log(`[native-runtime] llama backends: ${actual.join(", ")}`);
};

// 带平台 token 的原生模块目录只能包含当前平台允许的 token，防止被污染的
// node_modules（如混入其他平台的全量变体）让包体积悄悄膨胀几百 MB；
// token 常量与 prune 脚本共享，删除规则与断言规则不允许漂移
const { knownPlatformTokens, allowedPlatformTokensByPlatform } = pruneNativeModules;

const verifyNoForeignPlatformModules = () => {
  const allowedTokens = allowedPlatformTokensByPlatform[process.platform];
  if (!allowedTokens) {
    return;
  }

  const nodeModulesDir = path.join(
    packagePaths.unpackedDir,
    "resources",
    "app.asar.unpacked",
    "node_modules"
  );
  if (!existsSync(nodeModulesDir)) {
    throw new Error(`[native-runtime] unpacked node_modules not found: ${nodeModulesDir}`);
  }

  const packageNames = [];
  for (const entry of readdirSync(nodeModulesDir)) {
    if (entry.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry);
      if (existsSync(scopeDir)) {
        for (const scopedEntry of readdirSync(scopeDir)) {
          packageNames.push(`${entry}/${scopedEntry}`);
        }
      }
    } else {
      packageNames.push(entry);
    }
  }

  const foreign = [];
  for (const packageName of packageNames) {
    const nameWithoutScope = packageName.split("/").pop();
    const matchedToken = knownPlatformTokens.find(
      token =>
        !allowedTokens.includes(token) && new RegExp(`-${token}([._-]|$)`).test(nameWithoutScope)
    );
    if (matchedToken) {
      foreign.push(`${packageName} (token: ${matchedToken})`);
    }
  }

  if (foreign.length > 0) {
    throw new Error(
      `[native-runtime] foreign platform artifacts found in unpacked node_modules:\n  ${foreign.join("\n  ")}`
    );
  }
  console.log(
    `[native-runtime] no foreign platform modules (${packageNames.length} packages checked)`
  );
};

verifyLlamaCppBackendSet();
verifyNoForeignPlatformModules();

for (const check of checks) {
  try {
    const output = execFileSync(packagePaths.appExe, ["-e", check.code], {
      cwd: packagePaths.unpackedDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    process.stdout.write(`[native-runtime] ${check.name}: ${output.trim()}\n`);
  } catch (error) {
    const stderr = error.stderr?.toString?.() ?? "";
    const stdout = error.stdout?.toString?.() ?? "";
    console.error(`[native-runtime] ${check.name} failed`);
    if (stdout.trim()) console.error(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
    process.exit(1);
  }
}

console.log("[native-runtime] all checks passed");
