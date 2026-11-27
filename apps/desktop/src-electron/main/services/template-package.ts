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
  type TemplateI18nResources,
  readTemplateI18nResources,
} from "@tau/plugins/template";
import { replaceTemplatePaths } from "@tau/plugins/template-html";

export interface TemplatePackage {
  manifest: TemplateManifest;
  messages?: TemplateI18nResources;
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
  const dictionaryPaths = new Set(
    Object.values(manifest.template.i18n?.resources ?? {}).map(file => templateRoot + "/" + file)
  );
  const dictionaries = new Map<string, unknown>();
  async function walk(relative: string) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error("模板不允许符号链接");
    const resolved = await realpath(absolute);
    const within = path.relative(root, resolved);
    if (!within || within.startsWith(".." + path.sep) || path.isAbsolute(within))
      throw new Error("模板路径越界");
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await walk(relative + "/" + name);
      return;
    }
    if (!info.isFile()) throw new Error("模板资源必须为普通文件");
    if (!manifest.integrity[relative]) return;
    expanded += info.size;
    if (expanded > DISTRIBUTION_LIMITS.expandedBytes || seen.size >= DISTRIBUTION_LIMITS.entries)
      throw new Error("模板资源大小或数量超限");
    const content = await readFile(absolute);
    if (createHash("sha256").update(content).digest("hex") !== manifest.integrity[relative])
      throw new Error("模板资源摘要错误，请完成构建后重试");
    seen.add(relative);
    const sitePath = relative.slice(templateRoot.length + 1);
    assertPublishPath(sitePath);
    if (/^(?:data|_tau|plugin-assets)(?:\/|$)/.test(sitePath))
      throw new Error("模板覆盖了协议资源目录");
    if (dictionaryPaths.has(relative)) {
      dictionaries.set(relative, JSON.parse(content.toString("utf8")));
      return;
    }
    if (entries.includes(sitePath))
      replaceTemplatePaths(content.toString("utf8"), {
        MANIFEST: "/data/site.json",
        BASE: "/",
      });
    files.push({ path: sitePath, content });
  }
  await walk(manifest.template.root);
  for (const name of Object.keys(manifest.integrity))
    if (!seen.has(name)) throw new Error("模板资产缺失");
  if ((await readFile(path.join(root, "manifest.json"), "utf8")) !== manifestText)
    throw new Error("模板构建仍在变化，请完成构建后重试");
  const declaration = manifest.template.i18n;
  const messages = declaration
    ? readTemplateI18nResources(
        declaration,
        Object.fromEntries(
          Object.entries(declaration.resources).map(([locale, file]) => {
            const dictionary = dictionaries.get(templateRoot + "/" + file);
            if (!dictionaries.has(templateRoot + "/" + file)) throw new Error("模板词典缺失");
            return [locale, dictionary];
          })
        ),
        manifest.template.siteFields
      )
    : undefined;
  return { manifest, files, ...(messages ? { messages } : {}) };
}
