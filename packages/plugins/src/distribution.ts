import { readFile, mkdir, cp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  validatePluginManifest,
  isContentPlugin,
  type DevelopmentPluginPackage,
} from "./package.ts";

/** 产品分发清单只指向插件项目；构建后只消费产物，不导入项目源码。 */
export async function buildPluginDistribution(distribution: string, destination?: string) {
  const entries: { directory: string; build: string; artifact: string }[] = JSON.parse(
    await readFile(distribution, "utf8")
  );
  const packages: DevelopmentPluginPackage[] = [];
  const copies: { source: string; id: string }[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const directory = path.resolve(path.dirname(distribution), entry.directory);
    await promisify(execFile)(process.execPath, [entry.build], { cwd: directory });
    const source = path.resolve(directory, entry.artifact);
    const manifest = validatePluginManifest(
      JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"))
    );
    if (!isContentPlugin(manifest) || ids.has(manifest.id))
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
    copies.push({ source, id: manifest.id });
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
      packages = await buildPluginDistribution(distribution);
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
