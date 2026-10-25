import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.argv.slice(2).some(value => !["--write", "--check"].includes(value)))
  throw new Error("仅支持 --write 或 --check");
for (const name of [
  "api-support.md",
  "portability.md",
  "websocket.md",
  "content-metrics.md",
  "editor-collaboration.md",
  "whiteboard.md",
  "whiteboard-collaboration.md",
]) {
  const source = await readFile(path.join(root, "packages/plugins/docs", name), "utf8");
  const target = path.join(root, "plugins/tau-plugin-template/docs", name);
  const expected = `<!-- 由 scripts/plugins/sync-author-docs.mjs 从 packages/plugins/docs/${name} 生成，请勿单独编辑。 -->\n\n${source}`;
  if (process.argv.includes("--write")) await writeFile(target, expected);
  else if ((await readFile(target, "utf8")) !== expected)
    throw new Error("作者文档不同步，请运行 node scripts/plugins/sync-author-docs.mjs --write");
}
console.log("作者契约与 API 支持矩阵已同步");
