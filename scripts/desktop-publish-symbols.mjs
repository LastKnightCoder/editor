import { stat } from "node:fs/promises";
import path from "node:path";
import { readArtifactBuilds } from "./desktop-artifact-build.mjs";
import { collectSymbols } from "./desktop-symbols-archive.mjs";
import { downloadSymbols, uploadSymbols } from "./desktop-symbols-r2.mjs";

export async function publishReleaseSymbols({
  releaseDir,
  version,
  artifacts,
  symbolsRoot,
  dryRun,
  client,
}) {
  const builds = await readArtifactBuilds({ releaseDir, version, artifacts });
  const results = [];
  for (const { buildId, files } of builds) {
    const exists = await stat(path.join(symbolsRoot, buildId)).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!exists) {
      if (dryRun)
        throw new Error(`缺少本地源码映射 ${buildId}，请先使用 fetch:desktop-symbols 取回`);
      await downloadSymbols({ symbolsRoot, buildId, client });
    }
    const symbols = await collectSymbols(symbolsRoot, buildId);
    if (symbols.version !== version) throw new Error(`${buildId} 的源码映射版本与安装包不一致`);
    const uploaded = await uploadSymbols({ symbolsRoot, buildId, dryRun, client });
    results.push({ ...uploaded, artifacts: files });
  }
  return results;
}
