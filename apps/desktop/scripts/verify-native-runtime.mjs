import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
      const jieba = new Jieba();
      const words = jieba.cutForSearch("系统运行时校验", true);
      if (!Array.isArray(words) || words.length === 0) {
        throw new Error("jieba returned no tokens");
      }
      console.log("jieba=ok");
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
    name: "node-pty",
    code: `
      const pty = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/node-pty");
      if (typeof pty.spawn !== "function") {
        throw new Error("node-pty spawn export missing");
      }
      const { loadNativeModule } = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/node-pty/lib/utils");
      if (process.platform === "win32") {
        loadNativeModule("conpty");
        loadNativeModule("pty");
      } else {
        loadNativeModule("pty");
      }
      console.log("node-pty=ok");
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
      const ripgrep = require(${JSON.stringify(packagePaths?.appAsar ?? "")} + "/node_modules/@vscode/ripgrep");
      if (!ripgrep.rgPath || !fs.existsSync(ripgrep.rgPath)) {
        throw new Error("ripgrep binary not found: " + ripgrep.rgPath);
      }
      console.log("ripgrep=" + ripgrep.rgPath);
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
