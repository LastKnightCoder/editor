import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import pruneNativeModules from "./prune-packaged-native-modules.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");

// 本平台要校验的全部产物：mac 的 Apple 芯片与 Intel 各一个 .app
const resolvePackages = () => {
  if (process.platform === "win32") {
    const unpackedDir = path.join(desktopDir, "release", "win-unpacked");
    return [
      {
        arch: "x64",
        unpackedDir,
        appExe: path.join(unpackedDir, "Tau.exe"),
        appAsar: "./resources/app.asar",
      },
    ];
  }

  if (process.platform === "darwin") {
    // electron-builder 的 mac 默认架构是 x64：x64 输出到 release/mac，arm64 输出到 release/mac-arm64
    return [
      { arch: "x64", outputDir: "mac" },
      { arch: "arm64", outputDir: "mac-arm64" },
    ].map(({ arch, outputDir }) => {
      const unpackedDir = path.join(desktopDir, "release", outputDir, "Tau.app", "Contents");
      return {
        arch,
        unpackedDir,
        appExe: path.join(unpackedDir, "MacOS", "Tau"),
        appAsar: "./Resources/app.asar",
      };
    });
  }

  return null;
};

const packages = resolvePackages();
// 同一平台的两种架构共用相同的归档相对路径。
const packagePaths = packages?.[0];

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
        const mod = await import(${JSON.stringify(packagePaths?.appAsar.replace("app.asar", "app.asar.unpacked") ?? "")} + "/node_modules/node-llama-cpp/dist/index.js");
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

if (process.platform === "darwin") {
  checks.push({
    name: "whisper-cli",
    code: `
      const binary = require("node:path").resolve("./Resources/bin/whisper-cli");
      const result = require("node:child_process").spawnSync(binary, ["--help"], { encoding: "utf8", timeout: 15000 });
      if (result.error || result.status !== 0 || !(result.stdout + result.stderr).includes("usage:")) {
        throw new Error("whisper-cli 执行失败：" + (result.error?.message || result.stderr));
      }
      console.log("whisper-cli=ok");
    `,
  });
  checks.push({
    name: "pi-native-platform",
    code: `
      import("./Resources/app.asar.unpacked/node_modules/@earendil-works/pi-tui/dist/native-platform.js")
        .then(({ getNativePlatformHelper }) => {
          if (typeof getNativePlatformHelper()?.getText !== "function") throw new Error("pi 原生平台模块加载失败");
          console.log("pi-native-platform=ok");
        }).catch(error => { console.error(error); process.exit(1); });
    `,
  });
}

if (!packages) {
  console.log(`[native-runtime] skipped: unsupported platform ${process.platform}`);
  process.exit(0);
}

for (const pkg of packages) {
  if (!existsSync(pkg.appExe)) {
    throw new Error(`[native-runtime] packaged ${pkg.arch} app not found: ${pkg.appExe}`);
  }
}

// llama.cpp 后端集合必须与 prune allowlist 完全一致：多了意味着本地 node_modules
// 带入了 allowlist 外的后端（包体积膨胀），少了意味着产物缺失推理后端
const verifyLlamaCppBackendSet = packagePaths => {
  const expected = pruneNativeModules.llamaBackendAllowlist(process.platform, packagePaths.arch);
  if (!expected) {
    return;
  }

  const backendsDir = path.join(
    packagePaths.unpackedDir,
    process.platform === "darwin" ? "Resources" : "resources",
    "app.asar.unpacked",
    "node_modules",
    "@node-llama-cpp"
  );
  const actual = existsSync(backendsDir) ? readdirSync(backendsDir).sort() : [];
  const expectedSorted = [...expected].sort();
  if (actual.join(",") !== expectedSorted.join(",")) {
    throw new Error(
      `[native-runtime] ${packagePaths.arch} @node-llama-cpp backend set mismatch. Expected [${expectedSorted.join(", ")}], got [${actual.join(", ")}]`
    );
  }
  console.log(`[native-runtime] ${packagePaths.arch} llama backends: ${actual.join(", ")}`);
};

// 带平台 token 的原生模块目录只能包含当前打包目标允许的 token，防止被污染的
// node_modules（如混入其他平台、或 mac 另一架构的变体）让包体积悄悄膨胀几百 MB；
// 判定函数与 prune 脚本共享，删除规则与断言规则不允许漂移
const verifyNoForeignPlatformModules = packagePaths => {
  if (!pruneNativeModules.allowedPlatformTokens(process.platform, packagePaths.arch)) {
    return;
  }

  const nodeModulesDir = path.join(
    packagePaths.unpackedDir,
    process.platform === "darwin" ? "Resources" : "resources",
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
    const matchedToken = pruneNativeModules.findForeignPlatformToken(
      packageName,
      process.platform,
      packagePaths.arch
    );
    if (matchedToken) {
      foreign.push(`${packageName} (token: ${matchedToken})`);
    }
  }

  if (foreign.length > 0) {
    throw new Error(
      `[native-runtime] ${packagePaths.arch}: foreign platform artifacts found in unpacked node_modules:\n  ${foreign.join("\n  ")}`
    );
  }
  console.log(
    `[native-runtime] ${packagePaths.arch}: no foreign platform modules (${packageNames.length} packages checked)`
  );
};

const verifyMacBinaryArchitectures = packagePaths => {
  if (process.platform !== "darwin") return;
  const resourcesDir = path.join(packagePaths.unpackedDir, "Resources");
  const nodeModulesDir = path.join(resourcesDir, "app.asar.unpacked", "node_modules");
  const binaries = [
    packagePaths.appExe,
    path.join(resourcesDir, "bin", "whisper-cli"),
    path.join(nodeModulesDir, "@vscode", `ripgrep-darwin-${packagePaths.arch}`, "bin", "rg"),
    path.join(nodeModulesDir, "7zip-bin", "mac", packagePaths.arch, "7za"),
  ];
  const collect = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile() && /\.(node|dylib)$/.test(entry.name)) binaries.push(file);
    }
  };
  collect(nodeModulesDir);
  for (const binary of binaries) {
    try {
      execFileSync(
        "/usr/bin/lipo",
        [binary, "-verify_arch", packagePaths.arch === "x64" ? "x86_64" : "arm64"],
        {
          stdio: "pipe",
        }
      );
    } catch (error) {
      throw new Error(
        `[native-runtime] ${packagePaths.arch} 二进制架构不匹配或文件缺失：${binary}`,
        { cause: error }
      );
    }
  }
  console.log(`[native-runtime] ${packagePaths.arch}: ${binaries.length} 个二进制架构检查通过`);
};

// Apple 芯片的机器经 Rosetta 运行 x64 包；Intel 机器跑不了 arm64 包，仍检查每个二进制的架构。
const runCommandFor = packagePaths => {
  if (packagePaths.arch === process.arch) {
    return [packagePaths.appExe, []];
  }
  if (process.platform === "darwin" && process.arch === "arm64" && packagePaths.arch === "x64") {
    return ["arch", ["-x86_64", packagePaths.appExe]];
  }
  return null;
};

for (const packagePaths of packages) {
  verifyLlamaCppBackendSet(packagePaths);
  verifyNoForeignPlatformModules(packagePaths);
  verifyMacBinaryArchitectures(packagePaths);

  const command = runCommandFor(packagePaths);
  if (!command) {
    console.warn(
      `[native-runtime] ${packagePaths.arch}: 本机 ${process.arch} 无法运行该架构，跳过运行时检查，请在对应机器上验证`
    );
    continue;
  }

  const [file, prefixArgs] = command;
  for (const check of checks) {
    try {
      const output = execFileSync(file, [...prefixArgs, "-e", check.code], {
        cwd: packagePaths.unpackedDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      });
      process.stdout.write(
        `[native-runtime] ${packagePaths.arch} ${check.name}: ${output.trim()}\n`
      );
    } catch (error) {
      const stderr = error.stderr?.toString?.() ?? "";
      const stdout = error.stdout?.toString?.() ?? "";
      console.error(`[native-runtime] ${packagePaths.arch} ${check.name} failed`);
      if (stdout.trim()) console.error(stdout.trim());
      if (stderr.trim()) console.error(stderr.trim());
      process.exit(1);
    }
  }
}

console.log("[native-runtime] all checks passed");
