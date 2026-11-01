import { createHash } from "node:crypto";
import { Replica, canonical } from "./replica.mjs";
import { FieldCodec } from "./field-codec.mjs";

const quote = value => `"${value.replaceAll('"', '""')}"`;
const token = version => `${version.device}:${version.sequence}`;
const rank = (left, right) =>
  left.clock - right.clock ||
  (left.device < right.device ? -1 : left.device > right.device ? 1 : 0) ||
  left.sequence - right.sequence;
const RECOVERY_GROUP = -1;

export class SemanticReplica extends Replica {
  get protocol() {
    return 2;
  }

  initializeExtensions() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _spike_generations (
        table_name TEXT NOT NULL,row_key TEXT NOT NULL,device TEXT NOT NULL,sequence INTEGER NOT NULL,
        generation INTEGER NOT NULL,restore_of TEXT,PRIMARY KEY(table_name,row_key,device,sequence)
      );
      CREATE TABLE IF NOT EXISTS _spike_quarantine (
        table_name TEXT NOT NULL,row_key TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(table_name,row_key)
      );
      CREATE TABLE IF NOT EXISTS _spike_orphans (
        table_name TEXT NOT NULL,row_key TEXT NOT NULL,parent_id INTEGER NOT NULL,PRIMARY KEY(table_name,row_key)
      );
      CREATE TABLE IF NOT EXISTS _spike_restore_intents (
        table_name TEXT NOT NULL,row_key TEXT NOT NULL,restore_of TEXT NOT NULL,generation INTEGER NOT NULL,
        PRIMARY KEY(table_name,row_key)
      );
    `);
    this.codec = new FieldCodec(this.db);
    for (const rows of Object.values(this.initialBaseline().rows))
      for (const row of rows) this.codec.packRow(row);
  }

  baselineRow(table, key) {
    const spec = this.tableMap.get(table);
    return (
      this.initialBaseline().rows[table].find(
        row => canonical(spec.key.map(column => row[column])) === canonical(key)
      ) ?? null
    );
  }

  version(table, key, identity) {
    if (identity === null) return null;
    if (identity === "baseline") {
      const row = this.baselineRow(table, key);
      if (!row) throw new Error("缺少初始行");
      return { device: "baseline", sequence: 0, clock: 0, generation: 0, row };
    }
    const [device, sequenceText] = identity.split(":");
    const stored = this.db
      .prepare(
        `SELECT v.*,g.generation FROM _spike_versions v JOIN _spike_generations g USING(table_name,row_key,device,sequence) WHERE v.table_name=? AND v.row_key=? AND v.device=? AND v.sequence=?`
      )
      .get(table, canonical(key), device, Number(sequenceText));
    if (!stored) throw new Error("缺少行版本依赖");
    return {
      ...stored,
      row: stored.after_row === null ? null : this.codec.unpackRow(JSON.parse(stored.after_row)),
    };
  }

  winner(table, key) {
    return this.db
      .prepare(
        `SELECT v.*,g.generation FROM _spike_versions v JOIN _spike_generations g USING(table_name,row_key,device,sequence) WHERE v.table_name=? AND v.row_key=? ORDER BY g.generation DESC,(v.after_row IS NULL) DESC,v.clock DESC,v.device DESC,v.sequence DESC LIMIT 1`
      )
      .get(table, canonical(key));
  }

  head(table, key) {
    const winner = this.winner(table, key);
    if (winner) return this.version(table, key, token(winner));
    return this.baselineRow(table, key) ? this.version(table, key, "baseline") : null;
  }

  prepareBatch(batch) {
    batch.protocol = this.protocol;
    batch.changes = batch.changes.map(change => {
      const previous = this.head(change.table, change.key);
      const intent = this.db
        .prepare("SELECT * FROM _spike_restore_intents WHERE table_name=? AND row_key=?")
        .get(change.table, canonical(change.key));
      let after = change.after;
      if (after && change.before && previous?.row) {
        after = { ...previous.row };
        for (const [field, value] of Object.entries(change.after))
          if (canonical(value) !== canonical(change.before[field])) after[field] = value;
      }
      const base = previous
        ? previous.device === "baseline"
          ? "baseline"
          : token(previous)
        : null;
      const patch =
        after === null
          ? null
          : Object.fromEntries(
              Object.entries(after)
                .filter(
                  ([field, value]) =>
                    !previous?.row || canonical(value) !== canonical(previous.row[field])
                )
                .map(([field, value]) => [field, this.codec.encode(value, previous?.row?.[field])])
            );
      return {
        table: change.table,
        key: change.key,
        generation: intent?.generation ?? previous?.generation ?? 0,
        restoreOf: intent?.restore_of ?? null,
        base,
        patch,
      };
    });
    this.db.exec("DELETE FROM _spike_restore_intents");
  }

  decodeChange(change) {
    if (
      !this.tableMap.has(change.table) ||
      !Array.isArray(change.key) ||
      !Number.isSafeInteger(change.generation) ||
      change.generation < 0
    )
      throw new Error("行或代次无效");
    const base = this.version(change.table, change.key, change.base);
    const after = change.patch === null ? null : { ...base?.row };
    if (after)
      for (const [field, encoded] of Object.entries(change.patch)) {
        if (!this.tableMap.get(change.table).columns.includes(field)) throw new Error("未知字段");
        after[field] = this.codec.decode(encoded, base?.row?.[field]);
      }
    return {
      table: change.table,
      key: change.key,
      before: base?.row ?? null,
      after,
      baseVersion: base,
    };
  }

  validate(batch) {
    if (batch.protocol !== this.protocol || !Array.isArray(batch.changes))
      throw new Error("变更协议不匹配");
    const decoded = batch.changes.map(change => this.decodeChange(change));
    super.validate({ ...batch, protocol: 1, changes: decoded });
    for (const [index, change] of batch.changes.entries()) {
      const base = decoded[index].baseVersion;
      if (base && base.device !== "baseline" && (batch.observed[base.device] ?? 0) < base.sequence)
        throw new Error("没有观察到差量基线");
      if (change.restoreOf !== null) {
        const deletion = this.version(change.table, change.key, change.restoreOf);
        if (
          !deletion ||
          deletion.row !== null ||
          (batch.observed[deletion.device] ?? 0) < deletion.sequence ||
          change.generation !== deletion.generation + 1 ||
          change.patch === null
        )
          throw new Error("恢复未引用已观察到的删除");
      } else if (
        change.generation !== (base?.generation ?? 0) ||
        (base?.row === null && change.patch !== null)
      )
        throw new Error("普通写入不能恢复删除或切换代次");
    }
  }

  storeBatch(batch) {
    this.validate(batch);
    const decoded = batch.changes.map(change => this.decodeChange(change));
    const payload = canonical(batch);
    this.db
      .prepare("INSERT INTO _spike_batches VALUES(?,?,?,?,?)")
      .run(
        batch.device,
        batch.sequence,
        batch.clock,
        createHash("sha256").update(payload).digest("hex"),
        payload
      );
    for (const [index, change] of batch.changes.entries()) {
      const row = decoded[index].after;
      this.db
        .prepare("INSERT INTO _spike_versions VALUES(?,?,?,?,?,?,?,?)")
        .run(
          change.table,
          canonical(change.key),
          batch.device,
          batch.sequence,
          batch.clock,
          canonical(batch.observed),
          null,
          row === null ? null : canonical(this.codec.packRow(row))
        );
      this.db
        .prepare("INSERT INTO _spike_generations VALUES(?,?,?,?,?,?)")
        .run(
          change.table,
          canonical(change.key),
          batch.device,
          batch.sequence,
          change.generation,
          change.restoreOf
        );
    }
    this.db
      .prepare(
        "INSERT INTO _spike_frontier VALUES(?,?) ON CONFLICT(device) DO UPDATE SET sequence=excluded.sequence"
      )
      .run(batch.device, batch.sequence);
  }

  afterLocalBatch(batch) {
    this.db.exec("UPDATE _spike_state SET applying=1");
    this.projectBatch(batch);
    this.db.exec("UPDATE _spike_state SET applying=0");
  }

  applyWinner(change) {
    const version = this.head(change.table, change.key);
    const table = this.tableMap.get(change.table);
    if (version.row === null)
      this.db
        .prepare(
          `DELETE FROM ${quote(table.name)} WHERE ${table.key.map(column => `${quote(column)} IS ?`).join(" AND ")}`
        )
        .run(...change.key);
    else this.writeRow(table, version.row);
  }

  beforeDeletion(table, key, deletion) {
    const batch = JSON.parse(
      this.db
        .prepare("SELECT payload FROM _spike_batches WHERE device=? AND sequence=?")
        .get(deletion.device, deletion.sequence).payload
    );
    const change = batch.changes.find(
      item => item.table === table && canonical(item.key) === canonical(key)
    );
    return this.version(table, key, change.base)?.row ?? null;
  }

  candidates(table, includeDeleted = false) {
    const spec = this.tableMap.get(table);
    const keys = new Map(
      this.initialBaseline().rows[table].map(row => {
        const key = spec.key.map(column => row[column]);
        return [canonical(key), key];
      })
    );
    for (const row of this.db
      .prepare("SELECT DISTINCT row_key FROM _spike_versions WHERE table_name=?")
      .all(table))
      keys.set(row.row_key, JSON.parse(row.row_key));
    return [...keys.values()].flatMap(key => {
      const head = this.head(table, key);
      if (head.row !== null) return [{ key, ...head, deleted: false }];
      const row = includeDeleted ? this.beforeDeletion(table, key, head) : null;
      return row ? [{ key, ...head, row, deleted: true }] : [];
    });
  }

  quarantine(table, candidate, reason) {
    this.db
      .prepare("INSERT OR REPLACE INTO _spike_quarantine VALUES(?,?,?)")
      .run(table, canonical(candidate.key), reason);
  }

  unique(table, candidates, fields) {
    const claimed = new Set();
    return candidates
      .sort((left, right) => -rank(left, right))
      .filter(candidate => {
        const key = canonical(fields.map(field => candidate.row[field]));
        if (claimed.has(key)) {
          if (!candidate.deleted) this.quarantine(table, candidate, "unique-conflict");
          return false;
        }
        claimed.add(key);
        return !candidate.deleted;
      });
  }

  projectBatch(batch, { failAfterChanges } = {}) {
    const touched = new Set(batch.changes.map(change => change.table));
    const desired = new Map();
    const clear = table => {
      this.db.prepare("DELETE FROM _spike_quarantine WHERE table_name=?").run(table);
      this.db.prepare("DELETE FROM _spike_orphans WHERE table_name=?").run(table);
    };
    if (["plugin_entities", "plugin_links", "contents"].some(table => touched.has(table))) {
      clear("plugin_entities");
      clear("plugin_links");
      const entities = this.unique(
        "plugin_entities",
        this.candidates("plugin_entities", true).filter(candidate => {
          if (candidate.deleted) return true;
          if (this.head("contents", [candidate.row.content_id])?.row) return true;
          this.quarantine("plugin_entities", candidate, "missing-content");
          return false;
        }),
        ["plugin_id", "kind", "key"]
      );
      const ids = new Set(entities.map(candidate => candidate.row.id));
      const links = this.unique(
        "plugin_links",
        this.candidates("plugin_links", true).filter(candidate => {
          if (candidate.deleted) return true;
          if (ids.has(candidate.row.from_id)) return true;
          this.quarantine("plugin_links", candidate, "missing-source");
          return false;
        }),
        ["from_id", "to_kind", "to_id", "role"]
      );
      desired.set(
        "plugin_entities",
        entities.map(candidate => candidate.row)
      );
      desired.set(
        "plugin_links",
        links.map(candidate => candidate.row)
      );
    }
    if (["todo_group", "todo_item"].some(table => touched.has(table))) {
      clear("todo_group");
      clear("todo_item");
      const groups = this.candidates("todo_group").map(candidate => candidate.row);
      const ids = new Set(groups.map(row => row.id));
      let recovery = false;
      const items = this.candidates("todo_item").flatMap(candidate => {
        const row = candidate.row;
        if (ids.has(row.group_id)) return [row];
        const parent = this.head("todo_group", [row.group_id]);
        if (!parent || parent.row !== null) {
          this.quarantine("todo_item", candidate, "missing-parent");
          return [];
        }
        recovery = true;
        this.db
          .prepare("INSERT INTO _spike_orphans VALUES(?,?,?)")
          .run("todo_item", canonical(candidate.key), row.group_id);
        return [{ ...row, group_id: RECOVERY_GROUP }];
      });
      if (recovery)
        groups.push({
          id: RECOVERY_GROUP,
          title: "待整理",
          color: null,
          sort_index: 0,
          is_archived: 0,
          create_time: 0,
          update_time: 0,
          is_system: 1,
          system_type: "sync-recovery",
        });
      desired.set("todo_group", groups);
      desired.set("todo_item", items);
    }
    let applied = 0;
    const fail = () => {
      if (++applied === failAfterChanges) throw new Error("注入接收中断");
    };
    for (const table of desired.keys()) {
      this.db.exec(`DELETE FROM ${quote(table)}`);
      fail();
    }
    for (const [table, rows] of desired)
      for (const row of rows) this.writeRow(this.tableMap.get(table), row);
    for (const change of batch.changes)
      if (!desired.has(change.table)) {
        this.applyWinner(change);
        fail();
      }
  }

  preserved() {
    return this.db
      .prepare("SELECT * FROM _spike_quarantine ORDER BY table_name,row_key")
      .all()
      .map(item => ({
        table: item.table_name,
        key: JSON.parse(item.row_key),
        reason: item.reason,
        row: this.head(item.table_name, JSON.parse(item.row_key)).row,
      }));
  }

  restore(table, key, expectedDeletion) {
    this.restoreMany([{ table, key, expectedDeletion }]);
  }

  restoreMany(items) {
    this.transaction(db => {
      for (const { table, key, expectedDeletion } of items) {
        const deletion = this.head(table, key);
        if (!deletion || deletion.row !== null || token(deletion) !== expectedDeletion)
          throw new Error("删除已变化，不能恢复");
        const row = this.beforeDeletion(table, key, deletion);
        if (!row) throw new Error("缺少恢复材料");
        db.prepare("INSERT INTO _spike_restore_intents VALUES(?,?,?,?)").run(
          table,
          canonical(key),
          expectedDeletion,
          deletion.generation + 1
        );
        db.prepare(
          "INSERT INTO _spike_pending(table_name,row_key,before_row,after_row) VALUES(?,?,NULL,?)"
        ).run(table, canonical(key), canonical(row));
      }
    });
  }

  editPreserved(table, key, fields) {
    const head = this.head(table, key);
    if (
      !head?.row ||
      !this.db
        .prepare("SELECT 1 FROM _spike_quarantine WHERE table_name=? AND row_key=?")
        .get(table, canonical(key))
    )
      throw new Error("对象不在冲突区");
    this.transaction(db =>
      db
        .prepare(
          "INSERT INTO _spike_pending(table_name,row_key,before_row,after_row) VALUES(?,?,?,?)"
        )
        .run(table, canonical(key), canonical(head.row), canonical({ ...head.row, ...fields }))
    );
  }
}
