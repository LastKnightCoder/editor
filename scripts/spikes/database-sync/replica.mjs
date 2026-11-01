import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const schema = readFileSync(
  new URL("../../../packages/db-schema/schema/main.sql", import.meta.url),
  "utf8"
);
const schemaHash = createHash("sha256").update(schema).digest("hex");
const quote = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${value.replaceAll("'", "''")}'`;
export const canonical = value =>
  JSON.stringify(value, (_, item) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map(key => [key, item[key]])
      );
    return item;
  });
const decode = value =>
  value && typeof value === "object" ? Buffer.from(value.$blob, "hex") : value;

export function inspectSchema(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_spike_%' ORDER BY name"
    )
    .all()
    .map(({ name }) => {
      const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
      const primaryKey = columns
        .filter(column => column.pk)
        .sort((left, right) => left.pk - right.pk)
        .map(column => column.name);
      return {
        name,
        columns: columns.map(column => column.name),
        declaredPrimaryKey: primaryKey,
        key: primaryKey.length
          ? primaryKey
          : name === "content_links"
            ? ["content_id", "target_content_id"]
            : [],
        blobs: columns.filter(column => column.type === "BLOB").map(column => column.name),
        foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().length,
      };
    });
}

export class Replica {
  get protocol() {
    return 1;
  }

  constructor(path, { device, slot, group = "spike-library", baseline }) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(device) ||
      !Number.isSafeInteger(slot) ||
      slot < 1 ||
      slot > 100_000
    )
      throw new Error("设备身份或编号无效");
    this.db = new DatabaseSync(path);
    try {
      const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (existing.length && !existing.some(row => row.name === "_spike_state"))
        throw new Error("拒绝接管非 spike 数据库");
      const isNew = existing.length === 0;
      if (isNew) this.db.exec(schema);
      this.tables = inspectSchema(this.db);
      this.tableMap = new Map(this.tables.map(table => [table.name, table]));
      if (
        baseline &&
        (!isNew ||
          baseline.group !== group ||
          baseline.schema !== schemaHash ||
          (baseline.protocol ?? 1) !== this.protocol)
      )
        throw new Error("初始基线与目标资料库不匹配");
      if (baseline) {
        this.db.exec("BEGIN; PRAGMA defer_foreign_keys=ON");
        try {
          for (const table of this.tables) this.db.exec(`DELETE FROM ${quote(table.name)}`);
          for (const table of this.tables)
            for (const row of baseline.rows[table.name]) this.writeRow(table, row);
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
      }
      const initialBaseline = isNew
        ? { group, schema: schemaHash, protocol: this.protocol, rows: this.snapshot() }
        : null;
      this.db.exec(`
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS _spike_state (
          id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, slot INTEGER NOT NULL,
          library TEXT NOT NULL, schema_hash TEXT NOT NULL, baseline_hash TEXT NOT NULL,
          sequence INTEGER NOT NULL DEFAULT 0,
          clock INTEGER NOT NULL DEFAULT 0, id_sequence INTEGER NOT NULL DEFAULT 0,
          active_tx TEXT, applying INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS _spike_pending (
          ordinal INTEGER PRIMARY KEY, table_name TEXT NOT NULL, row_key TEXT NOT NULL,
          before_row TEXT, after_row TEXT
        );
        CREATE TABLE IF NOT EXISTS _spike_batches (
          device TEXT NOT NULL, sequence INTEGER NOT NULL, clock INTEGER NOT NULL,
          fingerprint TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device, sequence)
        );
        CREATE TABLE IF NOT EXISTS _spike_frontier (device TEXT PRIMARY KEY, sequence INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS _spike_baseline (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _spike_protocol (version INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS _spike_versions (
          table_name TEXT NOT NULL, row_key TEXT NOT NULL, device TEXT NOT NULL,
          sequence INTEGER NOT NULL, clock INTEGER NOT NULL, observed TEXT NOT NULL,
          before_row TEXT, after_row TEXT,
          PRIMARY KEY(table_name, row_key, device, sequence)
        );
      `);
      if (isNew) {
        const initialPayload = canonical(initialBaseline);
        const baselineHash = createHash("sha256").update(initialPayload).digest("hex");
        this.db
          .prepare(
            "INSERT INTO _spike_state(id,device,slot,library,schema_hash,baseline_hash) VALUES(1,?,?,?,?,?)"
          )
          .run(device, slot, group, schemaHash, baselineHash);
        this.db.prepare("INSERT INTO _spike_baseline VALUES(1,?)").run(initialPayload);
        this.db.prepare("INSERT INTO _spike_protocol VALUES(?)").run(this.protocol);
      }
      if (this.db.prepare("SELECT version FROM _spike_protocol").get()?.version !== this.protocol)
        throw new Error("副本协议不匹配");
      this.state = this.db.prepare("SELECT * FROM _spike_state").get();
      if (
        this.state.device !== device ||
        this.state.slot !== slot ||
        this.state.library !== group ||
        this.state.schema_hash !== schemaHash
      )
        throw new Error("设备、资料库或 Schema 身份不匹配");
      this.initializeExtensions();
      this.installCapture();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  initializeExtensions() {
    return undefined;
  }

  prepareBatch(batch) {
    return batch;
  }

  afterLocalBatch() {
    return undefined;
  }

  installCapture() {
    for (const table of this.tables) {
      if (!table.key.length) throw new Error(`缺少稳定键：${table.name}`);
      const key = prefix =>
        `json_array(${table.key.map(column => `${prefix}.${quote(column)}`).join(",")})`;
      const row = prefix =>
        `json_object(${table.columns.flatMap(column => [literal(column), `CASE WHEN typeof(${prefix}.${quote(column)})='blob' THEN json_object('$blob',hex(${prefix}.${quote(column)})) ELSE ${prefix}.${quote(column)} END`]).join(",")})`;
      for (const [action, before, after, prefix] of [
        ["INSERT", "NULL", row("NEW"), "NEW"],
        ["UPDATE", row("OLD"), row("NEW"), "NEW"],
        ["DELETE", row("OLD"), "NULL", "OLD"],
      ]) {
        const changedKey =
          action === "UPDATE"
            ? `SELECT CASE WHEN ${key("OLD")} != ${key("NEW")} THEN RAISE(ABORT,'spike: primary key mutation') END;`
            : "";
        const nullKey = table.key.map(column => `${prefix}.${quote(column)} IS NULL`).join(" OR ");
        const retiredKey =
          action === "INSERT"
            ? `SELECT CASE WHEN EXISTS(SELECT 1 FROM _spike_versions WHERE table_name=${literal(table.name)} AND row_key=${key(prefix)} AND after_row IS NULL) THEN RAISE(ABORT,'spike: retired identity') END;`
            : "";
        this.db
          .exec(`CREATE TRIGGER IF NOT EXISTS ${quote(`_spike_${table.name}_${action}`)} AFTER ${action} ON ${quote(table.name)} WHEN (SELECT applying FROM _spike_state)=0 BEGIN
          SELECT CASE WHEN (SELECT active_tx FROM _spike_state) IS NULL THEN RAISE(ABORT,'spike: write outside transaction') END;
          SELECT CASE WHEN ${nullKey} THEN RAISE(ABORT,'spike: null identity') END;
          ${changedKey} ${retiredKey}
          INSERT INTO _spike_pending(table_name,row_key,before_row,after_row) VALUES(${literal(table.name)},${key(prefix)},${before},${after});
        END;`);
      }
    }
  }

  frontier() {
    return Object.fromEntries(
      this.db
        .prepare("SELECT * FROM _spike_frontier ORDER BY device")
        .all()
        .map(row => [row.device, row.sequence])
    );
  }

  initialBaseline() {
    return JSON.parse(this.db.prepare("SELECT payload FROM _spike_baseline").get().payload);
  }

  allocateId() {
    const state = this.db.prepare("SELECT * FROM _spike_state").get();
    if (!state.active_tx) throw new Error("编号分配必须属于写事务");
    if (state.id_sequence >= 999_999_999) throw new Error("设备编号段已用完");
    this.db.exec("UPDATE _spike_state SET id_sequence=id_sequence+1");
    return state.slot * 1_000_000_000 + state.id_sequence + 1;
  }

  transaction(write) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.db.prepare("SELECT * FROM _spike_state").get();
      const batch = {
        group: state.library,
        schema: schemaHash,
        baseline: state.baseline_hash,
        device: state.device,
        sequence: state.sequence + 1,
        clock: state.clock + 1,
        observed: this.frontier(),
        changes: [],
      };
      this.db
        .prepare("UPDATE _spike_state SET active_tx=?")
        .run(`${batch.device}:${batch.sequence}`);
      const result = write(this.db);
      if (result && typeof result.then === "function") throw new Error("事务回调不能异步执行");
      const changes = new Map();
      for (const row of this.db.prepare("SELECT * FROM _spike_pending ORDER BY ordinal").all()) {
        const identity = `${row.table_name}:${row.row_key}`;
        const previous = changes.get(identity);
        changes.set(identity, {
          table: row.table_name,
          key: JSON.parse(row.row_key),
          before: previous
            ? previous.before
            : row.before_row === null
              ? null
              : JSON.parse(row.before_row),
          after: row.after_row === null ? null : JSON.parse(row.after_row),
        });
      }
      batch.changes = [...changes.values()];
      if (batch.changes.length) {
        this.prepareBatch(batch);
        this.storeBatch(batch);
        this.afterLocalBatch(batch);
        this.db
          .prepare("UPDATE _spike_state SET sequence=?,clock=?")
          .run(batch.sequence, batch.clock);
      }
      this.db.exec("DELETE FROM _spike_pending; UPDATE _spike_state SET active_tx=NULL; COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  storeBatch(batch) {
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
    for (const change of batch.changes) {
      this.db
        .prepare("INSERT INTO _spike_versions VALUES(?,?,?,?,?,?,?,?)")
        .run(
          change.table,
          canonical(change.key),
          batch.device,
          batch.sequence,
          batch.clock,
          canonical(batch.observed),
          change.before === null ? null : canonical(change.before),
          change.after === null ? null : canonical(change.after)
        );
    }
    this.db
      .prepare(
        "INSERT INTO _spike_frontier VALUES(?,?) ON CONFLICT(device) DO UPDATE SET sequence=excluded.sequence"
      )
      .run(batch.device, batch.sequence);
  }

  winner(table, key) {
    return this.db
      .prepare(
        "SELECT * FROM _spike_versions WHERE table_name=? AND row_key=? ORDER BY (after_row IS NULL) DESC,clock DESC,device DESC,sequence DESC LIMIT 1"
      )
      .get(table, canonical(key));
  }

  applyWinner(change) {
    const table = this.tableMap.get(change.table);
    const winner = this.winner(change.table, change.key);
    const where = table.key.map(column => `${quote(column)} IS ?`).join(" AND ");
    if (winner.after_row === null) {
      this.db.prepare(`DELETE FROM ${quote(table.name)} WHERE ${where}`).run(...change.key);
      return;
    }
    this.writeRow(table, JSON.parse(winner.after_row));
  }

  writeRow(table, row) {
    const columns = table.columns.map(quote).join(",");
    const updates = table.columns
      .filter(column => !table.key.includes(column))
      .map(column => `${quote(column)}=excluded.${quote(column)}`)
      .join(",");
    this.db
      .prepare(
        `INSERT INTO ${quote(table.name)}(${columns}) VALUES(${table.columns.map(() => "?").join(",")}) ON CONFLICT(${table.key.map(quote).join(",")}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`
      )
      .run(...table.columns.map(column => decode(row[column])));
  }

  validate(batch) {
    if ((batch.protocol ?? 1) !== 1) throw new Error("变更协议不匹配");
    if (
      batch.group !== this.state.library ||
      batch.schema !== schemaHash ||
      batch.baseline !== this.state.baseline_hash
    )
      throw new Error("资料库、Schema 或初始基线不匹配");
    if (
      !/^[a-z][a-z0-9-]*$/.test(batch.device) ||
      !Number.isSafeInteger(batch.sequence) ||
      batch.sequence < 1 ||
      !Number.isSafeInteger(batch.clock) ||
      batch.clock < 1 ||
      !Array.isArray(batch.changes) ||
      !batch.changes.length
    )
      throw new Error("变更信封无效");
    const identities = new Set();
    for (const change of batch.changes) {
      const table = this.tableMap.get(change.table);
      if (
        !table ||
        !Array.isArray(change.key) ||
        change.key.length !== table.key.length ||
        change.key.some(value => value === null)
      )
        throw new Error("表或记录身份无效");
      const identity = `${table.name}:${canonical(change.key)}`;
      if (identities.has(identity)) throw new Error("同一事务重复记录身份");
      identities.add(identity);
      for (const row of [change.before, change.after]) {
        if (
          row !== null &&
          (canonical(Object.keys(row).sort()) !== canonical([...table.columns].sort()) ||
            canonical(table.key.map(column => row[column])) !== canonical(change.key))
        )
          throw new Error("行字段或主键不匹配");
      }
    }
    if (
      !batch.observed ||
      typeof batch.observed !== "object" ||
      Array.isArray(batch.observed) ||
      (batch.observed[batch.device] ?? 0) !== batch.sequence - 1
    )
      throw new Error("来源序号不连续");
    for (const sequence of Object.values(batch.observed))
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error("观察进度无效");
  }

  receive(batch, { failAfterChanges } = {}) {
    this.validate(batch);
    const payload = canonical(batch);
    const existing = this.db
      .prepare("SELECT payload FROM _spike_batches WHERE device=? AND sequence=?")
      .get(batch.device, batch.sequence);
    if (existing) {
      if (existing.payload !== payload) throw new Error("同一操作身份对应不同内容");
      return "duplicate";
    }
    const frontier = this.frontier();
    if (
      batch.sequence !== (frontier[batch.device] ?? 0) + 1 ||
      Object.entries(batch.observed).some(
        ([device, sequence]) => (frontier[device] ?? 0) < sequence
      )
    )
      throw new Error("缺少先行变更");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("UPDATE _spike_state SET applying=1");
      this.storeBatch(batch);
      this.projectBatch(batch, { failAfterChanges });
      this.db.prepare("UPDATE _spike_state SET applying=0,clock=max(clock,?)").run(batch.clock);
      this.db.exec("COMMIT");
      return "applied";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  projectBatch(batch, { failAfterChanges } = {}) {
    let applied = 0;
    for (const change of batch.changes) {
      this.applyWinner(change);
      if (++applied === failAfterChanges) throw new Error("注入接收中断");
    }
  }

  exportSince(frontier = {}) {
    return Object.keys(this.frontier())
      .flatMap(device =>
        this.db
          .prepare(
            "SELECT payload FROM _spike_batches WHERE device=? AND sequence>? ORDER BY sequence"
          )
          .all(device, frontier[device] ?? 0)
          .map(row => JSON.parse(row.payload))
      )
      .sort(
        (left, right) =>
          left.clock - right.clock ||
          (left.device < right.device ? -1 : left.device > right.device ? 1 : 0) ||
          left.sequence - right.sequence
      );
  }

  rows(name) {
    const table = this.tableMap.get(name);
    if (!table) throw new Error("未知业务表");
    return this.db
      .prepare(`SELECT * FROM ${quote(name)} ORDER BY ${table.key.map(quote).join(",")}`)
      .all()
      .map(row =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value instanceof Uint8Array
              ? { $blob: Buffer.from(value).toString("hex").toUpperCase() }
              : value,
          ])
        )
      );
  }

  snapshot() {
    return Object.fromEntries(this.tables.map(table => [table.name, this.rows(table.name)]));
  }

  conflicts() {
    const groups = Map.groupBy(
      this.db
        .prepare("SELECT * FROM _spike_versions ORDER BY table_name,row_key,device,sequence")
        .all(),
      row => `${row.table_name}:${row.row_key}`
    );
    return [...groups.entries()].flatMap(([identity, versions]) => {
      const heads = versions.filter(
        version =>
          !versions.some(
            other =>
              other !== version &&
              (JSON.parse(other.observed)[version.device] ?? 0) >= version.sequence
          )
      );
      return heads.length > 1
        ? [
            {
              identity,
              versions: heads.map(row => ({
                device: row.device,
                sequence: row.sequence,
                after: row.after_row,
              })),
            },
          ]
        : [];
    });
  }

  close() {
    if (!this.closed) this.db.close();
    this.closed = true;
  }
}

export function exchange(left, right) {
  let sent = 0;
  for (const batch of left.exportSince(right.frontier())) {
    right.receive(batch);
    sent++;
  }
  for (const batch of right.exportSince(left.frontier())) {
    left.receive(batch);
    sent++;
  }
  return sent;
}
