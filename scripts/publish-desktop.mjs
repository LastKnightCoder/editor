import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseNote, injectReleaseNotes, releaseNotesUpTo } from "./release-notes.mjs";
import { assertReleaseArtifacts } from "./release-artifacts.mjs";
import { runPnpm } from "./run-pnpm.mjs";
import {
  R2_BUCKET,
  R2_ENV_KEYS,
  R2_PUBLIC_BASE_URL,
  createR2Client,
  requiredEnv,
} from "./r2-client.mjs";

const DESKTOP_PREFIX = "desktop";
const UPLOAD_TARGET = {
  label: `Cloudflare R2 ${R2_BUCKET}`,
  baseUrl: R2_PUBLIC_BASE_URL,
  envKeys: R2_ENV_KEYS,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = join(root, "apps/desktop");
const releaseDir = join(desktopDir, "release");
const releaseNotesDir = join(desktopDir, "release-notes");
const desktopPackageFile = join(desktopDir, "package.json");
const rootPackageFile = join(root, "package.json");

function printHelp() {
  console.log(`用法: pnpm publish:desktop [选项]

构建桌面端并将当前版本的安装包发布到 Cloudflare R2，更新 electron-updater 拉取的 latest*.yml。
版本号默认取 apps/desktop/package.json 当前值（只上传该版本的产物）。
发布前必须准备好 apps/desktop/release-notes/<版本>.md 升级公告，缺失即拒绝发布；
公告会写进 latest*.yml，供旧版本在升级前展示。
指定 --version 时会先回写根目录与 apps/desktop 两处 package.json 再构建；
若后续构建或上传失败，版本号不回滚，修复后可用 --skip-build 重试。
上传全部成功后自动创建 vX.Y.Z 版本 tag（已存在则跳过，不自动推送）。

选项:
  --version x.y.z  指定发布版本并回写两处 package.json
  --skip-build     跳过构建，使用现有 apps/desktop/release 产物
  --dry-run        只执行本地流程（构建、收集、校验），不上传
  --force          远端已是同版本时仍强制覆盖
  -h, --help       显示帮助

环境变量:
  R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
分发地址：${R2_PUBLIC_BASE_URL}`);
}

function parseArgs(argv) {
  const options = { version: null, dryRun: false, skipBuild: false, force: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--version") {
      options.version = argv[index + 1];
      if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
        throw new Error("--version 需要形如 x.y.z 的版本号");
      }
      index++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseLatestYmlVersion(content) {
  const match = /^version:\s*(\S+)/m.exec(content);
  if (!match) throw new Error(`latest yml 中未找到 version 字段`);
  return match[1];
}

// 只收集当前版本的安装产物与 latest*.yml，release 目录中的历史版本不参与上传
function collectArtifacts(version) {
  const names = readdirSync(releaseDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);

  const versionedArtifacts = names.filter(name => name.includes(`-v${version}-`));
  if (versionedArtifacts.length === 0) {
    throw new Error(`release 目录中没有 v${version} 的产物，请先构建或去掉 --skip-build`);
  }

  const latestFiles = names.filter(name => /^latest.*\.yml$/.test(name));
  if (latestFiles.length === 0) {
    throw new Error(`release 目录中没有 latest*.yml，请先构建或去掉 --skip-build`);
  }
  for (const name of latestFiles) {
    const ymlVersion = parseLatestYmlVersion(readFileSync(join(releaseDir, name), "utf8"));
    if (ymlVersion !== version) {
      throw new Error(`${name} 中的版本是 ${ymlVersion}，与发布版本 ${version} 不一致`);
    }
  }

  assertReleaseArtifacts(releaseDir, version, versionedArtifacts, latestFiles);
  return { versionedArtifacts, latestFiles };
}

function writeReleaseNotesToLatestFiles(version, latestFiles) {
  const notes = releaseNotesUpTo(releaseNotesDir, version);
  for (const name of latestFiles) {
    const file = join(releaseDir, name);
    writeFileSync(file, injectReleaseNotes(readFileSync(file, "utf8"), notes));
  }
  console.log(`▶ 已写入升级公告（${notes.length} 个版本）到 ${latestFiles.join(", ")}`);
}

async function fetchRemoteVersion(client, latestFiles) {
  const remoteVersions = [];
  for (const name of latestFiles) {
    const content = await client.getText(`${DESKTOP_PREFIX}/${name}`);
    if (content != null) remoteVersions.push(parseLatestYmlVersion(content));
  }
  return remoteVersions.length > 0 ? remoteVersions.sort().at(-1) : null;
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  }).trim();
}

// 发布成功后打 annotated tag（沿用 Tauri 时代 release.mjs 的 vX.Y.Z 惯例），已存在则跳过
function createVersionTag(version) {
  const tagName = `v${version}`;
  try {
    if (runGit(["tag", "-l", tagName])) {
      console.log(`▶ 版本 tag ${tagName} 已存在，跳过`);
      return;
    }
    const uncommitted = runGit([
      "status",
      "--porcelain",
      "--",
      "package.json",
      "apps/desktop/package.json",
    ]);
    if (uncommitted) {
      console.log(`  注意: package.json 版本号改动尚未提交，tag 将打在当前 HEAD 上`);
    }
    runGit(["tag", "-a", tagName, "-m", tagName]);
    const head = runGit(["rev-parse", "--short", "HEAD"]);
    console.log(
      `▶ 已创建版本 tag ${tagName}（${head}），需要同步远端时请手动 git push origin ${tagName}`
    );
  } catch (error) {
    console.warn(`⚠ 打版本 tag 失败（不影响发布结果）: ${error?.message ?? error}`);
  }
}

const UPLOAD_CONCURRENCY = 3;

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function percentOf(loaded, total) {
  return total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 100;
}

// 终端逐文件上传进度：TTY 下整块原地刷新（ANSI 光标控制在 macOS/Windows 终端均可用），
// 非 TTY（CI、管道重定向）退化为每个文件完成时打印一行。
function createUploadProgress(files) {
  const rows = files.map(({ name, size }) => ({ name, size, loaded: 0, done: false }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const isInteractive = Boolean(process.stdout.isTTY);
  let renderedLines = 0;
  let lastRenderAt = 0;

  const lineOf = row => {
    const label = row.name.length > 40 ? `${row.name.slice(0, 39)}…` : row.name.padEnd(40);
    if (row.failed) return `  ✖ ${label} 失败`;
    if (row.done) return `  ✔ ${label} ${formatMb(row.size).padStart(9)}`;
    return `  ↗ ${label} ${String(percentOf(row.loaded, row.size)).padStart(3)}%  ${formatMb(row.loaded)}/${formatMb(row.size)}`;
  };

  const summaryLine = () => {
    const loaded = rows.reduce((sum, row) => sum + row.loaded, 0);
    const doneCount = rows.filter(row => row.done).length;
    return `  ▶ 总计 ${doneCount}/${rows.length} 个文件  ${String(percentOf(loaded, totalSize)).padStart(3)}%  ${formatMb(loaded)}/${formatMb(totalSize)}`;
  };

  function render(force) {
    if (!isInteractive) return;
    const now = Date.now();
    if (!force && now - lastRenderAt < 200) return;
    lastRenderAt = now;
    const lines = [...rows.map(lineOf), summaryLine()];
    const moveUp = renderedLines > 0 ? `\x1b[${renderedLines}A` : "";
    process.stdout.write(`${moveUp}${lines.map(line => `\x1b[2K${line}`).join("\n")}\n`);
    renderedLines = lines.length;
  }

  return {
    update(index, loaded) {
      rows[index].loaded = loaded;
      render(false);
    },
    done(index) {
      const row = rows[index];
      row.loaded = row.size;
      row.done = true;
      if (isInteractive) {
        render(true);
      } else {
        process.stdout.write(`  ✔ ${row.name}  ${formatMb(row.size)}\n`);
      }
    },
    fail(index) {
      rows[index].failed = true;
      if (isInteractive) {
        render(true);
      } else {
        process.stdout.write(`  ✖ ${rows[index].name} 上传失败\n`);
      }
    },
    finish() {
      render(true);
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = UPLOAD_TARGET;
  // 提前校验凭据，避免构建完成后才发现无法上传
  if (!options.dryRun) {
    for (const key of target.envKeys) requiredEnv(key);
  }

  const desktopPkg = readJson(desktopPackageFile);
  const version = options.version ?? desktopPkg.version;
  console.log(`▶ 发布版本: ${version}（${target.label}）`);
  // 先于回写版本号与构建校验，避免构建完成后才发现没写公告
  assertReleaseNote(releaseNotesDir, version);

  if (options.version && !options.dryRun) {
    console.log(`▶ 回写版本号（根目录与 apps/desktop）...`);
    desktopPkg.version = version;
    writeJson(desktopPackageFile, desktopPkg);
    const rootPkg = readJson(rootPackageFile);
    rootPkg.version = version;
    writeJson(rootPackageFile, rootPkg);
  }

  if (!options.skipBuild) {
    console.log(`▶ 构建桌面端 ...`);
    runPnpm(["--filter", "desktop", "build"], {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    console.log(`▶ --skip-build: 跳过构建，使用现有产物`);
  }

  if (!existsSync(releaseDir) || !statSync(releaseDir).isDirectory()) {
    throw new Error(`产物目录不存在: ${releaseDir}`);
  }

  const { versionedArtifacts, latestFiles } = collectArtifacts(version);
  writeReleaseNotesToLatestFiles(version, latestFiles);

  const totalSize = [...versionedArtifacts, ...latestFiles].reduce((sum, name) => {
    return sum + statSync(join(releaseDir, name)).size;
  }, 0);
  console.log(
    `▶ 待上传 ${versionedArtifacts.length + latestFiles.length} 个文件，共 ${(totalSize / 1024 / 1024).toFixed(2)} MB:`
  );
  for (const name of versionedArtifacts) console.log(`    ${DESKTOP_PREFIX}/${name}`);
  for (const name of latestFiles) console.log(`    ${DESKTOP_PREFIX}/${name}`);

  if (options.dryRun) {
    console.log(`▶ --dry-run: 本地流程全部通过，跳过上传`);
    return;
  }

  const client = createR2Client();

  const remoteVersion = await fetchRemoteVersion(client, latestFiles);
  if (remoteVersion === version && !options.force) {
    throw new Error(
      `远端已是版本 ${version}，electron-updater 不会重发同版本；请升版本或使用 --force 覆盖`
    );
  }

  // 先传版本产物再写 latest*.yml，保证 yml 指向的产物一定已存在。
  // 产物（含 Windows 与 macOS 双平台）并发上传，小文件优先以缩短尾部等待。
  const uploads = versionedArtifacts
    .map(name => {
      const size = statSync(join(releaseDir, name)).size;
      return { name, size };
    })
    .sort((a, b) => a.size - b.size);
  console.log(
    `▶ 并发上传 ${uploads.length} 个产物（文件并发 ${UPLOAD_CONCURRENCY}，分片并发 4）...`
  );
  const progress = createUploadProgress(uploads);
  const failures = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploads.length) }, async () => {
      while (cursor < uploads.length) {
        const index = cursor++;
        const file = uploads[index];
        try {
          await client.putFile(
            `${DESKTOP_PREFIX}/${file.name}`,
            join(releaseDir, file.name),
            "public, max-age=31536000, immutable",
            loaded => progress.update(index, loaded)
          );
          progress.done(index);
        } catch (error) {
          progress.fail(index);
          failures.push(new Error(`上传 ${file.name} 失败: ${error?.message ?? error}`));
        }
      }
    })
  );
  progress.finish();
  if (failures.length > 0) throw failures[0];

  for (const name of latestFiles) {
    console.log(`▶ 上传 ${DESKTOP_PREFIX}/${name} ...`);
    await client.putText(
      `${DESKTOP_PREFIX}/${name}`,
      readFileSync(join(releaseDir, name), "utf8"),
      "no-cache"
    );
  }

  createVersionTag(version);

  console.log(`✔ 发布完成`);
  console.log(`  版本: ${version}`);
  console.log(`  更新源: ${target.baseUrl}/${DESKTOP_PREFIX}`);
  for (const name of latestFiles) {
    console.log(`  版本信息: ${target.baseUrl}/${DESKTOP_PREFIX}/${name}`);
  }
}

main().catch(error => {
  console.error(`✖ 发布失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
