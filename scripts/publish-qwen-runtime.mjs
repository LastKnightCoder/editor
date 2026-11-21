import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { R2_PUBLIC_BASE_URL, createR2Client } from "./r2-client.mjs";

const output = fileURLToPath(new URL("../apps/desktop/release/qwen-runtime/", import.meta.url));
const source = fileURLToPath(
  new URL("../apps/desktop/src-electron/main/services/qwen/", import.meta.url)
);

async function sha256(stream) {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

const gpu = process.argv.includes("--windows-x64-gpu");
const windows = gpu || process.argv.includes("--windows-x64");
const winRelease = gpu
  ? {
      version: "0.9.5",
      backend: "vulkan",
      bytes: 85462928,
      sha256: "6c304c9a1e0cfc18b2d3b208b03d40365fec71d094ee4da4f695b2d9e7de29e8",
      upstream:
        "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.5/audio-v0.9.5-bin-windows-x64-vulkan-portable.zip",
    }
  : {
      version: "0.9.5",
      bytes: 33663926,
      sha256: "9f470c3b254205d044e91e84d609424f528734cd06b74968ab0e4868a30b839a",
      upstream:
        "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.5/audio-v0.9.5-bin-windows-x64-cpu-portable.zip",
    };

async function publish() {
  const manifest = windows
    ? winRelease
    : JSON.parse(await readFile(join(output, "bundle.json"), "utf8"));
  const sha = manifest.sha256;
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("运行包摘要无效");
  const filename = sha + (windows ? ".zip" : ".tar.gz");
  const archive = join(output, filename);
  if (windows) {
    await mkdir(output, { recursive: true });
    if ((await sha256(createReadStream(archive)).catch(() => "")) !== sha)
      execFileSync(
        "curl",
        ["--fail", "--location", "--retry", "3", "--output", archive, winRelease.upstream],
        { stdio: "inherit" }
      );
  }
  if (
    (await sha256(createReadStream(archive))) !== sha ||
    (await stat(archive)).size !== manifest.bytes ||
    (!windows &&
      (await sha256(createReadStream(join(source, "requirements.txt")))) !==
        manifest.requirementsSha256)
  )
    throw new Error("运行包或依赖校验失败");
  const prefix = windows ? "runtimes/qwen-audio-cpp/win32-x64" : "runtimes/qwen-mlx/darwin-arm64";
  const key = prefix + "/" + filename;
  const url = `${R2_PUBLIC_BASE_URL}/${key}`;
  const existing = await fetch(url + "?check=exists", { method: "HEAD" });
  if (existing.status === 404) {
    await createR2Client().putFile(key, archive, "public, max-age=31536000, immutable");
  } else if (!existing.ok) throw new Error("检查 R2 公开文件失败 HTTP " + existing.status);
  const publicFile = await fetch(url);
  if (!publicFile.ok || !publicFile.body || (await sha256(publicFile.body)) !== sha)
    throw new Error("公开下载未通过 SHA-256 校验，客户端版本未更新");
  await writeFile(
    join(
      source,
      gpu ? "bundle-win32-x64-gpu.json" : windows ? "bundle-win32-x64.json" : "bundle.json"
    ),
    JSON.stringify({ ...manifest, url }, null, 2) + "\n"
  );
  console.log(`已验证并固定客户端运行包 ${url}`);
}

publish().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
