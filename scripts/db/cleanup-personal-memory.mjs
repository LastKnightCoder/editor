#!/usr/bin/env node
import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const desktopRequire = createRequire(new URL("../../apps/desktop/package.json", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const hasTable = (db, name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const personal =
  /(?:^|[，。；：\s])(?:我|本人|用户)(?:的|在|是|有|不|正|想|要|希望|计划|喜欢|偏好|习惯|最近|目前|倾向)|(?:用户|本人)的(?:偏好|兴趣|习惯|目标|职业)/u;

function libraryIdentity(db) {
  if (!hasTable(db, "cards") || !hasTable(db, "library_identity"))
    throw new Error("指定文件不是当前资料库");
  return db.prepare("SELECT source_id FROM library_identity WHERE id=1").get()?.source_id ?? "";
}

function assertMemoryScope(db, identity, birth) {
  if (!["memory", "evidence", "meta"].every(table => hasTable(db, table)))
    throw new Error("指定文件不是个人助手记忆库");
  const recorded = db.prepare("SELECT value FROM meta WHERE key='library-source'").get()?.value;
  const recordedBirth = db.prepare("SELECT value FROM meta WHERE key='library-birth'").get()?.value;
  if (!(identity && recorded === identity) && !(recordedBirth === birth && !recorded))
    throw new Error("记忆库与资料库身份不匹配，未做修改");
}

export function locateMemoryFile(libraryPath) {
  const library = realpathSync(libraryPath);
  const db = new DatabaseSync(library, { readOnly: true });
  try {
    const identity = libraryIdentity(db);
    const birth = String(statSync(library).birthtimeMs);
    const names = [basename(library), basename(library).replace(/\.db$/i, "")];
    const candidates = [
      ...new Set(names.flatMap(name => [name, name + "\0" + (identity || birth)])),
    ]
      .map(name => join(dirname(library), "assistant-memory", hash(name) + ".sqlite"))
      .filter(existsSync)
      .filter(path => {
        const memory = new DatabaseSync(path, { readOnly: true });
        try {
          assertMemoryScope(memory, identity, birth);
          return true;
        } catch {
          return false;
        } finally {
          memory.close();
        }
      });
    if (candidates.length !== 1)
      throw new Error(
        candidates.length
          ? "找到多个匹配的记忆库，请用 --memory 明确指定"
          : "未找到对应记忆库，请用 --memory 明确指定"
      );
    return candidates[0];
  } finally {
    db.close();
  }
}

function cleanupPlan(memory, library, ids) {
  const cardContents = new Set(
    library
      .prepare("SELECT DISTINCT content_id FROM cards WHERE content_id IS NOT NULL")
      .all()
      .map(row => String(row.content_id))
  );
  const rows = memory
    .prepare(`SELECT id,kind,topic,text FROM memory m WHERE manual=0
    AND EXISTS(SELECT 1 FROM evidence e WHERE e.memory_id=m.id)
    AND NOT EXISTS(SELECT 1 FROM evidence e WHERE e.memory_id=m.id AND e.kind<>'content')
    ORDER BY id`)
    .all();
  const cardOnly = rows.filter(row => {
    const refs = memory.prepare("SELECT source_id FROM evidence WHERE memory_id=?").all(row.id);
    return refs.every(ref => cardContents.has(ref.source_id));
  });
  const candidates = cardOnly.filter(row => row.kind === "fact" && !personal.test(row.text));
  const candidateIds = new Set(candidates.map(row => row.id));
  const ambiguous = cardOnly.filter(row => !candidateIds.has(row.id));
  let selected = candidates;
  if (ids) {
    const allowed = new Map(cardOnly.map(row => [row.id, row]));
    if (ids.some(id => !allowed.has(id)))
      throw new Error("--ids 只能指定无手动更正、且证据全部来自卡片正文的记忆");
    selected = ids.map(id => allowed.get(id));
  }
  return { selected, ambiguous };
}

export async function cleanupPersonalMemory({ libraryPath, memoryPath, apply = false, ids }) {
  const libraryFile = realpathSync(libraryPath);
  const memoryFile = realpathSync(memoryPath ?? locateMemoryFile(libraryFile));
  if (libraryFile === memoryFile) throw new Error("资料库与记忆库不能是同一文件");
  const library = new DatabaseSync(libraryFile, { readOnly: true });
  const memory = new DatabaseSync(memoryFile, { readOnly: !apply, allowExtension: apply });
  let backupPath;
  try {
    memory.exec("PRAGMA busy_timeout=5000");
    if (apply) memory.exec("PRAGMA foreign_keys=ON");
    assertMemoryScope(memory, libraryIdentity(library), String(statSync(libraryFile).birthtimeMs));
    const plan = cleanupPlan(memory, library, ids);
    const result = {
      libraryPath: libraryFile,
      memoryPath: memoryFile,
      status: apply ? "unchanged" : "preview",
      selectedCount: plan.selected.length,
      ambiguousCount: plan.ambiguous.length,
      selected: plan.selected.slice(0, 20),
      ambiguous: plan.ambiguous.slice(0, 20),
    };
    if (!apply || !plan.selected.length) return result;
    const memoryVersion = memory.prepare("PRAGMA data_version").get().data_version;
    const libraryVersion = library.prepare("PRAGMA data_version").get().data_version;
    if (hasTable(memory, "memory_vec"))
      memory.loadExtension(desktopRequire("sqlite-vec").getLoadablePath());
    const checks = memory.prepare("PRAGMA quick_check").all();
    if (checks.length !== 1 || checks[0].quick_check !== "ok")
      throw new Error("记忆库完整性检查失败，未删除数据");
    const backupRoot = join(dirname(memoryFile), "backup");
    mkdirSync(backupRoot, { recursive: true });
    const backupDir = mkdtempSync(join(backupRoot, "personal-memory-cleanup-"));
    backupPath = join(backupDir, basename(memoryFile));
    await backup(memory, backupPath);
    chmodSync(backupPath, 0o600);
    memory.exec("BEGIN IMMEDIATE");
    try {
      if (
        memory.prepare("PRAGMA data_version").get().data_version !== memoryVersion ||
        library.prepare("PRAGMA data_version").get().data_version !== libraryVersion
      )
        throw new Error("备份期间数据库发生变化，请完全退出 Tau 后重试");
      for (const row of plan.selected) {
        const refs = memory
          .prepare("SELECT source_id FROM evidence WHERE memory_id=? AND kind='content'")
          .all(row.id);
        if (hasTable(memory, "memory_model_evidence"))
          memory
            .prepare(
              "DELETE FROM memory_model WHERE id IN (SELECT model_id FROM memory_model_evidence WHERE memory_id=?)"
            )
            .run(row.id);
        if (hasTable(memory, "memory_vec"))
          memory.prepare("DELETE FROM memory_vec WHERE rowid=?").run(BigInt(row.id));
        if (hasTable(memory, "memory_embedding"))
          memory.prepare("DELETE FROM memory_embedding WHERE memory_id=?").run(row.id);
        memory.prepare("DELETE FROM evidence WHERE memory_id=?").run(row.id);
        if (hasTable(memory, "memory_search"))
          memory.prepare("DELETE FROM memory_search WHERE rowid=?").run(row.id);
        memory.prepare("DELETE FROM memory WHERE id=?").run(row.id);
        if (hasTable(memory, "progress"))
          for (const ref of refs)
            memory
              .prepare("DELETE FROM progress WHERE kind='content' AND source_id=?")
              .run(ref.source_id);
      }
      memory.prepare("DELETE FROM meta WHERE key='scan:content'").run();
      memory
        .prepare(
          "INSERT INTO meta(key,value) VALUES('dirty-at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        )
        .run(String(Date.now()));
      if (memory.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("删除后引用检查失败，已回滚");
      memory.exec("COMMIT");
    } catch (error) {
      memory.exec("ROLLBACK");
      throw error;
    }
    return { ...result, status: "cleaned", backupPath };
  } catch (error) {
    throw new Error(`${error.message}${backupPath ? `；备份：${backupPath}` : ""}`, {
      cause: error,
    });
  } finally {
    memory.close();
    library.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        library: { type: "string" },
        memory: { type: "string" },
        ids: { type: "string" },
        apply: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
    if (values.help || !values.library) {
      console.log(
        "用法：node scripts/db/cleanup-personal-memory.mjs --library <资料库.db> [--memory <记忆.sqlite>] [--apply] [--ids 1,2]\n默认只预览前 20 项及总数；--apply 在备份后删除仅由卡片正文支持、且没有明显个人表述的自动 fact。个人表述和其他类别列为不确定项，仅能用 --ids 明确选择。执行前完全退出 Tau。原始卡片和资料库始终只读。"
      );
      if (!values.help) process.exitCode = 1;
    } else {
      const ids = values.ids?.split(",").map(Number);
      if (ids?.some(id => !Number.isSafeInteger(id) || id <= 0))
        throw new Error("--ids 必须是正整数列表");
      console.log(
        JSON.stringify(
          await cleanupPersonalMemory({
            libraryPath: values.library,
            memoryPath: values.memory,
            apply: values.apply,
            ids: ids ? [...new Set(ids)] : undefined,
          }),
          null,
          2
        )
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
