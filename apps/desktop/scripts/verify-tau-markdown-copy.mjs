import {
  createReadStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(root, "apps/collaboration-server/package.json"));
const Database = require("better-sqlite3");
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    out: { type: "string" },
  },
});
const settings = join(homedir(), ".editor/setting.json");
const active = existsSync(settings)
  ? JSON.parse(readFileSync(settings, "utf8")).database?.active
  : undefined;
if (!values.source && active && basename(active) !== active)
  throw new Error("请显式指定数据库绝对路径");
const sourcePath = realpathSync(values.source ?? join(homedir(), ".editor", active || "data.db"));
let directory;
if (values.out) {
  const requested = resolve(values.out);
  const parent = realpathSync(dirname(requested));
  directory = join(parent, basename(requested));
  const delta = relative(dirname(sourcePath), directory);
  if (!delta || (!delta.startsWith(".." + sep) && delta !== ".." && !isAbsolute(delta)))
    throw new Error("副本必须位于原数据库目录之外");
  if (existsSync(directory)) throw new Error("输出目录已存在，拒绝覆盖");
  mkdirSync(directory);
} else directory = mkdtempSync(join(tmpdir(), "tau-markdown-verify-"));
const copyPath = join(directory, "data-copy.db");
async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
const before = statSync(sourcePath),
  beforeHash = await hash(sourcePath);
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
if (!source.readonly) throw new Error("源数据库没有以只读方式打开");
try {
  await source.backup(copyPath);
} finally {
  source.close();
}
const copy = new Database(copyPath, { readonly: true, fileMustExist: true });
try {
  const integrity = copy.pragma("quick_check", { simple: true });
  if (integrity !== "ok") throw new Error("数据库副本完整性检查失败");
  const afterHash = await hash(sourcePath);
  const report = {
    directory,
    sourcePath,
    copyPath,
    sourceReadOnly: true,
    sourceBytes: before.size,
    sourceModifiedBefore: before.mtimeMs,
    sourceModifiedAfter: statSync(sourcePath).mtimeMs,
    sourceSha256Before: beforeHash,
    sourceSha256After: afterHash,
    sourceFileUnchanged: beforeHash === afterHash,
    integrity,
    contents: copy
      .prepare("SELECT count(*) AS n, max(length(content)) AS largest FROM content_snapshots")
      .get(),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(directory, "isolation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  copy.close();
}
