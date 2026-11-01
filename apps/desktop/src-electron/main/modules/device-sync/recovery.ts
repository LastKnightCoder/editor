import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import HEALTH_SQL from "@tau/db-schema/schema/device-sync-health.sql?raw";
import type { DeviceState } from "@tau/collaboration/src/device-sync/protocol";
import { validDocumentRecord } from "./record-integrity";
import { ensureLocalGeneration } from "./local-generation";

export function assertDeviceDamage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code && /SQLITE_(BUSY|LOCKED|FULL|IOERR|READONLY|CANTOPEN|NOMEM)/.test(code)) throw error;
}

export function parseDeviceState(raw: string): DeviceState {
  const value = JSON.parse(raw) as DeviceState;
  if (
    !value ||
    !["library", "schema", "node", "authority", "epoch", "head", "ackHead"].every(
      key => typeof value[key as keyof DeviceState] === "string"
    ) ||
    ![value.ackSeq, value.revision].every(number => Number.isSafeInteger(number) && number >= 0) ||
    typeof value.enabled !== "boolean"
  )
    throw new Error("DEVICE_SYNC_DAMAGED: 同步身份记录损坏");
  return value;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export function removeDeviceTriggers(db: Database.Database) {
  for (const { name } of db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name GLOB '_tau_device_*'")
    .all() as { name: string }[])
    db.exec(`DROP TRIGGER ${quote(name)}`);
}
export function hasDeviceSyncMaterial(db: Database.Database) {
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name IN ('_tau_device_state','_tau_device_documents') OR name GLOB '_tau_device_quarantine_*_documents')"
      )
      .all() as { name: string }[];
    return tables.some(({ name }) =>
      Boolean(db.prepare(`SELECT 1 FROM ${quote(name)} LIMIT 1`).get())
    );
  } catch {
    return true;
  }
}

/** 隔离材料不参与协议，重建后只允许通过完整保全与快照重新对齐。 */
export function recoverDeviceDatabase(
  db: Database.Database,
  install: () => void,
  excludedContentId?: number
) {
  db.transaction(() => {
    let previous: DeviceState | undefined;
    let sequence = 0;
    for (const query of [
      "SELECT max(seq) AS value FROM sqlite_sequence WHERE name='_tau_device_log'",
      "SELECT sequence AS value FROM _tau_device_anchor WHERE id=1",
    ]) {
      try {
        const row = db.prepare(query).get() as { value: number } | undefined;
        if (row && Number.isSafeInteger(row.value) && row.value >= 0)
          sequence = Math.max(sequence, row.value);
      } catch {
        /* 缺失记录时仍可从身份确认游标恢复下界。 */
      }
    }
    for (const table of ["_tau_device_anchor", "_tau_device_state"]) {
      try {
        const row = db.prepare(`SELECT payload FROM ${table} WHERE id=1`).get() as
          | { payload: string }
          | undefined;
        if (row) previous = parseDeviceState(row.payload);
        if (previous) break;
      } catch {
        /* 身份副本也不可读时保留本机资料，停止网络发布。 */
      }
    }
    removeDeviceTriggers(db);
    const prefix = `_tau_device_quarantine_${randomUUID().replaceAll("-", "")}_`;
    const archived = new Map<string, string>();
    for (const { name } of db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' AND name<>'_tau_device_local' AND name NOT GLOB '_tau_device_quarantine_*'"
      )
      .all() as { name: string }[]) {
      const target = prefix + name.slice("_tau_device_".length);
      db.exec(`ALTER TABLE ${quote(name)} RENAME TO ${quote(target)}`);
      archived.set(name, target);
    }
    install();
    const documents = archived.get("_tau_device_documents"),
      intents = archived.get("_tau_device_json_intents");
    if (documents) {
      try {
        const hasIntents =
          intents &&
          (db.prepare(`PRAGMA table_info(${quote(intents)})`).all() as { name: string }[]).some(
            column => column.name === "content_id"
          );
        db.prepare(
          `INSERT INTO _tau_device_documents SELECT content_id,document_id,baseline_id,epoch,state,paths,updated_at,metric_rules,checksum FROM ${quote(documents)} WHERE CASE WHEN json_valid(paths) THEN json_type(paths)='object' ELSE 0 END AND CASE WHEN json_valid(metric_rules) THEN json_type(metric_rules)='array' ELSE 0 END AND content_id<>? ${hasIntents ? `AND content_id NOT IN (SELECT content_id FROM ${quote(intents)})` : ""}`
        ).run(excludedContentId ?? -1);
      } catch {
        /* 结构不可读的检查点保留在隔离表，按可读正文建立新基线。 */
      }
    }
    for (const row of db.prepare("SELECT * FROM _tau_device_documents").all() as Record<
      string,
      unknown
    >[])
      if (!validDocumentRecord(row))
        db.prepare("DELETE FROM _tau_device_documents WHERE content_id=?").run(row.content_id);
    for (const table of ["_tau_device_branches", "_tau_device_note_copies"]) {
      const source = archived.get(table);
      if (source)
        try {
          db.exec(
            `INSERT INTO ${table} SELECT id,reason,payload FROM ${quote(source)} WHERE json_valid(payload)`
          );
        } catch {
          /* 原始副本始终留在隔离表。 */
        }
    }
    if (previous) {
      sequence = Math.max(sequence, previous.ackSeq);
      const head = randomUUID();
      db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(
        JSON.stringify({
          ...previous,
          head,
          ackHead: previous.node === previous.authority ? head : "",
          ackSeq: 0,
          revision: previous.revision + (previous.node === previous.authority ? 1 : 0),
          requiresSnapshot: true,
          recovering: true,
        })
      );
      install();
    }
    db.prepare("DELETE FROM sqlite_sequence WHERE name='_tau_device_log'").run();
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?)").run(
      BigInt(sequence)
    );
    db.prepare("UPDATE _tau_device_anchor SET sequence=? WHERE id=1").run(sequence);
  })();
}

export function checkDeviceDatabase(db: Database.Database) {
  ensureLocalGeneration(db);
  if (db.prepare(HEALTH_SQL).get()) throw new Error("DEVICE_SYNC_DAMAGED: 辅助记录不可读");
  const row = db.prepare("SELECT payload FROM _tau_device_state WHERE id=1").get() as
    | { payload: string }
    | undefined;
  if (row) parseDeviceState(row.payload);
}
