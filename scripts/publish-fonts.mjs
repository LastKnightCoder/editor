import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { R2_ENV_KEYS, R2_PUBLIC_BASE_URL, createR2Client, requiredEnv } from "./r2-client.mjs";
import {
  FONT_MANIFEST_NAME,
  FONT_PREFIX,
  READING_FONT_SOURCES,
  assertFontSources,
  buildFontManifest,
  fontFileName,
  licenseFileName,
  unchangedFontIds,
} from "./reading-fonts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "apps/mobile/release/fonts");
// 上游原始文件单独放一个目录，只作为 fonttools 的输入数据
const upstreamDir = join(outputDir, "upstream");

function printHelp() {
  console.log(`用法: pnpm publish:fonts [选项]

下载 scripts/reading-fonts.mjs 登记的上游字体（按固定 tag 与摘要核对），无损转 WOFF2，
生成移动端「正文字体」读取的 ${FONT_MANIFEST_NAME}，发布到 Cloudflare R2（${R2_PUBLIC_BASE_URL}/${FONT_PREFIX}）。
字体文件 key 带版本号、内容不可变；线上同版本同摘要的字体跳过文件上传，只重写清单。
依赖 python3 的 fonttools 与 brotli（pip install fonttools brotli）。

选项:
  --dry-run   只执行本地流程（下载、核对、转换、生成清单），不上传
  -h, --help  显示帮助

环境变量:
  R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY  上传凭据`);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function sha256Of(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** 上游文件已在本地且摘要一致时复用，否则重新下载并核对 */
async function fetchUpstream(url, target, sha256) {
  if (existsSync(target) && sha256Of(target) === sha256) return;
  console.log(`  下载 ${url}`);
  await download(url, target);
  const actual = sha256Of(target);
  if (actual !== sha256) throw new Error(`上游文件摘要不符（${actual}），拒绝发布: ${url}`);
}

function assertFontTools() {
  try {
    execFileSync("python3", ["-P", "-c", "import fontTools, brotli"], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    throw new Error("缺少 fonttools / brotli，请先执行 pip install fonttools brotli");
  }
}

// -P：不把当前目录加入 sys.path；cwd 固定为仓库根，上游字体只作为参数传入
function compressWoff2(input, output) {
  execFileSync("python3", ["-P", "-m", "fontTools.ttLib.woff2", "compress", "-o", output, input], {
    cwd: root,
    stdio: "ignore",
  });
}

async function buildFonts() {
  mkdirSync(upstreamDir, { recursive: true });
  const built = {};
  for (const source of READING_FONT_SOURCES) {
    console.log(`▶ ${source.name}（${source.id} ${source.version}）`);
    for (const file of source.files) {
      const upstream = join(upstreamDir, `${source.id}-${source.version}-${file.style}`);
      await fetchUpstream(file.url, upstream, file.sha256);
      const output = join(outputDir, fontFileName(source.id, source.version, file.style));
      console.log(`  转换 WOFF2 → ${output}`);
      compressWoff2(upstream, output);
      built[`${source.id}/${file.style}`] = {
        size: statSync(output).size,
        sha256: sha256Of(output),
      };
    }
    const license = join(upstreamDir, licenseFileName(source.id, source.version));
    await fetchUpstream(source.license.url, license, source.license.sha256);
    copyFileSync(license, join(outputDir, licenseFileName(source.id, source.version)));
  }
  return built;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun) {
    for (const key of R2_ENV_KEYS) requiredEnv(key);
  }
  assertFontSources(READING_FONT_SOURCES);
  assertFontTools();

  const manifest = buildFontManifest(READING_FONT_SOURCES, await buildFonts());
  writeFileSync(join(outputDir, FONT_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const font of manifest) {
    for (const file of font.files) {
      console.log(`  ${file.file}  ${(file.size / 1024 / 1024).toFixed(2)} MB  ${file.sha256}`);
    }
  }

  if (options.dryRun) {
    console.log(`▶ --dry-run: 本地流程全部通过，产物在 ${outputDir}，跳过上传`);
    return;
  }

  const client = createR2Client();
  const manifestKey = `${FONT_PREFIX}/${FONT_MANIFEST_NAME}`;
  const remoteText = await client.getText(manifestKey);
  const unchanged = unchangedFontIds(remoteText ? JSON.parse(remoteText) : null, manifest);

  // 先传字体与许可再写清单，保证清单指向的文件一定已存在
  for (const font of manifest) {
    if (unchanged.has(font.id)) {
      console.log(`▶ ${font.id} ${font.version} 线上已是同一内容，跳过文件上传`);
      continue;
    }
    for (const key of [...font.files.map(file => file.file), font.license]) {
      console.log(`▶ 上传 ${FONT_PREFIX}/${key} ...`);
      await client.putFile(
        `${FONT_PREFIX}/${key}`,
        join(outputDir, key),
        "public, max-age=31536000, immutable"
      );
    }
  }
  console.log(`▶ 上传 ${manifestKey} ...`);
  await client.putText(manifestKey, JSON.stringify(manifest), "no-cache");
  console.log(`✔ 发布完成: ${R2_PUBLIC_BASE_URL}/${manifestKey}`);
}

main().catch(error => {
  console.error(`✖ 发布失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
