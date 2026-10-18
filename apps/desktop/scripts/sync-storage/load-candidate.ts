import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import * as runtime from "@tau/plugins/sync";
import type { SyncProviderDefinition } from "@tau/plugins/sync";

/** 对照工具只加载命令行指定的作者构建产物，不假定作者仓库目录。 */
export async function loadAuditCandidate(file: string): Promise<SyncProviderDefinition> {
  const filename = path.resolve(file),
    code = await readFile(filename, "utf8");
  const require = createRequire(filename),
    module = { exports: {} as { default?: SyncProviderDefinition } };
  new Function("require", "module", "exports", code)(
    (name: string) => (name === "@tau/plugins/sync" ? runtime : require(name)),
    module,
    module.exports
  );
  const candidate = module.exports.default;
  if (!candidate || typeof candidate.create !== "function")
    throw new Error("请提供已按最小协议构建的同步入口");
  return candidate;
}
