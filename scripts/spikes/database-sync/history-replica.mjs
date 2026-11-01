import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { brotliDecompressSync } from "node:zlib";
import { canonical } from "./replica.mjs";
import { SemanticReplica } from "./semantic-replica.mjs";
import { auditContracts, contractHash, requireAdapters } from "./contracts.mjs";

const hash = value =>
  createHash("sha256")
    .update(typeof value === "string" || value instanceof Uint8Array ? value : canonical(value))
    .digest("hex");
const keyOf = (device, sequence) => `${device}:${sequence}`;
const rowKey = row => `${row.table_name}:${row.row_key}`;
const versionKey = row => `${rowKey(row)}:${keyOf(row.device, row.sequence)}`;
const quote = name => `"${name.replaceAll('"', '""')}"`;
export const covers = (frontier, target) =>
  Object.entries(target).every(([device, sequence]) => (frontier[device] ?? 0) >= sequence);

export function openCheckpoint(envelope) {
  if (
    typeof envelope.body !== "string" ||
    Buffer.byteLength(envelope.body) > 64 * 1024 * 1024 ||
    hash(envelope.body) !== envelope.id
  )
    throw new Error("CHECKPOINT_HASH");
  const checkpoint = JSON.parse(envelope.body);
  if (
    checkpoint.format !== "tau-sync-checkpoint" ||
    checkpoint.protocol !== 3 ||
    !Number.isSafeInteger(checkpoint.epoch)
  )
    throw new Error("CHECKPOINT_FORMAT");
  return checkpoint;
}

export class HistoryReplica extends SemanticReplica {
  get protocol() {
    return 3;
  }

  constructor(path, options) {
    let actor = options.device;
    if (existsSync(path) && statSync(path).size) {
      const reader = new DatabaseSync(path, { readOnly: true });
      try {
        if (
          reader.prepare("SELECT 1 FROM sqlite_master WHERE name='_spike_local_identity'").get()
        ) {
          const identity = reader.prepare("SELECT logical_device FROM _spike_local_identity").get();
          if (identity.logical_device === options.device)
            actor = reader.prepare("SELECT device FROM _spike_state").get().device;
        }
      } finally {
        reader.close();
      }
    }
    super(path, { ...options, device: actor });
    const authority = options.authority ?? "desktop";
    this.db
      .prepare("INSERT OR IGNORE INTO _spike_history VALUES(1,?,?,?,0,NULL)")
      .run(authority, this.rulesHash, "{}");
    const state = this.history();
    if (state.authority !== authority || state.rules_hash !== this.rulesHash) {
      this.close();
      throw new Error("HISTORY_CONTRACT_MISMATCH");
    }
    if (this.logicalDevice === authority) this.register(this);
  }

  initializeExtensions() {
    super.initializeExtensions();
    this.contracts = auditContracts(this.db);
    this.rulesHash = contractHash(this.contracts);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _spike_local_identity(id INTEGER PRIMARY KEY CHECK(id=1),logical_device TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _spike_history(id INTEGER PRIMARY KEY CHECK(id=1),authority TEXT NOT NULL,rules_hash TEXT NOT NULL,floor TEXT NOT NULL,epoch INTEGER NOT NULL,checkpoint_id TEXT);
      CREATE TABLE IF NOT EXISTS _spike_members(device TEXT PRIMARY KEY,active INTEGER NOT NULL,ack_checkpoint TEXT,ack_frontier TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _spike_retired(device TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS _spike_receipts(device TEXT NOT NULL,sequence INTEGER NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,result_device TEXT,result_sequence INTEGER,PRIMARY KEY(device,sequence));
      CREATE TABLE IF NOT EXISTS _spike_outbox(device TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,seal TEXT NOT NULL,PRIMARY KEY(device,sequence));
      CREATE TABLE IF NOT EXISTS _spike_deletion_bases(table_name TEXT NOT NULL,row_key TEXT NOT NULL,device TEXT NOT NULL,sequence INTEGER NOT NULL,row_value TEXT,PRIMARY KEY(table_name,row_key,device,sequence));
      CREATE TABLE IF NOT EXISTS _spike_recovery_branches(device TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(device,sequence));
      CREATE TABLE IF NOT EXISTS _spike_checkpoints(id TEXT PRIMARY KEY,body TEXT NOT NULL);
    `);
    this.db
      .prepare("INSERT OR IGNORE INTO _spike_local_identity VALUES(1,?)")
      .run(this.state.device);
    this.logicalDevice = this.db
      .prepare("SELECT logical_device FROM _spike_local_identity")
      .get().logical_device;
  }

  history() {
    return this.db.prepare("SELECT * FROM _spike_history").get();
  }
  authorityOnly() {
    if (this.logicalDevice !== this.history().authority)
      throw new Error("CHECKPOINT_AUTHORITY_ONLY");
  }
  receipt(device, sequence) {
    return this.db
      .prepare("SELECT * FROM _spike_receipts WHERE device=? AND sequence=?")
      .get(device, sequence);
  }

  register(peer) {
    this.authorityOnly();
    if (peer.state.library !== this.state.library || peer.rulesHash !== this.rulesHash)
      throw new Error("PEER_CONTRACT");
    this.db
      .prepare("INSERT OR IGNORE INTO _spike_members VALUES(?,1,NULL,'{}')")
      .run(peer.state.device);
  }

  retire(peer) {
    this.authorityOnly();
    const device = typeof peer === "string" ? peer : peer.state.device;
    if (device === this.state.device) throw new Error("CANNOT_RETIRE_AUTHORITY");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE _spike_members SET active=0 WHERE device=?").run(device);
      this.db.prepare("INSERT OR IGNORE INTO _spike_retired VALUES(?)").run(device);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  prepareBatch(batch) {
    requireAdapters(
      this.contracts,
      batch.changes.map(change => change.table)
    );
    super.prepareBatch(batch);
    batch.rules = this.rulesHash;
  }

  validate(batch) {
    if (batch.rules !== this.rulesHash) throw new Error("RULES_MISMATCH");
    requireAdapters(
      this.contracts,
      batch.changes.map(change => change.table)
    );
    super.validate(batch);
  }

  storeBatch(batch) {
    const changes = batch.changes.map(change => {
      const decoded = this.decodeChange(change);
      return {
        table: change.table,
        key: change.key,
        generation: change.generation,
        restoreOf: change.restoreOf,
        before: decoded.before,
        after: decoded.after,
      };
    });
    super.storeBatch(batch);
    const fingerprint = hash(batch);
    this.db
      .prepare("INSERT INTO _spike_receipts VALUES(?,?,?,'applied',?,?)")
      .run(batch.device, batch.sequence, fingerprint, batch.device, batch.sequence);
    if (batch.device === this.state.device) {
      const entry = { batch, fingerprint, changes };
      const packed = {
        ...entry,
        changes: changes.map(change => ({
          ...change,
          before: this.codec.packRow(change.before),
          after: this.codec.packRow(change.after),
        })),
      };
      this.db
        .prepare("INSERT INTO _spike_outbox VALUES(?,?,?,?)")
        .run(batch.device, batch.sequence, canonical(packed), hash(entry));
    }
  }

  receive(batch, options) {
    const known = this.receipt(batch.device, batch.sequence);
    if (known) {
      if (known.fingerprint !== hash(batch)) throw new Error("OPERATION_ID_REUSED");
      return "checkpointed";
    }
    if (
      this.db.prepare("SELECT 1 FROM _spike_retired WHERE device=?").get(batch.device) ||
      !covers(batch.observed ?? {}, JSON.parse(this.history().floor))
    )
      throw new Error("NEEDS_CHECKPOINT");
    return super.receive(batch, options);
  }

  exportSince(frontier = {}) {
    if (!covers(frontier, JSON.parse(this.history().floor))) throw new Error("NEEDS_CHECKPOINT");
    return super.exportSince(frontier);
  }

  exportRecoveryArchive({ includeRelay = false } = {}) {
    const entries = this.db
      .prepare("SELECT * FROM _spike_outbox ORDER BY device,sequence")
      .all()
      .map(stored => {
        const packed = JSON.parse(stored.payload);
        const entry = {
          ...packed,
          changes: packed.changes.map(change => ({
            ...change,
            before: this.codec.unpackRow(change.before),
            after: this.codec.unpackRow(change.after),
          })),
        };
        if (hash(entry) !== stored.seal) throw new Error("OUTBOX_CORRUPT");
        return { ...entry, seal: stored.seal };
      });
    if (includeRelay) {
      const known = new Set(entries.map(entry => keyOf(entry.batch.device, entry.batch.sequence)));
      for (const row of this.db
        .prepare("SELECT payload FROM _spike_batches ORDER BY clock,device,sequence")
        .all()) {
        const batch = JSON.parse(row.payload);
        if (known.has(keyOf(batch.device, batch.sequence))) continue;
        const changes = batch.changes.map(change => {
          const decoded = this.decodeChange(change);
          return {
            table: change.table,
            key: change.key,
            generation: change.generation,
            restoreOf: change.restoreOf,
            before: decoded.before,
            after: decoded.after,
          };
        });
        const entry = { batch, fingerprint: hash(batch), changes };
        entries.push({ ...entry, seal: hash(entry) });
      }
    }
    return entries.sort(
      (left, right) =>
        left.batch.clock - right.batch.clock ||
        left.batch.device.localeCompare(right.batch.device) ||
        left.batch.sequence - right.batch.sequence
    );
  }

  confirmOutbox(authority) {
    if (authority.logicalDevice !== this.history().authority)
      throw new Error("AUTHORITY_RECEIPT_REQUIRED");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of this.exportRecoveryArchive()) {
        const receipt = authority.receipt(entry.batch.device, entry.batch.sequence);
        if (receipt?.fingerprint === entry.fingerprint)
          this.db
            .prepare("DELETE FROM _spike_outbox WHERE device=? AND sequence=?")
            .run(entry.batch.device, entry.batch.sequence);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  beforeDeletion(table, key, deletion) {
    const saved = this.db
      .prepare(
        "SELECT row_value FROM _spike_deletion_bases WHERE table_name=? AND row_key=? AND device=? AND sequence=?"
      )
      .get(table, canonical(key), deletion.device, deletion.sequence);
    return saved
      ? this.codec.unpackRow(JSON.parse(saved.row_value))
      : super.beforeDeletion(table, key, deletion);
  }

  replicatedSnapshot() {
    const rows = this.snapshot();
    for (const contract of this.contracts)
      if (contract.scope === "local" || contract.scope === "rebuild") rows[contract.table] = [];
    return rows;
  }

  assertSnapshotSupported(rows) {
    const baseline = this.initialBaseline().rows;
    for (const contract of this.contracts)
      if (
        contract.scope === "replicated" &&
        !contract.adapter &&
        canonical(rows[contract.table]) !== canonical(baseline[contract.table])
      )
        throw new Error(`UNSUPPORTED_RULE: ${contract.table}`);
  }

  checkpointRoots(versions, deletions, branches) {
    const roots = new Set();
    const scan = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value.$chunks)) for (const id of value.$chunks) roots.add(id);
      for (const child of Object.values(value)) scan(child);
    };
    for (const row of versions) if (row.after_row !== null) scan(JSON.parse(row.after_row));
    for (const row of deletions) scan(JSON.parse(row.row_value));
    for (const row of branches) scan(JSON.parse(row.payload));
    for (const rows of Object.values(this.initialBaseline().rows))
      for (const row of rows) scan(this.codec.packRow(row));
    return roots;
  }

  createCheckpoint() {
    this.authorityOnly();
    this.assertSnapshotSupported(this.replicatedSnapshot());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const all = this.db
        .prepare("SELECT * FROM _spike_versions ORDER BY table_name,row_key,device,sequence")
        .all();
      const groups = Map.groupBy(all, rowKey);
      const keep = new Map();
      for (const versions of groups.values()) {
        for (const version of versions)
          if (
            !versions.some(
              other =>
                other !== version &&
                (JSON.parse(other.observed)[version.device] ?? 0) >= version.sequence
            )
          )
            keep.set(versionKey(version), version);
        const winner = this.winner(versions[0].table_name, JSON.parse(versions[0].row_key));
        keep.set(
          versionKey(winner),
          all.find(row => versionKey(row) === versionKey(winner))
        );
      }
      const versions = [...keep.values()];
      const generations = versions.map(row =>
        this.db
          .prepare(
            "SELECT * FROM _spike_generations WHERE table_name=? AND row_key=? AND device=? AND sequence=?"
          )
          .get(row.table_name, row.row_key, row.device, row.sequence)
      );
      const deletions = versions
        .filter(row => row.after_row === null)
        .map(row => ({
          table_name: row.table_name,
          row_key: row.row_key,
          device: row.device,
          sequence: row.sequence,
          row_value: canonical(
            this.codec.packRow(this.beforeDeletion(row.table_name, JSON.parse(row.row_key), row))
          ),
        }));
      const branches = this.db
        .prepare("SELECT * FROM _spike_recovery_branches ORDER BY device,sequence")
        .all();
      const roots = this.checkpointRoots(versions, deletions, branches);
      const chunks = [...roots].sort().map(id => {
        const chunk = this.db.prepare("SELECT * FROM _spike_chunks WHERE hash=?").get(id);
        if (!chunk) throw new Error("CHECKPOINT_MISSING_CHUNK");
        return {
          hash: chunk.hash,
          raw_size: chunk.raw_size,
          data: Buffer.from(chunk.data).toString("base64"),
        };
      });
      const checkpoint = {
        format: "tau-sync-checkpoint",
        protocol: 3,
        epoch: this.history().epoch + 1,
        group: this.state.library,
        schema: this.state.schema_hash,
        baselineHash: this.state.baseline_hash,
        authority: this.history().authority,
        rules: this.rulesHash,
        contracts: this.contracts,
        frontier: this.frontier(),
        clock: this.db.prepare("SELECT clock FROM _spike_state").get().clock,
        baseline: this.initialBaseline(),
        rows: this.replicatedSnapshot(),
        versions,
        generations,
        deletions,
        receipts: this.db.prepare("SELECT * FROM _spike_receipts ORDER BY device,sequence").all(),
        branches,
        quarantine: this.db
          .prepare("SELECT * FROM _spike_quarantine ORDER BY table_name,row_key")
          .all(),
        orphans: this.db.prepare("SELECT * FROM _spike_orphans ORDER BY table_name,row_key").all(),
        retired: this.db.prepare("SELECT device FROM _spike_retired ORDER BY device").all(),
        chunks,
      };
      checkpoint.controlHash = hash({
        receipts: checkpoint.receipts,
        branches: checkpoint.branches,
        retired: checkpoint.retired,
      });
      const body = canonical(checkpoint);
      const id = hash(body);
      this.db.prepare("INSERT INTO _spike_checkpoints VALUES(?,?)").run(id, body);
      this.db
        .prepare("UPDATE _spike_history SET epoch=?,checkpoint_id=?")
        .run(checkpoint.epoch, id);
      this.db
        .prepare("UPDATE _spike_members SET ack_checkpoint=?,ack_frontier=? WHERE device=?")
        .run(id, canonical(checkpoint.frontier), this.state.device);
      this.db.exec("COMMIT");
      return { id, body };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  acknowledge(peer) {
    this.authorityOnly();
    const state = this.history();
    if (peer.history().checkpoint_id !== state.checkpoint_id)
      throw new Error("CHECKPOINT_NOT_INSTALLED");
    this.db
      .prepare(
        "UPDATE _spike_members SET ack_checkpoint=?,ack_frontier=? WHERE device=? AND active=1"
      )
      .run(state.checkpoint_id, canonical(peer.frontier()), peer.state.device);
  }

  compact() {
    this.authorityOnly();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.history();
      const envelope = this.db
        .prepare("SELECT id,body FROM _spike_checkpoints WHERE id=?")
        .get(state.checkpoint_id);
      if (!envelope) throw new Error("NO_CHECKPOINT");
      const checkpoint = openCheckpoint(envelope);
      if (canonical(this.frontier()) !== canonical(checkpoint.frontier))
        throw new Error("CHECKPOINT_MOVED");
      const controlHash = hash({
        receipts: this.db.prepare("SELECT * FROM _spike_receipts ORDER BY device,sequence").all(),
        branches: this.db
          .prepare("SELECT * FROM _spike_recovery_branches ORDER BY device,sequence")
          .all(),
        retired: this.db.prepare("SELECT device FROM _spike_retired ORDER BY device").all(),
      });
      if (controlHash !== checkpoint.controlHash) throw new Error("CHECKPOINT_MOVED");
      const members = this.db.prepare("SELECT * FROM _spike_members WHERE active=1").all();
      if (
        members.some(
          member =>
            member.ack_checkpoint !== envelope.id ||
            !covers(JSON.parse(member.ack_frontier), checkpoint.frontier)
        )
      )
        throw new Error("ACTIVE_PEER_NOT_ACKNOWLEDGED");
      const keep = new Set(checkpoint.versions.map(versionKey));
      for (const row of this.db.prepare("SELECT * FROM _spike_versions").all())
        if (!keep.has(versionKey(row))) {
          for (const table of ["_spike_versions", "_spike_generations"])
            this.db
              .prepare(
                `DELETE FROM ${table} WHERE table_name=? AND row_key=? AND device=? AND sequence=?`
              )
              .run(row.table_name, row.row_key, row.device, row.sequence);
        }
      this.db.exec("DELETE FROM _spike_deletion_bases");
      for (const row of checkpoint.deletions)
        this.db
          .prepare("INSERT INTO _spike_deletion_bases VALUES(?,?,?,?,?)")
          .run(row.table_name, row.row_key, row.device, row.sequence, row.row_value);
      this.db.exec("DELETE FROM _spike_batches; DELETE FROM _spike_outbox");
      const roots = this.checkpointRoots(
        checkpoint.versions,
        checkpoint.deletions,
        checkpoint.branches
      );
      for (const row of this.db.prepare("SELECT hash FROM _spike_chunks").all())
        if (!roots.has(row.hash))
          this.db.prepare("DELETE FROM _spike_chunks WHERE hash=?").run(row.hash);
      this.db.prepare("DELETE FROM _spike_checkpoints WHERE id<>?").run(envelope.id);
      this.db.prepare("UPDATE _spike_history SET floor=?").run(canonical(checkpoint.frontier));
      const result = {
        floor: checkpoint.frontier,
        versions: checkpoint.versions.length,
        chunks: this.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n,
      };
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recoverArchive(archive) {
    this.authorityOnly();
    const blocked = new Set();
    for (const sealed of archive) {
      const { seal, ...entry } = sealed;
      if (
        hash(entry) !== seal ||
        hash(entry.batch) !== entry.fingerprint ||
        entry.batch.group !== this.state.library ||
        entry.batch.baseline !== this.state.baseline_hash
      )
        throw new Error("RECOVERY_ARCHIVE_CORRUPT");
      if (
        entry.batch.protocol !== this.protocol ||
        entry.batch.schema !== this.state.schema_hash ||
        entry.batch.rules !== this.rulesHash
      )
        throw new Error("RECOVERY_UPGRADE_REQUIRED");
      const { device, sequence } = entry.batch;
      const known = this.receipt(device, sequence);
      if (known) {
        if (known.fingerprint !== entry.fingerprint) throw new Error("OPERATION_ID_REUSED");
        if (known.status === "preserved") blocked.add(device);
        continue;
      }
      if (device === this.state.device) throw new Error("RECOVERY_AUTHORITY_SOURCE");
      if (sequence > 1 && !this.receipt(device, sequence - 1))
        throw new Error("RECOVERY_ARCHIVE_GAP");
      let conflict =
        blocked.has(device) ||
        this.db
          .prepare("SELECT device,sequence FROM _spike_receipts WHERE status='preserved'")
          .all()
          .some(row => (entry.batch.observed[row.device] ?? 0) >= row.sequence);
      const plans = [];
      for (const change of entry.changes) {
        try {
          requireAdapters(this.contracts, [change.table]);
        } catch {
          conflict = true;
        }
        const current = this.head(change.table, change.key);
        if (change.restoreOf !== null) {
          const [oldDevice, oldSequence] = change.restoreOf.split(":");
          const translated = this.receipt(oldDevice, Number(oldSequence));
          const target = translated?.result_device
            ? keyOf(translated.result_device, translated.result_sequence)
            : change.restoreOf;
          if (
            !current ||
            current.row !== null ||
            keyOf(current.device, current.sequence) !== target ||
            current.generation + 1 !== change.generation
          )
            conflict = true;
          plans.push({ ...change, before: null, after: change.after, restoreOf: target });
          continue;
        }
        if (current && current.generation !== change.generation) conflict = true;
        if (change.before === null) {
          if (current) conflict = true;
          plans.push(change);
        } else if (!current?.row) conflict = true;
        else if (change.after === null) {
          if (canonical(current.row) !== canonical(change.before)) conflict = true;
          plans.push({ ...change, before: current.row });
        } else {
          const after = { ...current.row };
          for (const [field, value] of Object.entries(change.after))
            if (canonical(value) !== canonical(change.before[field])) {
              if (
                canonical(current.row[field]) !== canonical(change.before[field]) &&
                canonical(current.row[field]) !== canonical(value)
              )
                conflict = true;
              after[field] = value;
            }
          plans.push({ ...change, before: current.row, after });
        }
      }
      this.transaction(db => {
        db.prepare("INSERT OR IGNORE INTO _spike_retired VALUES(?)").run(device);
        db.prepare("UPDATE _spike_members SET active=0 WHERE device=?").run(device);
        if (conflict) {
          const packed = {
            ...entry,
            changes: entry.changes.map(change => ({
              ...change,
              before: this.codec.packRow(change.before),
              after: this.codec.packRow(change.after),
            })),
            seal,
          };
          db.prepare("INSERT INTO _spike_recovery_branches VALUES(?,?,?)").run(
            device,
            sequence,
            canonical(packed)
          );
          db.prepare("INSERT INTO _spike_receipts VALUES(?,?,?,'preserved',NULL,NULL)").run(
            device,
            sequence,
            entry.fingerprint
          );
        } else {
          const target = db.prepare("SELECT device,sequence+1 AS sequence FROM _spike_state").get();
          for (const plan of plans) {
            const current = this.head(plan.table, plan.key);
            if (plan.restoreOf !== null) {
              if (
                !current ||
                current.row !== null ||
                keyOf(current.device, current.sequence) !== plan.restoreOf
              )
                throw new Error("RECOVERY_CHANGED");
            } else if (
              plan.before === null
                ? Boolean(current)
                : !current ||
                  current.generation !== plan.generation ||
                  canonical(current.row) !== canonical(plan.before)
            )
              throw new Error("RECOVERY_CHANGED");
            if (plan.restoreOf !== null)
              db.prepare("INSERT INTO _spike_restore_intents VALUES(?,?,?,?)").run(
                plan.table,
                canonical(plan.key),
                plan.restoreOf,
                plan.generation
              );
            db.prepare(
              "INSERT INTO _spike_pending(table_name,row_key,before_row,after_row) VALUES(?,?,?,?)"
            ).run(
              plan.table,
              canonical(plan.key),
              plan.before === null ? null : canonical(plan.before),
              plan.after === null ? null : canonical(plan.after)
            );
          }
          db.prepare("INSERT INTO _spike_receipts VALUES(?,?,?,'rebased',?,?)").run(
            device,
            sequence,
            entry.fingerprint,
            target.device,
            target.sequence
          );
        }
      });
      if (conflict) blocked.add(device);
    }
  }

  recoveryBranches() {
    return this.db
      .prepare("SELECT payload FROM _spike_recovery_branches ORDER BY device,sequence")
      .all()
      .map(row => {
        const entry = JSON.parse(row.payload);
        const unpacked = {
          ...entry,
          changes: entry.changes.map(change => ({
            ...change,
            before: this.codec.unpackRow(change.before),
            after: this.codec.unpackRow(change.after),
          })),
        };
        const { seal, ...contents } = unpacked;
        if (hash(contents) !== seal) throw new Error("RECOVERY_BRANCH_CORRUPT");
        return unpacked;
      });
  }

  installCheckpoint(envelope, { reincarnate = false, failAfterRows } = {}) {
    const checkpoint = openCheckpoint(envelope);
    this.db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON");
    try {
      const state = this.history();
      if (reincarnate && this.logicalDevice === state.authority)
        throw new Error("AUTHORITY_REJOIN_REQUIRES_HANDOFF");
      if (
        checkpoint.group !== this.state.library ||
        checkpoint.schema !== this.state.schema_hash ||
        checkpoint.baselineHash !== this.state.baseline_hash ||
        checkpoint.rules !== this.rulesHash ||
        checkpoint.authority !== state.authority ||
        !covers(checkpoint.frontier, JSON.parse(state.floor)) ||
        checkpoint.epoch < state.epoch ||
        (checkpoint.epoch === state.epoch &&
          state.checkpoint_id &&
          state.checkpoint_id !== envelope.id)
      )
        throw new Error("CHECKPOINT_IDENTITY_OR_ROLLBACK");
      if (
        hash(checkpoint.contracts) !== this.rulesHash ||
        hash(checkpoint.baseline) !== this.state.baseline_hash
      )
        throw new Error("CHECKPOINT_CONTRACT");
      for (const row of this.db.prepare("SELECT device FROM _spike_retired").all())
        if (!checkpoint.retired.some(retired => retired.device === row.device))
          throw new Error("CHECKPOINT_FENCE_ROLLBACK");
      this.assertSnapshotSupported(checkpoint.rows);
      for (const chunk of checkpoint.chunks) {
        const bytes = brotliDecompressSync(Buffer.from(chunk.data, "base64"), {
          maxOutputLength: 16384,
        });
        if (bytes.length !== chunk.raw_size || hash(bytes) !== chunk.hash)
          throw new Error("CHECKPOINT_CHUNK_CORRUPT");
      }
      for (const known of this.db.prepare("SELECT * FROM _spike_receipts").all()) {
        const covered = checkpoint.receipts.find(
          receipt => receipt.device === known.device && receipt.sequence === known.sequence
        );
        if (!covered || covered.fingerprint !== known.fingerprint)
          throw new Error("LOCAL_HISTORY_NOT_PROTECTED");
      }
      for (const entry of this.exportRecoveryArchive()) {
        const receipt = checkpoint.receipts.find(
          row => row.device === entry.batch.device && row.sequence === entry.batch.sequence
        );
        if (
          !receipt ||
          receipt.fingerprint !== entry.fingerprint ||
          (receipt.status === "preserved" &&
            !checkpoint.branches.some(
              row =>
                row.device === receipt.device &&
                row.sequence === receipt.sequence &&
                JSON.parse(row.payload).seal === entry.seal
            ))
        )
          throw new Error("LOCAL_OUTBOX_NOT_PROTECTED");
      }
      this.db.exec("UPDATE _spike_state SET applying=1");
      const local = new Map(
        this.contracts
          .filter(contract => contract.scope === "local")
          .map(contract => [contract.table, this.rows(contract.table)])
      );
      for (const table of this.tables) this.db.exec(`DELETE FROM ${quote(table.name)}`);
      let installed = 0;
      for (const table of this.tables)
        for (const row of local.get(table.name) ?? checkpoint.rows[table.name]) {
          this.writeRow(table, row);
          if (++installed === failAfterRows) throw new Error("CHECKPOINT_INSTALL_INTERRUPTED");
        }
      for (const table of [
        "_spike_versions",
        "_spike_generations",
        "_spike_deletion_bases",
        "_spike_batches",
        "_spike_frontier",
        "_spike_chunks",
        "_spike_receipts",
        "_spike_recovery_branches",
        "_spike_outbox",
        "_spike_retired",
        "_spike_quarantine",
        "_spike_orphans",
        "_spike_pending",
      ])
        this.db.exec(`DELETE FROM ${table}`);
      for (const chunk of checkpoint.chunks)
        this.db
          .prepare("INSERT INTO _spike_chunks VALUES(?,?,?)")
          .run(chunk.hash, chunk.raw_size, Buffer.from(chunk.data, "base64"));
      for (const row of checkpoint.versions)
        this.db
          .prepare("INSERT INTO _spike_versions VALUES(?,?,?,?,?,?,?,?)")
          .run(
            row.table_name,
            row.row_key,
            row.device,
            row.sequence,
            row.clock,
            row.observed,
            row.before_row,
            row.after_row
          );
      for (const row of checkpoint.generations)
        this.db
          .prepare("INSERT INTO _spike_generations VALUES(?,?,?,?,?,?)")
          .run(
            row.table_name,
            row.row_key,
            row.device,
            row.sequence,
            row.generation,
            row.restore_of
          );
      for (const row of checkpoint.deletions)
        this.db
          .prepare("INSERT INTO _spike_deletion_bases VALUES(?,?,?,?,?)")
          .run(row.table_name, row.row_key, row.device, row.sequence, row.row_value);
      for (const row of checkpoint.receipts)
        this.db
          .prepare("INSERT INTO _spike_receipts VALUES(?,?,?,?,?,?)")
          .run(
            row.device,
            row.sequence,
            row.fingerprint,
            row.status,
            row.result_device,
            row.result_sequence
          );
      for (const row of checkpoint.branches)
        this.db
          .prepare("INSERT INTO _spike_recovery_branches VALUES(?,?,?)")
          .run(row.device, row.sequence, row.payload);
      for (const row of checkpoint.retired)
        this.db.prepare("INSERT INTO _spike_retired VALUES(?)").run(row.device);
      for (const row of checkpoint.quarantine)
        this.db
          .prepare("INSERT INTO _spike_quarantine VALUES(?,?,?)")
          .run(row.table_name, row.row_key, row.reason);
      for (const row of checkpoint.orphans)
        this.db
          .prepare("INSERT INTO _spike_orphans VALUES(?,?,?)")
          .run(row.table_name, row.row_key, row.parent_id);
      for (const [device, sequence] of Object.entries(checkpoint.frontier))
        this.db.prepare("INSERT INTO _spike_frontier VALUES(?,?)").run(device, sequence);
      for (const version of checkpoint.versions)
        if (version.after_row !== null) this.codec.unpackRow(JSON.parse(version.after_row));
      for (const deletion of checkpoint.deletions)
        this.codec.unpackRow(JSON.parse(deletion.row_value));
      this.recoveryBranches();
      if (canonical(this.replicatedSnapshot()) !== canonical(checkpoint.rows))
        throw new Error("CHECKPOINT_ROWS_MISMATCH");
      const actor = reincarnate ? `${this.logicalDevice}-r-${envelope.id}` : this.state.device;
      this.db
        .prepare("UPDATE _spike_state SET device=?,sequence=?,clock=?,applying=0,active_tx=NULL")
        .run(actor, checkpoint.frontier[actor] ?? 0, checkpoint.clock);
      this.db
        .prepare("UPDATE _spike_history SET epoch=?,checkpoint_id=?,floor=?")
        .run(checkpoint.epoch, envelope.id, canonical(checkpoint.frontier));
      this.db
        .prepare("INSERT OR REPLACE INTO _spike_checkpoints VALUES(?,?)")
        .run(envelope.id, envelope.body);
      this.db.exec("COMMIT");
      this.state = this.db.prepare("SELECT * FROM _spike_state").get();
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
