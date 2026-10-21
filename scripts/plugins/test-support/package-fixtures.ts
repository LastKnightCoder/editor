import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  validatePluginManifest,
  type DevelopmentPluginPackage,
} from "../../../packages/plugins/src/package.ts";

type PluginFixtureEntry = {
  artifact: string;
  id: string;
  version: string;
  files: Record<string, string>;
  sourceRevision: string;
  archiveSha256: string;
  repository: string;
};

/** 包内相对路径：/ 分隔，每段非空且不是 . 或 ..，不含反斜杠。 */
export const isPackagePath = (name: string) =>
  !name.includes("\\") && name.split("/").every(part => part && part !== "." && part !== "..");

/** 仅供测试读取固定发布包，生产构建不得依赖此目录。 */
export async function readPluginFixtures(catalogFile: string) {
  const entries: PluginFixtureEntry[] = JSON.parse(await readFile(catalogFile, "utf8"));
  const packages: DevelopmentPluginPackage[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(entry.repository ?? "") ||
      !/^[a-f0-9]{40}$/.test(entry.sourceRevision ?? "")
    )
      throw new Error("测试插件缺少有效的源码仓库或提交");
    const directory = path.dirname(catalogFile);
    const source = path.resolve(directory, entry.artifact);
    const relative = path.relative(directory, source);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("固定插件产物必须位于测试目录内");
    // 包内可有子目录（如 skills/<id>/SKILL.md），清单键为 / 分隔的相对路径
    const files = await readdir(source, { withFileTypes: true, recursive: true });
    if (
      files.some(file => !file.isFile() && !file.isDirectory()) ||
      files
        .filter(file => file.isFile())
        .map(file =>
          path.relative(source, path.join(file.parentPath, file.name)).split(path.sep).join("/")
        )
        .sort()
        .join("\n") !== Object.keys(entry.files).sort().join("\n")
    )
      throw new Error("固定插件产物文件清单不匹配");
    if (!entry.files["manifest.json"]) throw new Error("固定插件缺少 manifest 摘要");
    for (const [file, digest] of Object.entries(entry.files)) {
      if (!isPackagePath(file) || !/^[a-f0-9]{64}$/.test(digest))
        throw new Error("固定插件文件或摘要无效");
      if (
        createHash("sha256")
          .update(await readFile(path.join(source, file)))
          .digest("hex") !== digest
      )
        throw new Error(`固定插件产物摘要不匹配：${entry.id}/${file}`);
    }
    const manifest = validatePluginManifest(
      JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"))
    );
    if (manifest.id !== entry.id || manifest.version !== entry.version)
      throw new Error("固定插件身份或版本不匹配");
    if (ids.has(manifest.id)) throw new Error("测试插件重复");
    ids.add(manifest.id);
    const read = async (file: string) => {
      const data = await readFile(path.join(source, file), "utf8");
      if (createHash("sha256").update(data).digest("hex") !== manifest.integrity[file])
        throw new Error(`插件产物摘要不匹配：${manifest.id}/${file}`);
      return data;
    };
    packages.push({
      manifest,
      code: await read(manifest.main),
      css: manifest.styles ? await read(manifest.styles) : undefined,
    });
  }
  return packages;
}
