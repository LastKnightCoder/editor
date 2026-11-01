import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { documentChecksum, validDocumentRecord } from "./record-integrity";
import { ensureLocalGeneration } from "./local-generation";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import DEVICE_SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import {
  checkDeviceDatabase,
  assertDeviceDamage,
  parseDeviceState,
  recoverDeviceDatabase,
  removeDeviceTriggers,
} from "./recovery";
import {
  syncCaptureSql,
  syncTableOrder,
  quoteSyncIdentifier as quote,
  type SyncTable,
} from "@tau/collaboration/src/device-sync/sql";
import {
  DEVICE_SYNC_HISTORY_LIMIT,
  type DeviceCommit,
  type DeviceDocument,
  type DeviceState,
  type DeviceStorage,
  type DeviceView,
  type PreparedDeviceDocument,
  type Row,
  type RowChange,
  type SqlValue,
} from "@tau/collaboration/src/device-sync/protocol";

const internal = (name: string) => name.startsWith("_tau_device_");
const encodeCell = (value: unknown): SqlValue => {
  if (typeof value === "bigint") return { $integer: value.toString() };
  if (value instanceof Uint8Array)
    return { $blob: Buffer.from(value).toString("hex").toUpperCase() };
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("DEVICE_SYNC_VALUE: 暂不支持非有限 SQLite 数字，原始数据已保留");
  return value as SqlValue;
};
const encode = (row: Record<string, unknown>): Row =>
  Object.fromEntries(Object.entries(row).map(([name, value]) => [name, encodeCell(value)]));
const decode = (value: SqlValue) =>
  value && typeof value === "object"
    ? "$integer" in value
      ? BigInt(value.$integer)
      : Buffer.from(value.$blob, "hex")
    : value;
export function deviceSyncTables(db: Database.Database): SyncTable[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[]
  )
    .filter(({ name }) => !internal(name))
    .map(({ name }) => {
      const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all() as {
        name: string;
        pk: number;
        notnull: number;
      }[];
      let key = columns
        .filter(column => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map(column => column.name);
      if (!key.length) {
        for (const index of db.prepare(`PRAGMA index_list(${quote(name)})`).all() as {
          name: string;
          unique: number;
          partial: number;
        }[]) {
          if (!index.unique || index.partial) continue;
          const candidate = (
            db.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as { name: string }[]
          ).map(column => column.name);
          if (
            candidate.length &&
            candidate.every(name => columns.some(column => column.name === name && column.notnull))
          ) {
            key = candidate;
            break;
          }
        }
      }
      if (!key.length) throw new Error(`DEVICE_SYNC_SCHEMA_KEY: 表 ${name} 缺少稳定键`);
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as {
        id: number;
        table: string;
        from: string;
        to: string;
        seq: number;
      }[];
      return {
        name,
        key,
        columns: columns.map(column => column.name),
        parents: foreignKeys.map(row => row.table),
        references: foreignKeys
          .filter(
            row => row.to === "id" && foreignKeys.filter(other => other.id === row.id).length === 1
          )
          .map(row => ({ column: row.from, table: row.table })),
      };
    });
}
function installDeviceSyncDatabase(db: Database.Database, sql: string) {
  ensureLocalGeneration(db);
  db.exec(sql);
  if (!db.prepare("SELECT 1 FROM _tau_device_state WHERE id=1").get()) return;
  const tables = deviceSyncTables(db);
  for (const table of [
    ...tables,
    { name: "_tau_device_documents", columns: [], key: ["content_id"], parents: [] },
  ])
    db.exec(syncCaptureSql(table));
}
export function recoverDeviceSyncDatabase(db: Database.Database, contentId?: number) {
  recoverDeviceDatabase(db, () => installDeviceSyncDatabase(db, DEVICE_SQL), contentId);
}
/** 仅在已保存并备份资料库的独立候选文件上清理同步会话。 */
export function resetDeviceSyncDatabase(db: Database.Database) {
  db.transaction(() => {
    removeDeviceTriggers(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*'")
      .all() as { name: string }[];
    for (const { name } of tables) db.exec(`DROP TABLE ${quote(name)}`);
    installDeviceSyncDatabase(db, DEVICE_SQL);
    db.prepare("UPDATE _tau_device_local SET generation=? WHERE id=1").run(randomUUID());
  })();
}
export function deviceGeneration(db: Database.Database): string {
  return ensureLocalGeneration(db);
}
export function ensureDeviceSyncHealthy(db: Database.Database) {
  try {
    checkDeviceDatabase(db);
  } catch (error) {
    assertDeviceDamage(error);
    recoverDeviceSyncDatabase(db);
  }
  compactDeviceProjectionLog(db);
}
export function initializeDeviceSyncDatabase(db: Database.Database, sql: string) {
  try {
    const old = db
      .prepare("SELECT sql FROM sqlite_master WHERE name='_tau_device_json_content'")
      .get() as { sql: string } | undefined;
    if (old && !old.sql.includes("json_valid")) removeDeviceTriggers(db);
    installDeviceSyncDatabase(db, sql);
    checkDeviceDatabase(db);
  } catch (error) {
    assertDeviceDamage(error);
    recoverDeviceSyncDatabase(db);
  }
}
export function readDeviceSyncState(db: Database.Database): DeviceState | null {
  try {
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='_tau_device_state' AND type='table'")
        .get()
    )
      return null;
    const row = db.prepare("SELECT payload FROM _tau_device_state WHERE id=1").get() as
      | { payload: string }
      | undefined;
    return row ? parseDeviceState(row.payload) : null;
  } catch (error) {
    assertDeviceDamage(error);
    recoverDeviceSyncDatabase(db);
    return readDeviceSyncState(db);
  }
}
export function deviceDocument(db: Database.Database, contentId: number): DeviceDocument | null {
  try {
    const row = db
      .prepare("SELECT * FROM _tau_device_documents WHERE content_id=?")
      .get(contentId) as Record<string, any> | undefined;
    if (row && !validDocumentRecord(row))
      throw new Error("DEVICE_SYNC_DAMAGED: 正文检查点校验失败");
    const entry = row
      ? {
          contentId,
          documentId: row.document_id,
          baselineId: row.baseline_id,
          epoch: row.epoch,
          state: row.state,
          paths: JSON.parse(row.paths),
          updatedAt: row.updated_at,
          metricRules: JSON.parse(row.metric_rules),
        }
      : null;
    return entry;
  } catch (error) {
    assertDeviceDamage(error);
    recoverDeviceSyncDatabase(db, contentId);
    return null;
  }
}
export function writeDeviceDocument(db: Database.Database, document: DeviceDocument) {
  const before = deviceDocument(db, document.contentId);
  if (before && canonicalContractJson(before) === canonicalContractJson(document)) return;
  if (
    before &&
    (before.documentId !== document.documentId ||
      before.baselineId !== document.baselineId ||
      before.epoch !== document.epoch)
  )
    throw new Error("DEVICE_SYNC_BASELINE_CHANGED: 正文基线已变化");
  const values = [
    document.contentId,
    document.documentId,
    document.baselineId,
    document.epoch,
    document.state,
    JSON.stringify(document.paths),
    document.updatedAt,
    JSON.stringify(document.metricRules ?? []),
  ];
  db.prepare(
    "INSERT INTO _tau_device_documents VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(content_id) DO UPDATE SET state=excluded.state,paths=excluded.paths,updated_at=excluded.updated_at,metric_rules=excluded.metric_rules,checksum=excluded.checksum"
  ).run(...values, documentChecksum(values));
}
function withDeviceApplying<T>(db: Database.Database, mode: number, work: () => T): T {
  return db.transaction(() => {
    const before =
      (
        db.prepare("SELECT applying FROM _tau_device_state WHERE id=1").get() as
          | { applying: number }
          | undefined
      )?.applying ?? 0;
    db.prepare("UPDATE _tau_device_state SET applying=? WHERE id=1").run(mode);
    try {
      return work();
    } finally {
      if (db.inTransaction) {
        db.prepare("UPDATE _tau_device_state SET applying=? WHERE id=1").run(before);
        if (mode >= 2) compactDeviceProjectionLog(db);
      }
    }
  })();
}
export const withDeviceProjection = <T>(db: Database.Database, work: () => T) =>
  withDeviceApplying(db, 2, work);
export const withDeviceJsonProjection = <T>(db: Database.Database, work: () => T) =>
  withDeviceApplying(db, 3, work);
function deleteDeviceLogs(db: Database.Database, sql: string, ...parameters: unknown[]) {
  const removed = db.prepare(sql).run(...parameters).changes;
  db.prepare("UPDATE _tau_device_state SET pending_count=pending_count-? WHERE id=1").run(removed);
}
export function compactDeviceProjectionLog(db: Database.Database) {
  const row = db
    .prepare("SELECT payload,projection_bytes,metadata_bytes FROM _tau_device_state WHERE id=1")
    .get() as { payload: string; projection_bytes: number; metadata_bytes: number } | undefined;
  if (row && Math.max(row.projection_bytes, row.metadata_bytes) > 8 * 1024 * 1024) {
    const state = JSON.parse(row.payload);
    state.requiresSnapshot = true;
    const metadata = row.metadata_bytes > 8 * 1024 * 1024;
    if (metadata) state.recovering = true;
    db.prepare(
      `UPDATE _tau_device_state SET payload=?,projection_bytes=0${metadata ? ",metadata_bytes=0" : ""} WHERE id=1`
    ).run(JSON.stringify(state));
    deleteDeviceLogs(
      db,
      metadata ? "DELETE FROM _tau_device_log" : "DELETE FROM _tau_device_log WHERE phase=1"
    );
  }
  deleteDeviceLogs(
    db,
    "DELETE FROM _tau_device_log WHERE table_name='_document' AND integrity=json_array(seq,table_name,row_key||'',before_json||'',after_json||'',phase) AND seq NOT IN (SELECT max(seq) FROM _tau_device_log WHERE table_name='_document' GROUP BY row_key)"
  );
}
interface LoggedChange {
  table_name: string;
  row_key: string;
  before_json: string | null;
  after_json: string | null;
  phase: number;
}
const decodeChange = (row: LoggedChange): RowChange => ({
  table: row.table_name,
  key: JSON.parse(row.row_key),
  before: row.before_json ? JSON.parse(row.before_json) : null,
  after: row.after_json ? JSON.parse(row.after_json) : null,
});

export class DeviceDatabaseStore implements DeviceStorage {
  private readonly tables: SyncTable[];
  private readonly statements = new Map<string, Database.Statement>();
  private statement(sql: string) {
    const existing = this.statements.get(sql);
    if (existing) return existing;
    const statement = this.db.prepare(sql);
    this.statements.set(sql, statement);
    if (this.statements.size > 256) this.statements.delete(this.statements.keys().next().value!);
    return statement;
  }
  constructor(
    readonly db: Database.Database,
    private readonly project: (
      document: PreparedDeviceDocument,
      options?: { replica: boolean; audit?: boolean }
    ) => void,
    private readonly guard?: (plan: DeviceCommit) => Promise<(committed: boolean) => void>
  ) {
    this.tables = syncTableOrder(deviceSyncTables(db));
  }
  async loadDocuments(ids: number[]) {
    return this.db.transaction(() =>
      ids
        .map(id => {
          const entry = deviceDocument(this.db, id);
          return entry
            ? {
                ...entry,
                ...(!this.db
                  .prepare("SELECT 1 FROM contents WHERE id=? AND coalesce(ref_count,0)>0")
                  .get(id)
                  ? { deleted: true }
                  : {}),
              }
            : null;
        })
        .filter((entry): entry is DeviceDocument => !!entry)
    )();
  }
  async replacementBase(remote: DeviceState, sourceSequence: number) {
    initializeDeviceSyncDatabase(this.db, DEVICE_SQL);
    const state = readDeviceSyncState(this.db);
    if (!state || state.library !== remote.library || state.schema !== remote.schema)
      throw new Error("DEVICE_SYNC_IDENTITY: 覆盖目标不同");
    const current = Number(
      (
        this.db.prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'").get() as
          | { seq: number }
          | undefined
      )?.seq ?? 0
    );
    const sequence = Math.max(current, sourceSequence);
    this.db.prepare("DELETE FROM sqlite_sequence WHERE name='_tau_device_log'").run();
    this.db
      .prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?)")
      .run(BigInt(sequence));
    return { state, sequence, generation: deviceGeneration(this.db) };
  }
  async read(snapshot = false): Promise<DeviceView> {
    ensureDeviceSyncHealthy(this.db);
    const view = this.db.transaction(() => {
      const state = readDeviceSyncState(this.db);
      if (!state) throw new Error("DEVICE_SYNC_DISABLED: 当前资料库未配对");
      const schema = this.db
        .prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'")
        .get() as { value: string } | undefined;
      if (schema && schema.value !== state.schema)
        throw new Error("DEVICE_SYNC_SCHEMA: 主库结构已升级，需在两端更新并建立新的同步基线");
      if (this.db.prepare("SELECT 1 FROM _tau_device_json_intents LIMIT 1").get())
        throw new Error("DEVICE_SYNC_RETRY: 正文业务修改尚待转换");
      if (
        this.db
          .prepare(
            "SELECT 1 FROM contents c JOIN content_documents d ON d.content_id=c.id LEFT JOIN _tau_device_documents s ON s.content_id=c.id WHERE s.content_id IS NULL LIMIT 1"
          )
          .get()
      )
        throw new Error("DEVICE_SYNC_RETRY: 新正文的共享基线尚未保存");
      const sequence = Number(
        (
          this.db.prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'").get() as
            | { seq: number }
            | undefined
        )?.seq ?? 0
      );
      const bytes = (
        this.db.prepare("SELECT projection_bytes FROM _tau_device_state WHERE id=1").get() as {
          projection_bytes: number;
        }
      ).projection_bytes;
      const forceSnapshot = Boolean(state.requiresSnapshot || bytes > 8 * 1024 * 1024);
      const log = this.db
        .prepare(
          "SELECT * FROM _tau_device_log WHERE seq>? AND table_name NOT IN ('_document','_json') AND (?=0 OR phase=0) ORDER BY seq"
        )
        .all(state.ackSeq, forceSnapshot ? 1 : 0) as LoggedChange[];
      const documentIds = new Set(
        (
          this.db
            .prepare(
              "SELECT DISTINCT json_extract(row_key,'$[0]') AS id FROM _tau_device_log WHERE seq>? AND table_name='_document'"
            )
            .all(state.ackSeq) as { id: number }[]
        ).map(row => row.id)
      );
      if (forceSnapshot)
        for (const row of this.db.prepare("SELECT content_id FROM _tau_device_documents").all() as {
          content_id: number;
        }[])
          documentIds.add(row.content_id);
      const documents = [...documentIds]
        .map(id => deviceDocument(this.db, id))
        .filter((entry): entry is DeviceDocument => !!entry);
      const allDocuments = snapshot
        ? (
            this.db
              .prepare("SELECT content_id FROM _tau_device_documents ORDER BY content_id")
              .all() as { content_id: number }[]
          ).map(row => deviceDocument(this.db, row.content_id)!)
        : [];
      return {
        ...(snapshot ? { tables: this.tables } : {}),
        state,
        generation: deviceGeneration(this.db),
        sequence,
        documents,
        forceSnapshot,
        allChanges: log.map(decodeChange),
        changes: log.filter(row => row.phase === 0).map(decodeChange),
        history: (
          this.db.prepare("SELECT payload FROM _tau_device_history ORDER BY ordinal").all() as {
            payload: string;
          }[]
        ).map(row => JSON.parse(row.payload)),
        receipts: Object.fromEntries(
          (
            this.db
              .prepare("SELECT node,sequence,fingerprint,outcome FROM _tau_device_receipts")
              .all() as { node: string; sequence: number; fingerprint: string; outcome: string }[]
          ).map(row => [
            row.node,
            {
              sequence: row.sequence,
              fingerprint: row.fingerprint,
              outcome: JSON.parse(row.outcome),
            },
          ])
        ),
        ...(snapshot
          ? {
              snapshot: {
                documents: allDocuments,
                rows: Object.fromEntries(
                  this.tables.map(table => [
                    table.name,
                    (
                      this.db
                        .prepare(
                          `SELECT * FROM ${quote(table.name)} ORDER BY ${table.key.map(quote).join(",")}`
                        )
                        .safeIntegers(true)
                        .all() as Record<string, unknown>[]
                    ).map(encode),
                  ])
                ),
              },
            }
          : {}),
      };
    })();
    if (readDeviceSyncState(this.db)?.head !== view.state.head)
      throw new Error("DEVICE_SYNC_RETRY: 辅助状态已恢复，重新读取");
    return view;
  }
  private writeRow(table: SyncTable, row: Row) {
    if (
      canonicalContractJson(Object.keys(row).sort()) !==
      canonicalContractJson([...table.columns].sort())
    )
      throw new Error("DEVICE_SYNC_COLUMNS: 行字段与本机结构不同");
    const updates = table.columns
      .filter(column => !table.key.includes(column))
      .map(column => `${quote(column)}=excluded.${quote(column)}`)
      .join(",");
    try {
      this.statement(
        `INSERT INTO ${quote(table.name)}(${table.columns.map(quote).join(",")}) VALUES(${table.columns.map(() => "?").join(",")}) ON CONFLICT(${table.key.map(quote).join(",")}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`
      ).run(...table.columns.map(column => decode(row[column])));
    } catch (error) {
      if (
        ["SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY"].includes(
          (error as { code?: string }).code ?? ""
        )
      )
        throw new Error(`DEVICE_SYNC_UNIQUE: 表 ${table.name} 的唯一约束冲突`, { cause: error });
      throw error;
    }
  }
  private apply(change: RowChange) {
    const table = this.tables.find(table => table.name === change.table);
    if (!table || table.key.length !== change.key.length)
      throw new Error("DEVICE_SYNC_TABLE: 同步表或主键无效");
    if (change.key.some(value => value === null))
      throw new Error("DEVICE_SYNC_ROW_KEY: 暂不支持含空值的记录主键，原始数据已保留");
    const where = table.key.map(column => `${quote(column)} IS ?`).join(" AND ");
    const actual = this.statement(`SELECT * FROM ${quote(table.name)} WHERE ${where}`)
      .safeIntegers(true)
      .get(...change.key.map(decode)) as Record<string, unknown> | undefined;
    const managed =
      actual &&
      ["contents", "content_documents"].includes(table.name) &&
      deviceDocument(this.db, Number(decode(change.key[0])));
    const normalize = (row: Row | null) => {
      if (!managed || !row) return row;
      const result = { ...row };
      for (const key of table.name === "contents"
        ? ["content", "count", "update_time"]
        : ["contracts", "revision"])
        result[key] = null;
      return result;
    };
    if (
      canonicalContractJson(normalize(actual ? encode(actual) : null)) !==
      canonicalContractJson(normalize(change.before))
    ) {
      if (!actual && !change.after) return;
      throw new Error("DEVICE_SYNC_PREIMAGE: 本机行已变化，不能重放旧事务");
    }
    if (change.after) {
      const row = { ...change.after };
      if (managed)
        for (const key of table.name === "contents"
          ? ["content", "count", "update_time"]
          : ["contracts", "revision"])
          row[key] = encode(actual!)[key];
      this.writeRow(table, row);
    } else
      this.db
        .prepare(`DELETE FROM ${quote(table.name)} WHERE ${where}`)
        .run(...change.key.map(decode));
  }
  async commit(plan: DeviceCommit): Promise<void> {
    const release = await this.guard?.(plan);
    let committed = false;
    let previousTimeout: number | undefined;
    try {
      previousTimeout = this.db.pragma("busy_timeout", { simple: true }) as number;
      this.db.pragma("busy_timeout=25");
      this.db.transaction(() => {
        const state = readDeviceSyncState(this.db)!;
        const sequence = Number(
          (
            this.db
              .prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'")
              .get() as { seq: number } | undefined
          )?.seq ?? 0
        );
        if (sequence !== plan.expectedSequence || state.head !== plan.expectedHead)
          throw new Error("DEVICE_SYNC_RETRY: 本机已变化");
        plan.assertActive?.();
        if (
          plan.expectedGeneration !== undefined &&
          plan.expectedGeneration !== deviceGeneration(this.db)
        )
          throw new Error("DEVICE_SYNC_REPLACED: 本机资料库已重新下载");
        if (plan.replaceLocal) {
          if (!plan.snapshot || !plan.generation)
            throw new Error("DEVICE_SYNC_REPLACE: 缺少覆盖快照");
          this.db.prepare("UPDATE _tau_device_state SET applying=1 WHERE id=1").run();
          for (const { name } of this.db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' AND name NOT IN ('_tau_device_state','_tau_device_local')"
            )
            .all() as { name: string }[])
            this.db.exec(
              name.startsWith("_tau_device_quarantine_")
                ? `DROP TABLE ${quote(name)}`
                : `DELETE FROM ${quote(name)}`
            );
          this.db
            .prepare("UPDATE _tau_device_local SET generation=? WHERE id=1")
            .run(plan.generation);
          this.db.exec("UPDATE _tau_device_state SET pending_count=0 WHERE id=1");
        }
        const existingDocuments = new Set(
          (plan.documents ?? [])
            .filter(document => deviceDocument(this.db, document.contentId))
            .map(document => document.contentId)
        );
        this.db.pragma("defer_foreign_keys = ON");
        const triggers = this.db
          .prepare(
            "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE '_tau_device_%'"
          )
          .all() as { name: string; sql: string }[];
        this.db.prepare("UPDATE _tau_device_state SET applying=1 WHERE id=1").run();
        triggers.forEach(trigger => this.db.exec(`DROP TRIGGER ${quote(trigger.name)}`));
        let restored = false;
        const restore = () => {
          if (!restored) {
            triggers.forEach(trigger => this.db.exec(trigger.sql));
            restored = true;
          }
        };
        try {
          if (plan.branch)
            this.db
              .prepare("INSERT OR IGNORE INTO _tau_device_branches VALUES (?,?,?)")
              .run(plan.branch.id, plan.branch.reason, JSON.stringify(plan.branch.snapshot));
          if (plan.snapshot) {
            if (
              canonicalContractJson(Object.keys(plan.snapshot.rows).sort()) !==
              canonicalContractJson(this.tables.map(table => table.name).sort())
            )
              throw new Error("DEVICE_SYNC_SNAPSHOT_TABLES: 快照表不完整");
            for (const table of [...this.tables].reverse())
              this.db.exec(`DELETE FROM ${quote(table.name)}`);
            for (const table of this.tables)
              for (const row of plan.snapshot.rows[table.name]) this.writeRow(table, row);
            this.db.exec("DELETE FROM _tau_device_documents");
            for (const entry of plan.snapshot.documents) writeDeviceDocument(this.db, entry);
          } else {
            for (const document of plan.documents ?? [])
              if (!deviceDocument(this.db, document.contentId))
                writeDeviceDocument(this.db, document);
            plan.rollback?.forEach(change => this.apply(change));
            plan.changes?.forEach(change => this.apply(change));
          }
          if (plan.history && plan.documents?.length) {
            restore();
            this.db.prepare("UPDATE _tau_device_state SET applying=2 WHERE id=1").run();
          }
          for (const document of plan.documents ?? []) {
            writeDeviceDocument(this.db, document);
            this.project(document, {
              replica: !plan.history,
              audit: existingDocuments.has(document.contentId),
            });
          }
          if (plan.history) {
            const projected = this.db
              .prepare(
                "SELECT * FROM _tau_device_log WHERE seq>? AND phase=1 AND table_name NOT IN ('_document','_json') ORDER BY seq"
              )
              .all(sequence) as LoggedChange[];
            plan.history.changes.push(...projected.map(decodeChange));
            plan.state.ackSeq = Number(
              (
                this.db
                  .prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'")
                  .get() as { seq: number } | undefined
              )?.seq ?? 0
            );
          }
          this.db.prepare("UPDATE _tau_device_state SET applying=1 WHERE id=1").run();
          for (const copy of plan.noteCopies ?? [])
            this.db
              .prepare("INSERT INTO _tau_device_note_copies VALUES (?,?,?)")
              .run(randomUUID(), copy.reason, JSON.stringify(copy.document));
          if ((this.db.pragma("foreign_key_check") as unknown[]).length)
            throw new Error("DEVICE_SYNC_FOREIGN_KEY: 安装后外键校验失败");
          if (plan.history)
            this.db
              .prepare("INSERT INTO _tau_device_history(id,payload) VALUES (?,?)")
              .run(plan.history.id, JSON.stringify(plan.history));
          if (plan.receipt)
            this.db
              .prepare(
                "INSERT INTO _tau_device_receipts VALUES (?,?,?,?) ON CONFLICT(node) DO UPDATE SET sequence=excluded.sequence,fingerprint=excluded.fingerprint,outcome=excluded.outcome WHERE excluded.sequence>=sequence"
              )
              .run(
                plan.receipt.node,
                plan.receipt.sequence,
                plan.receipt.fingerprint,
                JSON.stringify(plan.receipt.outcome ?? {})
              );
          this.db
            .prepare(
              "UPDATE _tau_device_state SET payload=?,applying=0,projection_bytes=0,metadata_bytes=0 WHERE id=1"
            )
            .run(JSON.stringify(plan.state));
          for (const id of plan.pendingDocuments ?? [])
            this.db
              .prepare(
                "INSERT INTO _tau_device_log(table_name,row_key,after_json) VALUES('_document',?,'{}')"
              )
              .run(JSON.stringify([id]));
          deleteDeviceLogs(this.db, "DELETE FROM _tau_device_log WHERE seq<=?", plan.state.ackSeq);
          this.db
            .prepare(
              "DELETE FROM _tau_device_history WHERE ordinal NOT IN (SELECT ordinal FROM _tau_device_history ORDER BY ordinal DESC LIMIT ?) OR ordinal IN (SELECT ordinal FROM (SELECT ordinal,sum(length(payload)) OVER (ORDER BY ordinal DESC) AS bytes FROM _tau_device_history) WHERE bytes>16777216)"
            )
            .run(DEVICE_SYNC_HISTORY_LIMIT);
        } finally {
          restore();
        }
      })();
      committed = true;
    } finally {
      try {
        if (this.db.open && previousTimeout !== undefined)
          this.db.pragma(`busy_timeout=${previousTimeout}`);
      } finally {
        release?.(committed);
      }
    }
  }
}
