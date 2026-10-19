import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertPluginCompatibility } from "@tau/plugins/host";
import {
  validateDistributionManifest,
  isTemplateManifest,
  DISTRIBUTION_LIMITS,
  assertPublishPath,
  type TemplateManifest,
} from "@tau/plugins/template";
import { replaceTemplatePaths } from "@tau/plugins/template-html";

export interface TemplatePackage {
  manifest: TemplateManifest;
  files: Array<{ path: string; content: Buffer }>;
}

/** 静态读取不导入或执行模板代码。返回字节快照，发布期间不重新读取作者目录。 */
export async function readTemplatePackage(
  directory: string,
  clientVersion: string
): Promise<TemplatePackage> {
  const root = await realpath(directory);
  if ((await lstat(path.join(root, "manifest.json"))).isSymbolicLink())
    throw new Error("模板清单不允许符号链接");
  const manifestText = await readFile(path.join(root, "manifest.json"), "utf8");
  const manifest = validateDistributionManifest(JSON.parse(manifestText));
  if (!isTemplateManifest(manifest)) throw new Error("所选插件没有模板产物");
  const templateRoot = manifest.template.root;
  const entries = manifest.template.entries;
  let component = root;
  for (const segment of templateRoot.split("/")) {
    component = path.join(component, segment);
    if ((await lstat(component)).isSymbolicLink()) throw new Error("模板不允许符号链接");
  }
  assertPluginCompatibility(manifest, clientVersion);
  const files: TemplatePackage["files"] = [];
  let expanded = 0;
  const seen = new Set<string>();
  async function walk(relative: string, publish = true) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error("模板不允许符号链接");
    const resolved = await realpath(absolute);
    const within = path.relative(root, resolved);
    if (!within || within.startsWith(".." + path.sep) || path.isAbsolute(within))
      throw new Error("模板路径越界");
    if (info.isDirectory()) {
      if (!publish) throw new Error("插件代码产物必须是文件");
      for (const name of (await readdir(absolute)).sort()) await walk(relative + "/" + name);
      return;
    }
    if (!info.isFile() || !manifest.integrity[relative]) throw new Error("模板含未声明文件");
    expanded += info.size;
    if (expanded > DISTRIBUTION_LIMITS.expandedBytes || files.length >= DISTRIBUTION_LIMITS.entries)
      throw new Error("模板资源大小或数量超限");
    const content = await readFile(absolute);
    if (createHash("sha256").update(content).digest("hex") !== manifest.integrity[relative])
      throw new Error("模板资源摘要错误，请完成构建后重试");
    seen.add(relative);
    if (!publish) return;
    const sitePath = relative.slice(templateRoot.length + 1);
    assertPublishPath(sitePath);
    if (/^(?:data|_tau|plugin-assets)(?:\/|$)/.test(sitePath))
      throw new Error("模板覆盖了协议资源目录");
    if (entries.includes(sitePath))
      replaceTemplatePaths(content.toString("utf8"), {
        MANIFEST: "/data/site.json",
        BASE: "/",
        CLIENT: "/_tau/client/",
      });
    files.push({ path: sitePath, content });
  }
  await walk(manifest.template.root);
  for (const name of Object.keys(manifest.integrity)) {
    if (name.startsWith(templateRoot + "/") && !seen.has(name)) throw new Error("模板资产缺失");
    if (!name.startsWith(templateRoot + "/")) await walk(name, false);
  }
  if ((await readFile(path.join(root, "manifest.json"), "utf8")) !== manifestText)
    throw new Error("模板构建仍在变化，请完成构建后重试");
  return { manifest, files };
}
