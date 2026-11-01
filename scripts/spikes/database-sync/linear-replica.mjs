import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync, constants } from "node:sqlite";
import { canonical } from "./replica.mjs";

const schema = readFileSync(
  new URL("../../../packages/db-schema/schema/main.sql", import.meta.url),
  "utf8"
);
const digest = value =>
  createHash("sha256")
    .update(typeof value === "string" || value instanceof Uint8Array ? value : canonical(value))
    .digest("hex");
const schemaHash = digest(schema);
const quote = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${value.replaceAll("'", "''")}'`;
const decode = value =>
  value && typeof value === "object" ? Buffer.from(value.$blob, "hex") : value;
const rowIdentity = (table, key) => `${table}:${canonical(key)}`;

function tableSpecs(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_linear_%' ORDER BY name"
    )
    .all()
    .map(({ name }) => {
      const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
      let key = columns
        .filter(column => column.pk)
        .sort((left, right) => left.pk - right.pk)
        .map(column => column.name);
      if (!key.length) {
        for (const index of db
          .prepare(`PRAGMA index_list(${quote(name)})`)
          .all()
          .filter(index => index.unique && !index.partial)) {
          const candidate = db
            .prepare(`PRAGMA index_info(${quote(index.name)})`)
            .all()
            .map(column => column.name);
          if (
            candidate.every(name => columns.some(column => column.name === name && column.notnull))
          ) {
            key = candidate;
            break;
          }
        }
      }
      if (!key.length) throw new Error(`NO_RECORD_KEY: ${name}`);
      return {
        name,
        key,
        columns: columns.map(column => column.name),
        parents: [
          ...new Set(
            db
              .prepare(`PRAGMA foreign_key_list(${quote(name)})`)
              .all()
              .map(row => row.table)
          ),
        ],
      };
    });
}

function dependencyOrder(tables) {
  const byName = new Map(tables.map(table => [table.name, table]));
  const seen = new Set();
  const visiting = new Set();
  const order = [];
  const visit = table => {
    if (seen.has(table.name)) return;
    if (visiting.has(table.name)) throw new Error("SCHEMA_REFERENCE_CYCLE");
    visiting.add(table.name);
    for (const parent of table.parents)
      if (parent !== table.name && byName.has(parent)) visit(byName.get(parent));
    visiting.delete(table.name);
    seen.add(table.name);
    order.push(table);
  };
  for (const table of tables) visit(table);
  return order;
}

function rawRows(db, table) {
  return db
    .prepare(`SELECT * FROM ${quote(table.name)} ORDER BY ${table.key.map(quote).join(",")}`)
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
function writeRow(db, table, row) {
  if (canonical(Object.keys(row).sort()) !== canonical([...table.columns].sort()))
    throw new Error("ROW_COLUMNS");
  const updates = table.columns
    .filter(column => !table.key.includes(column))
    .map(column => `${quote(column)}=excluded.${quote(column)}`)
    .join(",");
  db.prepare(
    `INSERT INTO ${quote(table.name)}(${table.columns.map(quote).join(",")}) VALUES(${table.columns.map(() => "?").join(",")}) ON CONFLICT(${table.key.map(quote).join(",")}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`
  ).run(...table.columns.map(column => decode(row[column])));
}
function withoutTriggers(db, work) {
  // 复制已确认的行结果，避免业务触发器再次计算副作用。
  const triggers = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE '_linear_%'"
    )
    .all();
  for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
  try {
    return work();
  } finally {
    for (const trigger of triggers) db.exec(trigger.sql);
  }
}
function validateRows(rows) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    const tables = tableSpecs(db);
    if (canonical(Object.keys(rows).sort()) !== canonical(tables.map(table => table.name)))
      throw new Error("SNAPSHOT_TABLES");
    db.exec("BEGIN; PRAGMA defer_foreign_keys=ON");
    withoutTriggers(db, () => {
      const order = dependencyOrder(tables);
      for (const table of [...order].reverse()) db.exec(`DELETE FROM ${quote(table.name)}`);
      for (const table of order) for (const row of rows[table.name]) writeRow(db, table, row);
    });
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("FOREIGN_KEY_CHECK");
    db.exec("COMMIT");
    return Buffer.from(db.serialize());
  } finally {
    db.close();
  }
}
export function unpackLinearSnapshot(envelope) {
  if (
    typeof envelope.body !== "string" ||
    Buffer.byteLength(envelope.body) > 64 * 1024 * 1024 ||
    digest(envelope.body) !== envelope.id
  )
    throw new Error("SNAPSHOT_HASH");
  const snapshot = JSON.parse(envelope.body);
  if (
    snapshot.protocol !== 4 ||
    snapshot.schema !== schemaHash ||
    digest(snapshot.rows) !== snapshot.dataHash
  )
    throw new Error("SNAPSHOT_IDENTITY");
  return snapshot;
}

export class LinearReplica {
  get bodyMode() {
    return "rows";
  }
  initializeExtensions() {
    return undefined;
  }
  snapshotExtras() {
    return {};
  }
  installSnapshotExtras() {
    return undefined;
  }
  afterInstallResponse() {
    return undefined;
  }
  prepareCommit() {
    return undefined;
  }
  isCustomCommit() {
    return false;
  }
  allowForkEpoch() {
    return false;
  }
  decorateDatabaseCopy(bytes) {
    return bytes;
  }
  installChoiceExtras() {
    return undefined;
  }
  beforeAcceptBundle() {
    return undefined;
  }
  constructor(path, { device, library = "linear-spike", authority = "desktop", snapshot } = {}) {
    if (!/^[a-z][a-z0-9-]*$/.test(device ?? "")) throw new Error("DEVICE_ID");
    this.path = path;
    this.db = new DatabaseSync(path);
    try {
      const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (existing.length && !existing.some(table => table.name === "_linear_state"))
        throw new Error("REFUSE_NON_LINEAR_DATABASE");
      const fresh = !existing.length;
      if (fresh) this.db.exec(schema);
      this.tables = tableSpecs(this.db);
      this.tableMap = new Map(this.tables.map(table => [table.name, table]));
      this.db.exec(`PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS _linear_state(id INTEGER PRIMARY KEY CHECK(id=1),device TEXT NOT NULL,authority TEXT NOT NULL,library TEXT NOT NULL,schema_hash TEXT NOT NULL,epoch TEXT NOT NULL,head TEXT NOT NULL,ack_head TEXT NOT NULL,snapshot_only INTEGER NOT NULL DEFAULT 0,applying INTEGER NOT NULL DEFAULT 0,active_tx INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS _linear_pending(ordinal INTEGER PRIMARY KEY,table_name TEXT NOT NULL,row_key TEXT NOT NULL,before_row TEXT,after_row TEXT);
        CREATE TABLE IF NOT EXISTS _linear_commits(id TEXT PRIMARY KEY,parent TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _linear_local(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,ordinal INTEGER NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS _linear_receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,canonical_id TEXT NOT NULL,revision_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _linear_row_versions(table_name TEXT NOT NULL,row_key TEXT NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(table_name,row_key));
        CREATE TABLE IF NOT EXISTS _linear_table_versions(table_name TEXT PRIMARY KEY,revision TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _linear_branches(id TEXT PRIMARY KEY,reason TEXT NOT NULL,payload TEXT NOT NULL,database_bytes BLOB NOT NULL,database_hash TEXT NOT NULL,status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _linear_ack_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS _linear_body_mode(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
      `);
      if (fresh) {
        const initial = snapshot ? unpackLinearSnapshot(snapshot) : null;
        if (initial && initial.library !== library) throw new Error("LIBRARY_ID");
        if (initial && (initial.bodyMode ?? "rows") !== this.bodyMode) throw new Error("BODY_MODE");
        if (initial) {
          this.db.exec("BEGIN; PRAGMA defer_foreign_keys=ON");
          withoutTriggers(this.db, () => this.replaceRows(initial.rows));
          this.db.exec("COMMIT");
        }
        const epoch = initial?.epoch ?? randomUUID();
        const head =
          initial?.head ?? digest({ epoch, schema: schemaHash, rows: this.snapshotRows() });
        this.db
          .prepare(
            "INSERT INTO _linear_state(id,device,authority,library,schema_hash,epoch,head,ack_head) VALUES(1,?,?,?,?,?,?,?)"
          )
          .run(device, authority, library, schemaHash, epoch, head, head);
        this.db.prepare("INSERT INTO _linear_body_mode VALUES(1,?)").run(this.bodyMode);
        if (initial) this.loadVersions(initial);
        else
          for (const table of this.tables) {
            for (const row of this.rows(table.name))
              this.db
                .prepare("INSERT INTO _linear_row_versions VALUES(?,?,?)")
                .run(table.name, canonical(table.key.map(column => row[column])), head);
            this.db.prepare("INSERT INTO _linear_table_versions VALUES(?,?)").run(table.name, head);
          }
      }
      const state = this.state();
      if (
        state.device !== device ||
        state.library !== library ||
        state.authority !== authority ||
        state.schema_hash !== schemaHash
      )
        throw new Error("REPLICA_IDENTITY");
      if (this.db.prepare("SELECT value FROM _linear_body_mode").get()?.value !== this.bodyMode)
        throw new Error("BODY_MODE");
      this.initializeExtensions();
      if (fresh && snapshot) this.installSnapshotExtras(unpackLinearSnapshot(snapshot), "initial");
      this.installCapture();
      if (!this.db.prepare("SELECT 1 FROM _linear_ack_snapshot").get()) this.saveAck();
      const forbidden = new Set(
        [
          "SQLITE_CREATE_TABLE",
          "SQLITE_DROP_TABLE",
          "SQLITE_ALTER_TABLE",
          "SQLITE_CREATE_INDEX",
          "SQLITE_DROP_INDEX",
          "SQLITE_CREATE_TRIGGER",
          "SQLITE_DROP_TRIGGER",
          "SQLITE_CREATE_VIEW",
          "SQLITE_DROP_VIEW",
          "SQLITE_ATTACH",
          "SQLITE_DETACH",
          "SQLITE_TRANSACTION",
          "SQLITE_SAVEPOINT",
          "SQLITE_PRAGMA",
        ].map(name => constants[name])
      );
      this.db.setAuthorizer((action, table, _column, _database, trigger) => {
        if (this.context && forbidden.has(action)) return constants.SQLITE_DENY;
        if (this.context && trigger && !trigger.startsWith("_linear_") && this.tableMap.has(table))
          this.context.scoped = false;
        return constants.SQLITE_OK;
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  state() {
    return this.db.prepare("SELECT * FROM _linear_state").get();
  }
  rows(name) {
    const table = this.tableMap.get(name);
    if (!table) throw new Error("UNKNOWN_TABLE");
    return rawRows(this.db, table);
  }
  snapshotRows() {
    return Object.fromEntries(this.tables.map(table => [table.name, this.rows(table.name)]));
  }
  dataHash() {
    return digest(this.snapshotRows());
  }
  rowVersion(table, key) {
    return (
      this.db
        .prepare("SELECT revision FROM _linear_row_versions WHERE table_name=? AND row_key=?")
        .get(table, canonical(key))?.revision ?? null
    );
  }
  tableVersion(table) {
    return (
      this.db.prepare("SELECT revision FROM _linear_table_versions WHERE table_name=?").get(table)
        ?.revision ?? null
    );
  }
  record(table, key) {
    const spec = this.tableMap.get(table);
    if (!spec || key.length !== spec.key.length) throw new Error("ROW_KEY");
    const row = this.db
      .prepare(
        `SELECT * FROM ${quote(table)} WHERE ${spec.key.map(column => `${quote(column)} IS ?`).join(" AND ")}`
      )
      .get(...key);
    return row
      ? Object.fromEntries(
          Object.entries(row).map(([field, value]) => [
            field,
            value instanceof Uint8Array
              ? { $blob: Buffer.from(value).toString("hex").toUpperCase() }
              : value,
          ])
        )
      : null;
  }
  installCapture() {
    for (const table of this.tables) {
      const key = prefix =>
        `json_array(${table.key.map(column => `${prefix}.${quote(column)}`).join(",")})`;
      const row = prefix =>
        `json_object(${table.columns.flatMap(column => [literal(column), `CASE WHEN typeof(${prefix}.${quote(column)})='blob' THEN json_object('$blob',hex(${prefix}.${quote(column)})) ELSE ${prefix}.${quote(column)} END`]).join(",")})`;
      for (const [action, before, after, prefix] of [
        ["INSERT", "NULL", row("NEW"), "NEW"],
        ["UPDATE", row("OLD"), row("NEW"), "NEW"],
        ["DELETE", row("OLD"), "NULL", "OLD"],
      ]) {
        this.db.exec(`DROP TRIGGER IF EXISTS ${quote(`_linear_capture_${table.name}_${action}`)}`);
        this.db
          .exec(`CREATE TRIGGER ${quote(`_linear_capture_${table.name}_${action}`)} AFTER ${action} ON ${quote(table.name)} WHEN (SELECT applying FROM _linear_state)!=2 BEGIN
        SELECT CASE WHEN (SELECT applying FROM _linear_state)=0 AND (SELECT active_tx FROM _linear_state)=0 THEN RAISE(ABORT,'linear: transaction required') END;
        ${action === "UPDATE" ? `SELECT CASE WHEN ${key("OLD")}!=${key("NEW")} THEN RAISE(ABORT,'linear: immutable key') END;` : ""}
        SELECT CASE WHEN ${table.key.map(column => `${prefix}.${quote(column)} IS NULL`).join(" OR ")} THEN RAISE(ABORT,'linear: null key') END;
        INSERT INTO _linear_pending(table_name,row_key,before_row,after_row) VALUES(${literal(table.name)},${key(prefix)},${before},${after});END;`);
      }
    }
  }
  api(context) {
    const guard = (table, key) => {
      const identity = rowIdentity(table, key);
      if (!context.rows.has(identity))
        context.rows.set(identity, { table, key, version: this.rowVersion(table, key) });
    };
    const read = (table, key) => {
      guard(table, key);
      return this.record(table, key);
    };
    return {
      read,
      expect: (table, key, version) => {
        if (this.rowVersion(table, key) !== version) throw new Error("STALE_OBSERVATION");
        guard(table, key);
      },
      scan: table => {
        if (!this.tableMap.has(table)) throw new Error("UNKNOWN_TABLE");
        context.tables.set(table, { table, version: this.tableVersion(table) });
        return this.rows(table);
      },
      insert: (table, row) => {
        const spec = this.tableMap.get(table);
        if (!spec) throw new Error("UNKNOWN_TABLE");
        for (const field of Object.keys(row))
          if (!spec.columns.includes(field)) throw new Error("UNKNOWN_COLUMN");
        const names = Object.keys(row);
        const inserted = this.db
          .prepare(
            `INSERT INTO ${quote(table)}(${names.map(quote).join(",")}) VALUES(${names.map(() => "?").join(",")}) RETURNING *`
          )
          .get(...names.map(name => decode(row[name])));
        const key = spec.key.map(column => inserted[column]);
        guard(table, key);
        return inserted;
      },
      update: (table, key, fields) => {
        const before = read(table, key);
        if (!before) throw new Error("ROW_MISSING");
        const spec = this.tableMap.get(table);
        for (const name of Object.keys(fields))
          if (!spec.columns.includes(name) || spec.key.includes(name))
            throw new Error("UPDATE_COLUMN");
        const names = Object.keys(fields);
        if (names.length)
          this.db
            .prepare(
              `UPDATE ${quote(table)} SET ${names.map(name => `${quote(name)}=?`).join(",")} WHERE ${spec.key.map(name => `${quote(name)} IS ?`).join(" AND ")}`
            )
            .run(...names.map(name => decode(fields[name])), ...key);
      },
      remove: (table, key) => {
        guard(table, key);
        const spec = this.tableMap.get(table);
        this.db
          .prepare(
            `DELETE FROM ${quote(table)} WHERE ${spec.key.map(name => `${quote(name)} IS ?`).join(" AND ")}`
          )
          .run(...key);
      },
      exec: (sql, ...params) => {
        context.scoped = false;
        return this.db.prepare(sql).run(...params);
      },
    };
  }
  transaction(write, { scoped = false } = {}) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.state();
      const beforeDigest = this.dataHash();
      const context = { scoped, rows: new Map(), tables: new Map() };
      this.context = context;
      this.db.exec("UPDATE _linear_state SET active_tx=1");
      const result = write(scoped ? this.api(context) : this.db);
      if (result && typeof result.then === "function") throw new Error("ASYNC_TRANSACTION");
      this.context = null;
      const ops = this.db
        .prepare("SELECT * FROM _linear_pending ORDER BY ordinal")
        .all()
        .map(row => ({
          table: row.table_name,
          key: JSON.parse(row.row_key),
          before: row.before_row === null ? null : JSON.parse(row.before_row),
          after: row.after_row === null ? null : JSON.parse(row.after_row),
        }));
      if (ops.length) {
        for (const op of ops) {
          const identity = rowIdentity(op.table, op.key);
          if (!context.rows.has(identity))
            context.rows.set(identity, {
              table: op.table,
              key: op.key,
              version: this.rowVersion(op.table, op.key),
            });
        }
        const body = {
          protocol: 4,
          bodyMode: this.bodyMode,
          kind: "transaction",
          library: state.library,
          schema: schemaHash,
          epoch: state.epoch,
          parent: state.head,
          origin: `${state.device}:${randomUUID()}`,
          scoped: context.scoped,
          rows: [...context.rows.values()],
          tables: [...context.tables.values()],
          ops,
          beforeDigest,
          afterDigest: this.dataHash(),
        };
        this.prepareCommit(body, context);
        const commit = { ...body, id: digest(body) };
        this.append(commit);
        if (state.device === state.authority) {
          this.db.prepare("UPDATE _linear_state SET ack_head=?").run(commit.id);
          this.saveAck();
        } else
          this.db
            .prepare("INSERT INTO _linear_local VALUES(?,?,?)")
            .run(
              commit.id,
              digest(commit),
              this.db.prepare("SELECT coalesce(max(ordinal),0)+1 AS n FROM _linear_local").get().n
            );
      }
      this.db.exec("DELETE FROM _linear_pending; UPDATE _linear_state SET active_tx=0; COMMIT");
      return result;
    } catch (error) {
      this.context = null;
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  append(commit, source = commit) {
    const receipt = {
      id: source.id,
      fingerprint: digest(source),
      canonical_id: commit.id,
      revision_id: commit.id,
    };
    this.db
      .prepare("INSERT INTO _linear_commits VALUES(?,?,?)")
      .run(commit.id, commit.parent, canonical({ commit, receipt }));
    for (const op of commit.ops) {
      this.db
        .prepare(
          "INSERT INTO _linear_row_versions VALUES(?,?,?) ON CONFLICT(table_name,row_key) DO UPDATE SET revision=excluded.revision"
        )
        .run(op.table, canonical(op.key), commit.id);
      this.db
        .prepare(
          "INSERT INTO _linear_table_versions VALUES(?,?) ON CONFLICT(table_name) DO UPDATE SET revision=excluded.revision"
        )
        .run(op.table, commit.id);
    }
    this.db
      .prepare("INSERT OR IGNORE INTO _linear_receipts VALUES(?,?,?,?)")
      .run(commit.id, digest(commit), commit.id, commit.id);
    if (source.id !== commit.id)
      this.db
        .prepare("INSERT INTO _linear_receipts VALUES(?,?,?,?)")
        .run(source.id, digest(source), commit.id, commit.id);
    this.db.prepare("UPDATE _linear_state SET head=?").run(commit.id);
  }
  revision(identity) {
    return identity === null
      ? null
      : (this.db.prepare("SELECT revision_id FROM _linear_receipts WHERE id=?").get(identity)
          ?.revision_id ?? identity);
  }
  validateCommit(commit) {
    const { id, ...body } = commit;
    const state = this.state();
    if (
      digest(body) !== id ||
      commit.protocol !== 4 ||
      commit.schema !== schemaHash ||
      commit.library !== state.library ||
      !Array.isArray(commit.ops) ||
      (!commit.ops.length && !this.isCustomCommit(commit)) ||
      (commit.bodyMode ?? "rows") !== this.bodyMode
    )
      throw new Error("COMMIT_IDENTITY");
    const guarded = new Set(commit.rows.map(guard => rowIdentity(guard.table, guard.key)));
    for (const guard of commit.rows) {
      const table = this.tableMap.get(guard.table);
      if (
        !table ||
        guard.key.length !== table.key.length ||
        (guard.version !== null && typeof guard.version !== "string")
      )
        throw new Error("READ_GUARD");
    }
    for (const guard of commit.tables)
      if (!this.tableMap.has(guard.table) || typeof guard.version !== "string")
        throw new Error("TABLE_GUARD");
    for (const op of commit.ops) {
      const table = this.tableMap.get(op.table);
      if (
        !table ||
        op.key.length !== table.key.length ||
        !guarded.has(rowIdentity(op.table, op.key))
      )
        throw new Error("WRITE_GUARD");
      for (const row of [op.before, op.after])
        if (
          row !== null &&
          (canonical(Object.keys(row).sort()) !== canonical([...table.columns].sort()) ||
            canonical(table.key.map(column => row[column])) !== canonical(op.key))
        )
          throw new Error("ROW_IDENTITY");
    }
  }
  applyCommit(source) {
    this.validateCommit(source);
    const known = this.db.prepare("SELECT * FROM _linear_receipts WHERE id=?").get(source.id);
    if (known) {
      if (known.fingerprint !== digest(source)) throw new Error("COMMIT_REUSED");
      return "duplicate";
    }
    const state = this.state();
    if (source.epoch !== state.epoch) throw new Error("EPOCH_FORK");
    const parent =
      this.db.prepare("SELECT canonical_id FROM _linear_receipts WHERE id=?").get(source.parent)
        ?.canonical_id ?? source.parent;
    const beforeDigest = this.dataHash();
    const linear = parent === state.head && beforeDigest === source.beforeDigest;
    if (!linear && !source.scoped) throw new Error("OPAQUE_FORK");
    for (const guard of source.rows)
      if (this.rowVersion(guard.table, guard.key) !== this.revision(guard.version))
        throw new Error("ROW_DEPENDENCY_CHANGED");
    for (const guard of source.tables)
      if (this.tableVersion(guard.table) !== this.revision(guard.version))
        throw new Error("TABLE_DEPENDENCY_CHANGED");
    this.db.exec(
      "DELETE FROM _linear_pending; UPDATE _linear_state SET applying=1; PRAGMA defer_foreign_keys=ON"
    );
    withoutTriggers(this.db, () => {
      for (const op of source.ops) {
        const table = this.tableMap.get(op.table);
        const current = this.record(op.table, op.key);
        if (canonical(current) === canonical(op.after)) continue;
        if (canonical(current) !== canonical(op.before)) throw new Error("ROW_PREIMAGE_CHANGED");
        if (op.after === null)
          this.db
            .prepare(
              `DELETE FROM ${quote(op.table)} WHERE ${table.key.map(column => `${quote(column)} IS ?`).join(" AND ")}`
            )
            .run(...op.key);
        else writeRow(this.db, table, op.after);
      }
    });
    const expected = new Map(source.ops.map(op => [rowIdentity(op.table, op.key), op]));
    for (const actual of this.db.prepare("SELECT table_name,row_key FROM _linear_pending").all())
      if (!expected.has(`${actual.table_name}:${actual.row_key}`))
        throw new Error("UNDECLARED_APPLY_EFFECT");
    for (const op of expected.values())
      if (canonical(this.record(op.table, op.key)) !== canonical(op.after))
        throw new Error("POSTIMAGE_CHANGED");
    if (this.db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("FOREIGN_KEY_CHECK");
    const afterDigest = this.dataHash();
    if (linear && afterDigest !== source.afterDigest) throw new Error("POST_STATE_CHANGED");
    const body = {
      ...source,
      parent: state.head,
      beforeDigest,
      afterDigest,
      rows: source.rows.map(guard => ({ ...guard, version: this.revision(guard.version) })),
      tables: source.tables.map(guard => ({ ...guard, version: this.revision(guard.version) })),
    };
    delete body.id;
    const commit = { ...body, id: digest(body) };
    this.append(commit, source);
    this.db.exec("DELETE FROM _linear_pending; UPDATE _linear_state SET applying=0");
    this.db.prepare("UPDATE _linear_state SET ack_head=?").run(commit.id);
    return linear ? "incremental" : "rebased";
  }
  readTransaction(work) {
    const owns = !this.db.isTransaction;
    if (owns) this.db.exec("BEGIN");
    try {
      const result = work();
      if (owns) this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (owns) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  exportSnapshot() {
    return this.readTransaction(() => {
      const state = this.state();
      const snapshot = {
        protocol: 4,
        bodyMode: this.bodyMode,
        library: state.library,
        schema: schemaHash,
        epoch: state.epoch,
        head: state.head,
        rows: this.snapshotRows(),
        rowVersions: this.db
          .prepare("SELECT * FROM _linear_row_versions ORDER BY table_name,row_key")
          .all(),
        tableVersions: this.db
          .prepare("SELECT * FROM _linear_table_versions ORDER BY table_name")
          .all(),
        receipts: this.db.prepare("SELECT * FROM _linear_receipts ORDER BY id").all(),
        ...this.snapshotExtras(),
      };
      snapshot.dataHash = digest(snapshot.rows);
      const body = canonical(snapshot);
      return { id: digest(body), body };
    });
  }
  saveAck() {
    this.db
      .prepare("INSERT OR REPLACE INTO _linear_ack_snapshot VALUES(1,?)")
      .run(canonical(this.exportSnapshot()));
  }
  localCommit(id) {
    const row = this.db.prepare("SELECT payload FROM _linear_commits WHERE id=?").get(id);
    if (!row) throw new Error("LOCAL_LOG_MISSING");
    return JSON.parse(row.payload).commit;
  }
  bundle({ includeSnapshot = true } = {}) {
    return this.readTransaction(() => {
      const state = this.state();
      const pending = this.db.prepare("SELECT * FROM _linear_local ORDER BY ordinal").all();
      const snapshot = this.exportSnapshot();
      return {
        protocol: 4,
        bodyMode: this.bodyMode,
        library: state.library,
        schema: schemaHash,
        epoch: state.epoch,
        base: state.ack_head,
        head: state.head,
        snapshotOnly: Boolean(state.snapshot_only),
        pending,
        commits: state.snapshot_only ? [] : pending.map(row => this.localCommit(row.id)),
        snapshotId: snapshot.id,
        ...(includeSnapshot ? { snapshot } : {}),
      };
    });
  }
  suffix(base) {
    const records = [];
    let head = this.state().head;
    while (head !== base) {
      const row = this.db.prepare("SELECT * FROM _linear_commits WHERE id=?").get(head);
      if (!row || records.length >= 256) return null;
      records.push(JSON.parse(row.payload));
      head = row.parent;
    }
    return records.reverse();
  }
  loadVersions(snapshot) {
    for (const table of ["_linear_row_versions", "_linear_table_versions", "_linear_receipts"])
      this.db.exec(`DELETE FROM ${table}`);
    for (const row of snapshot.rowVersions)
      this.db
        .prepare("INSERT INTO _linear_row_versions VALUES(?,?,?)")
        .run(row.table_name, row.row_key, row.revision);
    for (const row of snapshot.tableVersions)
      this.db
        .prepare("INSERT INTO _linear_table_versions VALUES(?,?)")
        .run(row.table_name, row.revision);
    for (const row of snapshot.receipts)
      this.db
        .prepare("INSERT INTO _linear_receipts VALUES(?,?,?,?)")
        .run(row.id, row.fingerprint, row.canonical_id, row.revision_id);
  }
  replaceRows(rows, { failAfterRows, crashAfterRows } = {}) {
    let count = 0;
    const order = dependencyOrder(this.tables);
    for (const table of [...order].reverse()) this.db.exec(`DELETE FROM ${quote(table.name)}`);
    for (const table of order)
      for (const row of rows[table.name]) {
        writeRow(this.db, table, row);
        if (++count === crashAfterRows) process.exit(17);
        if (count === failAfterRows) throw new Error("INSTALL_INTERRUPTED");
      }
    if (this.db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("FOREIGN_KEY_CHECK");
  }
  archive(envelope, reason) {
    const snapshot = unpackLinearSnapshot(envelope);
    if (snapshot.library !== this.state().library) throw new Error("BRANCH_LIBRARY");
    const existing = this.db.prepare("SELECT id FROM _linear_branches WHERE id=?").get(envelope.id);
    if (existing) return envelope.id;
    const bytes = this.decorateDatabaseCopy(validateRows(snapshot.rows), snapshot);
    this.db
      .prepare("INSERT INTO _linear_branches VALUES(?,?,?,?,?,'preserved')")
      .run(envelope.id, reason, envelope.body, bytes, digest(bytes));
    return envelope.id;
  }
  acceptBundle(bundle) {
    const state = this.state();
    if (state.device !== state.authority) throw new Error("AUTHORITY_ONLY");
    if (bundle.protocol !== 4 || bundle.library !== state.library || bundle.schema !== schemaHash)
      throw new Error("BUNDLE_IDENTITY");
    if ((bundle.bodyMode ?? "rows") !== this.bodyMode) throw new Error("BODY_MODE");
    const snapshot = bundle.snapshot ? unpackLinearSnapshot(bundle.snapshot) : null;
    if (!/^[a-f0-9]{64}$/.test(bundle.snapshotId ?? "")) throw new Error("BUNDLE_SNAPSHOT_ID");
    if (
      snapshot &&
      (snapshot.library !== state.library ||
        snapshot.head !== bundle.head ||
        snapshot.epoch !== bundle.epoch ||
        bundle.snapshot.id !== bundle.snapshotId)
    )
      throw new Error("BUNDLE_SNAPSHOT");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.state();
      this.beforeAcceptBundle(bundle);
      let mode = "current";
      let branchId = null;
      let conflict = null;
      this.db.exec("SAVEPOINT incoming");
      try {
        if (bundle.pending.length) {
          if (bundle.epoch !== current.epoch && !this.allowForkEpoch(bundle))
            throw new Error("EPOCH_FORK");
          const alreadyKnown = bundle.pending.every(row => {
            const receipt = this.db
              .prepare("SELECT * FROM _linear_receipts WHERE id=?")
              .get(row.id);
            if (receipt && receipt.fingerprint !== row.fingerprint)
              throw new Error("COMMIT_REUSED");
            return Boolean(receipt);
          });
          if (alreadyKnown) {
            mode = "current";
          } else if (bundle.snapshotOnly) {
            if (bundle.base !== current.head) throw new Error("SNAPSHOT_FORK");
            if (!snapshot) throw new Error("SNAPSHOT_REQUIRED");
            validateRows(snapshot.rows);
            const newHead = digest({
              kind: "snapshot-forward",
              epoch: current.epoch,
              parent: current.head,
              source: bundle.snapshot.id,
            });
            this.db.exec("UPDATE _linear_state SET applying=2; PRAGMA defer_foreign_keys=ON");
            withoutTriggers(this.db, () => this.replaceRows(snapshot.rows));
            this.loadVersions(snapshot);
            this.installSnapshotExtras(snapshot, "target");
            for (const pending of bundle.pending)
              this.db
                .prepare("INSERT OR REPLACE INTO _linear_receipts VALUES(?,?,?,?)")
                .run(pending.id, pending.fingerprint, newHead, pending.id);
            this.db
              .prepare("UPDATE _linear_state SET head=?,ack_head=?,applying=0")
              .run(newHead, newHead);
            mode = "snapshot-forward";
          } else {
            if (bundle.commits.length !== bundle.pending.length) throw new Error("BUNDLE_LOG");
            for (const [index, commit] of bundle.commits.entries()) {
              if (
                commit.id !== bundle.pending[index].id ||
                digest(commit) !== bundle.pending[index].fingerprint
              )
                throw new Error("BUNDLE_COMMIT_HASH");
              const applied = this.applyCommit(commit);
              if (applied === "rebased" || mode === "rebased") mode = "rebased";
              else if (applied === "incremental") mode = "incremental";
            }
          }
        }
        this.db.exec("RELEASE incoming");
      } catch (error) {
        this.db.exec("ROLLBACK TO incoming; RELEASE incoming");
        conflict = error.message;
        if (!snapshot) {
          this.db.exec("COMMIT");
          return { kind: "needs-snapshot", reason: conflict };
        }
        branchId = this.archive(bundle.snapshot, conflict);
        mode = "conflict";
      }
      const stateNow = this.state();
      const records =
        mode === "conflict" || bundle.epoch !== stateNow.epoch || bundle.forceSnapshot
          ? null
          : this.suffix(bundle.base);
      const response = {
        mode,
        branchId,
        conflict,
        sourceSnapshot: bundle.snapshotId,
        sourceHead: bundle.head,
        base: bundle.base,
        epoch: stateNow.epoch,
        head: stateNow.head,
        dataHash: this.dataHash(),
        proofReceipts: bundle.pending
          .map(row => this.db.prepare("SELECT * FROM _linear_receipts WHERE id=?").get(row.id))
          .filter(Boolean),
        kind: records === null ? "snapshot" : "incremental",
        ...(records === null ? { snapshot: this.exportSnapshot() } : { records }),
      };
      this.saveAck();
      this.db.exec("COMMIT");
      return response;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  installResponse(response, options = {}) {
    const state = this.state();
    if (response.sourceHead !== state.head || response.sourceSnapshot !== this.exportSnapshot().id)
      throw new Error("LOCAL_CHANGED_DURING_SYNC");
    const snapshot = response.kind === "snapshot" ? unpackLinearSnapshot(response.snapshot) : null;
    if (
      snapshot &&
      (snapshot.library !== state.library ||
        snapshot.head !== response.head ||
        snapshot.epoch !== response.epoch ||
        snapshot.dataHash !== response.dataHash)
    )
      throw new Error("SNAPSHOT_RESPONSE_IDENTITY");
    const pending = this.db.prepare("SELECT * FROM _linear_local ORDER BY ordinal").all();
    const protectedByBranch =
      response.mode === "conflict" && response.branchId === response.sourceSnapshot;
    if (
      pending.some(
        row =>
          !response.proofReceipts.some(
            receipt => receipt.id === row.id && receipt.fingerprint === row.fingerprint
          )
      ) &&
      !protectedByBranch
    )
      throw new Error("LOCAL_NOT_PROTECTED");
    this.db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON");
    try {
      if (response.sourceHead !== this.state().head) throw new Error("LOCAL_CHANGED_DURING_SYNC");
      if (protectedByBranch) this.archive(this.exportSnapshot(), response.conflict);
      this.db.exec("UPDATE _linear_state SET applying=2");
      this.db.exec("DELETE FROM _linear_commits");
      if (snapshot) {
        withoutTriggers(this.db, () => this.replaceRows(snapshot.rows, options));
        this.loadVersions(snapshot);
        this.installSnapshotExtras(snapshot, "target");
      } else if (response.head === state.head && !pending.length) {
        if (this.dataHash() !== response.dataHash) throw new Error("INCREMENTAL_STATE");
      } else {
        if (response.epoch !== state.epoch || response.base !== state.ack_head)
          throw new Error("INCREMENTAL_BASE");
        if (pending.length) {
          const ack = unpackLinearSnapshot(
            JSON.parse(this.db.prepare("SELECT payload FROM _linear_ack_snapshot").get().payload)
          );
          if (ack.head !== response.base) throw new Error("ACK_SNAPSHOT_BASE");
          withoutTriggers(this.db, () => this.replaceRows(ack.rows, options));
          this.loadVersions(ack);
          this.installSnapshotExtras(ack, "ack");
          this.db.prepare("UPDATE _linear_state SET head=?").run(ack.head);
        }
        for (const record of response.records) {
          const commit = record.commit;
          if (commit.parent !== this.state().head || commit.epoch !== state.epoch)
            throw new Error("INCREMENTAL_CHAIN");
          this.applyCommit(commit);
          const receipt = record.receipt;
          if (receipt.canonical_id !== commit.id || receipt.revision_id !== commit.id)
            throw new Error("INCREMENTAL_RECEIPT");
          this.db
            .prepare("INSERT OR REPLACE INTO _linear_receipts VALUES(?,?,?,?)")
            .run(receipt.id, receipt.fingerprint, receipt.canonical_id, receipt.revision_id);
        }
      }
      if (
        this.dataHash() !== response.dataHash ||
        (!snapshot && this.state().head !== response.head)
      )
        throw new Error("INSTALL_HASH");
      this.db.exec("DELETE FROM _linear_local; DELETE FROM _linear_pending");
      this.db
        .prepare(
          "UPDATE _linear_state SET epoch=?,head=?,ack_head=?,snapshot_only=0,applying=0,active_tx=0"
        )
        .run(response.epoch, response.head, response.head);
      this.afterInstallResponse(response);
      this.saveAck();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  compact() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM _linear_commits");
      if (this.db.prepare("SELECT 1 FROM _linear_local").get())
        this.db.exec("UPDATE _linear_state SET snapshot_only=1");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  branches() {
    return this.db
      .prepare(
        "SELECT id,reason,status,database_hash,length(database_bytes) AS bytes FROM _linear_branches ORDER BY id"
      )
      .all();
  }
  exportBranch(id, path) {
    const branch = this.db.prepare("SELECT * FROM _linear_branches WHERE id=?").get(id);
    if (!branch || digest(branch.database_bytes) !== branch.database_hash)
      throw new Error("BRANCH_CORRUPT");
    writeFileSync(path, branch.database_bytes, { flag: "wx", mode: 0o600 });
    return path;
  }
  chooseBranch(id, { expectedHead, failAfterRows } = {}) {
    this.db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON");
    try {
      const state = this.state();
      if (state.device !== state.authority || state.head !== expectedHead)
        throw new Error("CHOICE_HEAD_CHANGED");
      const branch = this.db.prepare("SELECT * FROM _linear_branches WHERE id=?").get(id);
      if (!branch || digest(branch.database_bytes) !== branch.database_hash)
        throw new Error("BRANCH_CORRUPT");
      const selected = unpackLinearSnapshot({ id, body: branch.payload });
      const previous = this.archive(this.exportSnapshot(), "displaced-by-choice");
      this.db.exec("UPDATE _linear_state SET applying=2");
      withoutTriggers(this.db, () => this.replaceRows(selected.rows, { failAfterRows }));
      this.installChoiceExtras(selected);
      const epoch = randomUUID();
      const head = digest({
        kind: "choice",
        epoch,
        selected: id,
        parent: state.head,
        data: this.dataHash(),
      });
      this.db.exec(
        "DELETE FROM _linear_commits; DELETE FROM _linear_local; DELETE FROM _linear_row_versions; DELETE FROM _linear_table_versions"
      );
      for (const table of this.tables) {
        for (const row of this.rows(table.name))
          this.db
            .prepare("INSERT INTO _linear_row_versions VALUES(?,?,?)")
            .run(table.name, canonical(table.key.map(column => row[column])), head);
        this.db.prepare("INSERT INTO _linear_table_versions VALUES(?,?)").run(table.name, head);
      }
      this.db.prepare("UPDATE _linear_branches SET status='chosen' WHERE id=?").run(id);
      this.db
        .prepare("UPDATE _linear_state SET epoch=?,head=?,ack_head=?,snapshot_only=0,applying=0")
        .run(epoch, head, head);
      this.saveAck();
      this.db.exec("COMMIT");
      return { head, previous };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    if (!this.closed) this.db.close();
    this.closed = true;
  }
}

export function syncLinear(replica, authority, options) {
  let response = authority.acceptBundle(replica.bundle({ includeSnapshot: false }));
  if (response.kind === "needs-snapshot") response = authority.acceptBundle(replica.bundle());
  replica.installResponse(response, options);
  return response;
}

export { digest as linearDigest, withoutTriggers };
