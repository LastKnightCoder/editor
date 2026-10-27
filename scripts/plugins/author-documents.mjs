import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** 契约页只从 SDK 维护源生成，模板副本和发行归档使用相同内容。 */
export async function readAuthorDocuments() {
  const directory = path.join(root, "packages/plugins/docs");
  const names = (await readdir(directory)).filter(name => name.endsWith(".md")).sort();
  return new Map(
    await Promise.all(
      names.map(async name => [
        name,
        `<!-- 由 scripts/plugins/sync-author-docs.mjs 从 packages/plugins/docs/${name} 生成，请勿单独编辑。 -->\n\n${await readFile(path.join(directory, name), "utf8")}`,
      ])
    )
  );
}
