import { readFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  validatePluginManifest,
  isContentPlugin,
  type DevelopmentPluginPackage,
} from "./package.ts";

type DistributionEntry = {
  artifact: string;
  id: string;
  version: string;
  files: Record<string, string>;
  sourceRevision: string;
  archiveSha256: string;
  repository: string;
  bundled?: boolean;
};

/** 产品分发只消费独立插件的固定版本快照，不导入作者源码。 */
export async function buildPluginDistribution(distribution: string, destination?: string) {
  const entries: DistributionEntry[] = JSON.parse(await readFile(distribution, "utf8"));
  const packages: DevelopmentPluginPackage[] = [];
  const copies: { source: string; id: string }[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(entry.repository ?? "") ||
      !/^[a-f0-9]{40}$/.test(entry.sourceRevision ?? "")
    )
      throw new Error("分发插件缺少有效的源码仓库或提交");
    const directory = path.dirname(distribution);
    const source = path.resolve(directory, entry.artifact);
    const relative = path.relative(directory, source);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("固定插件产物必须位于分发目录内");
    const files = await readdir(source, { withFileTypes: true });
    if (
      files.some(file => !file.isFile()) ||
      files
        .map(file => file.name)
        .sort()
        .join("\n") !== Object.keys(entry.files).sort().join("\n")
    )
      throw new Error("固定插件产物文件清单不匹配");
    if (!entry.files["manifest.json"]) throw new Error("固定插件缺少 manifest 摘要");
    for (const [file, digest] of Object.entries(entry.files)) {
      if (path.basename(file) !== file || !/^[a-f0-9]{64}$/.test(digest))
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
    if ((entry.bundled !== false && !isContentPlugin(manifest)) || ids.has(manifest.id))
      throw new Error("分发插件重复或没有静态内容贡献");
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
    if (entry.bundled !== false) copies.push({ source, id: manifest.id });
  }
  if (destination) {
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const entry of copies)
      await cp(entry.source, path.join(destination, entry.id), { recursive: true });
  }
  return packages;
}

export function compiledPluginModule(artifact: DevelopmentPluginPackage) {
  return `export default {
  manifest: ${JSON.stringify(artifact.manifest)},
  css: ${JSON.stringify(artifact.css)},
  evaluate(modules) {
    const module = { exports: {} };
    const require = id => {
      if (!Object.hasOwn(modules, id)) throw new Error('插件模块不可用：' + id);
      return modules[id];
    };
    (function(require, module, exports) {
${artifact.code}
    })(require, module, module.exports);
    return module.exports.default;
  }
};`;
}

export function portablePluginBuild(distribution: string) {
  let packages: DevelopmentPluginPackage[] = [];
  const prefix = "\0tau-plugin-package:";
  return {
    name: "tau-portable-plugin-packages",
    async buildStart() {
      packages = (await buildPluginDistribution(distribution)).filter(
        artifact => artifact.manifest.editor
      );
    },
    resolveId(id: string) {
      if (id === "virtual:tau-editor-plugins") return "\0tau-plugin-catalog";
      if (id.startsWith("virtual:tau-plugin-package:"))
        return prefix + id.slice("virtual:tau-plugin-package:".length);
      return null;
    },
    load(id: string) {
      if (id === "\0tau-plugin-catalog")
        return `export default [${packages.map((_, index) => `()=>import('virtual:tau-plugin-package:${index}').then(module=>module.default)`).join(",")}];`;
      if (id.startsWith(prefix)) {
        const artifact = packages[Number(id.slice(prefix.length))];
        if (!artifact) throw new Error("插件分发入口不存在");
        return compiledPluginModule(artifact);
      }
      return null;
    },
  };
}
