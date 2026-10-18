import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const { parse } = createRequire(new URL("../apps/desktop/package.json", import.meta.url))("yaml");

/** 发布清单必须完整引用本次上传的产物，避免半套构建覆盖更新源。 */
export function assertReleaseArtifacts(releaseDir, version, artifacts, latestFiles) {
  for (const name of latestFiles) {
    const feed = parse(readFileSync(join(releaseDir, name), "utf8"));
    if (String(feed?.version) !== version)
      throw new Error(`${name} 的版本与发布版本 ${version} 不一致`);
    if (!Array.isArray(feed.files) || feed.files.length === 0)
      throw new Error(`${name} 缺少 files`);
    for (const file of feed.files) {
      if (
        typeof file.url !== "string" ||
        basename(file.url) !== file.url ||
        !artifacts.includes(file.url)
      ) {
        throw new Error(`${name} 引用了本次未上传的产物：${file.url}`);
      }
      const localFile = join(releaseDir, file.url);
      if (!existsSync(localFile) || !file.size || statSync(localFile).size !== file.size) {
        throw new Error(`${name} 的产物缺失或大小不一致：${file.url}`);
      }
      if (typeof file.sha512 !== "string" || !file.sha512)
        throw new Error(`${name} 缺少 SHA-512：${file.url}`);
    }
    if (!feed.files.some(file => file.url === feed.path && file.sha512 === feed.sha512)) {
      throw new Error(`${name} 的默认更新文件与 files 不一致`);
    }
    if (name === "latest-mac.yml") {
      for (const arch of ["x64", "arm64"]) {
        for (const ext of ["dmg", "zip"]) {
          const expected = `Tau-v${version}-darwin-${arch}.${ext}`;
          if (!feed.files.some(file => file.url === expected))
            throw new Error(`${name} 缺少 ${expected}`);
        }
      }
    }
  }
}
