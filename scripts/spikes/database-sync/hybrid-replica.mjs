import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  LinearReplica,
  linearDigest as hash,
  unpackLinearSnapshot,
  withoutTriggers,
} from "./linear-replica.mjs";
import { canonical } from "./replica.mjs";
import {
  Y,
  NodeTree,
  createNodeDocument,
  applyNodeDocumentUpdate,
  validateNodeDocument,
  readNodeDocument,
  prepareContentContract,
  createContentMetrics,
} from "./collaboration-runtime.mjs";

const OPEN = Symbol("hybrid-open");
const DOC_MODE = "node-document-2";
const MAX_STATE = 8 * 1024 * 1024;
const isDoc = commit => ["document", "document-preserved"].includes(commit.kind);
const identity = entry => ({
  documentId: entry.documentId,
  baselineId: entry.baselineId,
  epoch: entry.documentEpoch,
});
const stateBytes = entry => Buffer.from(entry.state, "base64");

function restore(entry) {
  const bytes = stateBytes(entry);
  if (bytes.length > MAX_STATE || hash(bytes) !== entry.stateHash)
    throw new Error("DOCUMENT_STATE_HASH");
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, bytes);
    for (const [key, value] of Object.entries(identity(entry)))
      if (doc.getMap("meta").get(key) !== value) throw new Error("DOCUMENT_IDENTITY");
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
async function validated(entry) {
  const doc = restore(entry);
  try {
    await validateNodeDocument(doc, identity(entry));
    return entry;
  } finally {
    doc.destroy();
  }
}
function projection(entry) {
  const doc = restore(entry);
  try {
    const projected = readNodeDocument(doc);
    const contracts = doc.getMap("node-tree:contracts").toJSON();
    const rules = new Map();
    for (const contract of Object.values(contracts)) {
      if (contract.domain === "editor-node")
        rules.set(contract.type, {
          type: contract.type,
          textFields: contract.textFields ?? [],
          additionalChildren: [],
        });
    }
    return {
      content: canonical(projected.content),
      count: createContentMetrics([...rules.values()]).count(projected.content),
      contracts: canonical(contracts),
      revision: entry.stateHash,
      updatedAt: entry.updatedAt,
      shared: projected,
    };
  } finally {
    doc.destroy();
  }
}
function projectSnapshot(snapshot) {
  for (const entry of snapshot.documents ?? []) {
    const view = projection(entry);
    const row = snapshot.rows.contents.find(row => row.id === entry.contentId);
    const document = snapshot.rows.content_documents.find(
      row => row.content_id === entry.contentId && row.document_id === entry.documentId
    );
    if (row && document) {
      row.content = view.content;
      row.count = view.count;
      row.update_time = view.updatedAt;
      document.contracts = view.contracts;
      document.revision = view.revision;
    }
  }
  snapshot.dataHash = hash(snapshot.rows);
  const body = canonical(snapshot);
  return { id: hash(body), body };
}
async function normalizedSnapshot(envelope) {
  const snapshot = unpackLinearSnapshot(envelope);
  if (
    snapshot.bodyMode !== DOC_MODE ||
    !Array.isArray(snapshot.documents) ||
    !Array.isArray(snapshot.documentCopies)
  )
    throw new Error("BODY_MODE");
  for (const entry of snapshot.documents) await validated(entry);
  for (const copy of snapshot.documentCopies) await validated(JSON.parse(copy.payload));
  return projectSnapshot(snapshot);
}

export class HybridReplica extends LinearReplica {
  get bodyMode() {
    return DOC_MODE;
  }
  constructor(path, options, token) {
    if (token !== OPEN) throw new Error("USE_ASYNC_OPEN");
    super(path, options);
  }
  static async open(path, options) {
    const prepared = { ...options };
    if (prepared.snapshot) prepared.snapshot = await normalizedSnapshot(prepared.snapshot);
    const replica = new HybridReplica(path, prepared, OPEN);
    try {
      for (const entry of replica.entries()) await validated(entry);
      for (const row of replica.rows("content_documents"))
        if (!replica.entry(row.content_id)) throw new Error("DOCUMENT_AUTHORITY_MISSING");
      replica.db.exec("BEGIN IMMEDIATE; UPDATE _linear_state SET applying=2");
      try {
        withoutTriggers(replica.db, () => replica.projectAll());
        replica.db.exec("UPDATE _linear_state SET applying=0; COMMIT");
      } catch (error) {
        replica.db.exec("ROLLBACK");
        throw error;
      }
      return replica;
    } catch (error) {
      replica.close();
      throw error;
    }
  }

  initializeExtensions() {
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS _linear_documents(content_id INTEGER PRIMARY KEY,document_id TEXT NOT NULL UNIQUE,baseline_id TEXT NOT NULL,document_epoch INTEGER NOT NULL,state BLOB NOT NULL,state_hash TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS _linear_document_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _linear_document_copies(id TEXT PRIMARY KEY,reason TEXT NOT NULL,payload TEXT NOT NULL);`);
    this.plans = new Map();
    this.serial = Promise.resolve();
  }
  entries() {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='_linear_documents'").get())
      return [];
    return this.db
      .prepare("SELECT * FROM _linear_documents ORDER BY content_id")
      .all()
      .map(row => ({
        contentId: row.content_id,
        documentId: row.document_id,
        baselineId: row.baseline_id,
        documentEpoch: row.document_epoch,
        state: Buffer.from(row.state).toString("base64"),
        stateHash: row.state_hash,
        updatedAt: row.updated_at,
      }));
  }
  entry(contentId) {
    return this.entries().find(entry => entry.contentId === contentId);
  }
  persist(entry) {
    this.db
      .prepare(
        "INSERT INTO _linear_documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(content_id) DO UPDATE SET document_id=excluded.document_id,baseline_id=excluded.baseline_id,document_epoch=excluded.document_epoch,state=excluded.state,state_hash=excluded.state_hash,updated_at=excluded.updated_at"
      )
      .run(
        entry.contentId,
        entry.documentId,
        entry.baselineId,
        entry.documentEpoch,
        stateBytes(entry),
        entry.stateHash,
        entry.updatedAt
      );
  }
  project(entry) {
    const binding = this.db
      .prepare("SELECT document_id FROM content_documents WHERE content_id=?")
      .get(entry.contentId);
    if (binding?.document_id !== entry.documentId) return;
    const view = projection(entry);
    this.db
      .prepare("UPDATE contents SET content=?,count=?,update_time=? WHERE id=?")
      .run(view.content, view.count, view.updatedAt, entry.contentId);
    this.db
      .prepare("UPDATE content_documents SET contracts=?,revision=? WHERE content_id=?")
      .run(view.contracts, view.revision, entry.contentId);
  }
  projectAll() {
    for (const entry of this.entries()) this.project(entry);
  }
  snapshotExtras() {
    return {
      documents: this.entries(),
      documentCopies: this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='_linear_document_copies'")
        .get()
        ? this.db.prepare("SELECT * FROM _linear_document_copies ORDER BY id").all()
        : [],
    };
  }
  exportSnapshot() {
    const envelope = super.exportSnapshot();
    return projectSnapshot(JSON.parse(envelope.body));
  }
  dataHash() {
    const rows = this.snapshotRows();
    return JSON.parse(projectSnapshot({ rows, documents: this.entries() }).body).dataHash;
  }
  installSnapshotExtras(snapshot) {
    if (snapshot.bodyMode !== DOC_MODE || !Array.isArray(snapshot.documents))
      throw new Error("DOCUMENT_SNAPSHOT_REQUIRED");
    this.db.exec("DELETE FROM _linear_documents; DELETE FROM _linear_document_copies");
    for (const entry of snapshot.documents) this.persist(entry);
    for (const copy of snapshot.documentCopies ?? [])
      this.db
        .prepare("INSERT INTO _linear_document_copies VALUES(?,?,?)")
        .run(copy.id, copy.reason, copy.payload);
    withoutTriggers(this.db, () => this.projectAll());
  }
  afterInstallResponse(response) {
    for (const row of this.db.prepare("SELECT * FROM _linear_document_outbox").all()) {
      const known = this.db
        .prepare("SELECT fingerprint FROM _linear_receipts WHERE id=?")
        .get(row.id);
      if (known?.fingerprint === hash(JSON.parse(row.payload)) || response.mode === "conflict")
        this.db.prepare("DELETE FROM _linear_document_outbox WHERE id=?").run(row.id);
    }
  }
  installChoiceExtras(snapshot) {
    this.installSnapshotExtras(snapshot);
    this.db.exec("DELETE FROM _linear_document_outbox");
  }
  decorateDatabaseCopy(bytes, snapshot) {
    const db = new DatabaseSync(":memory:");
    try {
      db.deserialize(bytes);
      db.exec(
        "CREATE TABLE _linear_documents(content_id INTEGER PRIMARY KEY,document_id TEXT,baseline_id TEXT,document_epoch INTEGER,state BLOB,state_hash TEXT,updated_at INTEGER);CREATE TABLE _linear_document_copies(id TEXT PRIMARY KEY,reason TEXT,payload TEXT)"
      );
      for (const entry of snapshot.documents ?? [])
        db.prepare("INSERT INTO _linear_documents VALUES(?,?,?,?,?,?,?)").run(
          entry.contentId,
          entry.documentId,
          entry.baselineId,
          entry.documentEpoch,
          stateBytes(entry),
          entry.stateHash,
          entry.updatedAt
        );
      for (const copy of snapshot.documentCopies ?? [])
        db.prepare("INSERT INTO _linear_document_copies VALUES(?,?,?)").run(
          copy.id,
          copy.reason,
          copy.payload
        );
      return Buffer.from(db.serialize());
    } finally {
      db.close();
    }
  }

  prepareCommit(body) {
    if (this.initializing) {
      body.initialDocuments = this.initializing;
      return;
    }
    this.assertProjectionWrites(body);
  }
  assertProjectionWrites(commit) {
    for (const op of commit.ops)
      if (["contents", "content_documents"].includes(op.table) && this.entry(op.key[0])) {
        if (op.after === null) continue;
        const initial = commit.initialDocuments?.find(entry => entry.contentId === op.key[0]);
        if (initial && op.before === null) continue;
        const fields =
          op.table === "contents"
            ? ["content", "count", "update_time"]
            : ["document_id", "format_version", "contracts", "revision"];
        if (fields.some(field => canonical(op.before?.[field]) !== canonical(op.after?.[field])))
          throw new Error("BODY_WRITE_REQUIRES_YJS");
      }
  }
  isCustomCommit(commit) {
    return isDoc(commit);
  }
  validateCommit(commit) {
    super.validateCommit(commit);
    if (!isDoc(commit)) {
      this.assertProjectionWrites(commit);
      return;
    }
    if (
      commit.ops.length ||
      !commit.document ||
      !Number.isSafeInteger(commit.document.contentId) ||
      typeof commit.document.documentId !== "string"
    )
      throw new Error("DOCUMENT_COMMIT");
  }
  append(commit, source = commit) {
    super.append(commit, source);
    if (commit.kind === "document")
      for (const table of ["contents", "content_documents"]) {
        this.db
          .prepare(
            "INSERT INTO _linear_row_versions VALUES(?,?,?) ON CONFLICT(table_name,row_key) DO UPDATE SET revision=excluded.revision"
          )
          .run(table, canonical([commit.document.contentId]), commit.id);
        this.db
          .prepare(
            "INSERT INTO _linear_table_versions VALUES(?,?) ON CONFLICT(table_name) DO UPDATE SET revision=excluded.revision"
          )
          .run(table, commit.id);
      }
  }

  async createNote(contentId, text, { title = "笔记" } = {}) {
    if (this.state().device !== this.state().authority) throw new Error("INITIALIZE_ON_AUTHORITY");
    if (this.entry(contentId)) throw new Error("DOCUMENT_ALREADY_EXISTS");
    const { id, contract } = await prepareContentContract("hybrid-spike", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const descriptor = {
      contentId,
      documentId: randomUUID(),
      baselineId: randomUUID(),
      documentEpoch: 1,
      updatedAt: Date.now(),
    };
    const doc = await createNodeDocument(
      identity(descriptor),
      {
        title,
        bannerBg: "",
        bannerPosition: "center",
        content: [
          {
            type: "paragraph",
            collabId: `paragraph-${contentId}`,
            tauContract: id,
            children: [{ text }],
          },
        ],
      },
      { [id]: contract }
    );
    const bytes = Y.encodeStateAsUpdate(doc);
    doc.destroy();
    const entry = {
      ...descriptor,
      state: Buffer.from(bytes).toString("base64"),
      stateHash: hash(bytes),
    };
    const view = projection(entry);
    this.initializing = [entry];
    try {
      super.transaction(db => {
        this.persist(entry);
        db.prepare(
          "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(?,?,?,?,?,1)"
        ).run(contentId, entry.updatedAt, entry.updatedAt, view.content, view.count);
        db.prepare(
          "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(?,?,2,?,?)"
        ).run(contentId, entry.documentId, view.contracts, view.revision);
        db.prepare("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(?,?,?,?)").run(
          contentId,
          entry.updatedAt,
          entry.updatedAt,
          contentId
        );
      });
    } finally {
      this.initializing = null;
    }
    return entry.documentId;
  }
  readNote(contentId) {
    const entry = this.entry(contentId);
    if (!entry) throw new Error("DOCUMENT_MISSING");
    return {
      ...projection(entry).shared,
      identity: identity(entry),
      revision: entry.stateHash,
      deleted: !this.db
        .prepare("SELECT 1 FROM content_documents WHERE content_id=?")
        .get(contentId),
    };
  }
  async editNote(contentId, write, { crashAfterState = false } = {}) {
    const libraryEpoch = this.state().epoch;
    const observed = this.entry(contentId);
    if (!observed) throw new Error("DOCUMENT_MISSING");
    const original = restore(observed);
    const draft = restore(observed);
    const tree = new NodeTree(draft);
    let update;
    try {
      const vector = Y.encodeStateVector(draft);
      write({ doc: draft, tree, origin: "hybrid-input" });
      await validateNodeDocument(draft, identity(observed), original);
      if (hash(Y.encodeStateAsUpdate(draft)) === observed.stateHash) return "unchanged";
      update = Y.encodeStateAsUpdate(draft, vector);
    } finally {
      tree.dispose();
      draft.destroy();
      original.destroy();
    }
    const timestamp = Date.now();
    const origin = `${this.state().device}:${randomUUID()}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (this.state().epoch !== libraryEpoch) throw new Error("DOCUMENT_EPOCH_CHANGED");
      const before = this.entry(contentId);
      const current = restore(before);
      let candidate;
      try {
        candidate = await applyNodeDocumentUpdate(current, update, identity(observed));
        const bytes = Y.encodeStateAsUpdate(candidate);
        const next = {
          ...before,
          state: Buffer.from(bytes).toString("base64"),
          stateHash: hash(bytes),
          updatedAt: Math.max(before.updatedAt, timestamp),
        };
        this.db.exec("BEGIN IMMEDIATE");
        try {
          if (this.entry(contentId).stateHash !== before.stateHash) {
            this.db.exec("ROLLBACK");
            continue;
          }
          const state = this.state();
          if (state.epoch !== libraryEpoch) throw new Error("DOCUMENT_EPOCH_CHANGED");
          if (!this.db.prepare("SELECT 1 FROM content_documents WHERE content_id=?").get(contentId))
            throw new Error("DOCUMENT_DELETED");
          const beforeDigest = this.dataHash();
          this.db.exec("UPDATE _linear_state SET applying=2");
          this.persist(next);
          withoutTriggers(this.db, () => this.project(next));
          if (crashAfterState) process.exit(17);
          const body = {
            protocol: 4,
            bodyMode: DOC_MODE,
            kind: "document",
            library: state.library,
            schema: state.schema_hash,
            epoch: state.epoch,
            parent: state.head,
            origin,
            scoped: true,
            rows: [],
            tables: [],
            ops: [],
            document: {
              ...identity(next),
              contentId,
              updatedAt: next.updatedAt,
              update: Buffer.from(update).toString("base64"),
            },
            stateHash: next.stateHash,
            beforeDigest,
            afterDigest: this.dataHash(),
          };
          const commit = { ...body, id: hash(body) };
          this.append(commit);
          if (state.device === state.authority) {
            this.db.prepare("UPDATE _linear_state SET ack_head=?").run(commit.id);
            this.saveAck();
          } else {
            this.db
              .prepare("INSERT INTO _linear_local VALUES(?,?,?)")
              .run(
                commit.id,
                hash(commit),
                this.db.prepare("SELECT coalesce(max(ordinal),0)+1 AS n FROM _linear_local").get().n
              );
            this.db
              .prepare("INSERT INTO _linear_document_outbox VALUES(?,?)")
              .run(commit.id, canonical(commit));
          }
          this.db.exec("UPDATE _linear_state SET applying=0; COMMIT");
          return commit.id;
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
      } finally {
        candidate?.destroy();
        current.destroy();
      }
    }
    throw new Error("DOCUMENT_RETRY");
  }

  bundle(options) {
    const state = this.state();
    const pending = this.db.prepare("SELECT * FROM _linear_local ORDER BY ordinal").all();
    const outbox = new Map(
      this.db
        .prepare("SELECT * FROM _linear_document_outbox")
        .all()
        .map(row => [row.id, JSON.parse(row.payload)])
    );
    const bodyOnly = pending.length && pending.every(row => outbox.has(row.id));
    const bundle = super.bundle(options);
    if (bodyOnly && state.snapshot_only) {
      bundle.snapshotOnly = false;
      bundle.commits = pending.map(row => outbox.get(row.id));
    }
    let ack;
    try {
      ack = unpackLinearSnapshot(
        JSON.parse(this.db.prepare("SELECT payload FROM _linear_ack_snapshot").get().payload)
      );
      if (
        canonical(ack.rows) !==
        canonical(JSON.parse(projectSnapshot(structuredClone(ack)).body).rows)
      )
        bundle.forceSnapshot = true;
    } catch {
      bundle.forceSnapshot = true;
    }
    if (ack?.head !== state.ack_head) bundle.forceSnapshot = true;
    return bundle;
  }
  localCommit(id) {
    const row = this.db.prepare("SELECT payload FROM _linear_document_outbox WHERE id=?").get(id);
    return row ? JSON.parse(row.payload) : super.localCommit(id);
  }
  bodyBundle(options) {
    const state = this.state();
    const pending = this.db
      .prepare("SELECT * FROM _linear_local ORDER BY ordinal")
      .all()
      .filter(row =>
        this.db.prepare("SELECT 1 FROM _linear_document_outbox WHERE id=?").get(row.id)
      );
    if (!pending.length) return null;
    const snapshot = this.exportSnapshot();
    return {
      protocol: 4,
      bodyMode: DOC_MODE,
      library: state.library,
      schema: state.schema_hash,
      epoch: state.epoch,
      base: state.ack_head,
      head: state.head,
      snapshotOnly: false,
      pending,
      commits: pending.map(row => this.localCommit(row.id)),
      snapshotId: snapshot.id,
      ...(options?.includeSnapshot ? { snapshot } : {}),
    };
  }
  async exclusive(work) {
    let release;
    const previous = this.serial;
    this.serial = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async prepare(commits, initial, snapshot, { canonicalReplay = false } = {}) {
    const virtual = new Map(initial.map(entry => [entry.contentId, entry]));
    const plans = new Map();
    for (const commit of commits) {
      this.validateCommit(commit);
      if (
        !canonicalReplay &&
        this.db.prepare("SELECT 1 FROM _linear_receipts WHERE id=?").get(commit.id)
      )
        continue;
      if (commit.initialDocuments) {
        for (const entry of commit.initialDocuments) {
          await validated(entry);
          if (
            virtual.has(entry.contentId) &&
            virtual.get(entry.contentId).documentId !== entry.documentId
          )
            throw new Error("DOCUMENT_ID_COLLISION");
          virtual.set(entry.contentId, entry);
        }
        plans.set(commit.id, { kind: "initial", entries: commit.initialDocuments });
        continue;
      }
      if (!isDoc(commit)) continue;
      if (commit.kind === "document-preserved") {
        await validated(commit.savedDocument);
        plans.set(commit.id, {
          kind: "preserve",
          entry: commit.savedDocument,
          reason: commit.reason,
        });
        continue;
      }
      const entry = virtual.get(commit.document.contentId);
      let reason;
      if (commit.epoch !== this.state().epoch) reason = "LIBRARY_EPOCH_CHANGED";
      else if (!entry) reason = "DOCUMENT_MISSING";
      else if (
        canonical(identity(entry)) !==
        canonical({
          documentId: commit.document.documentId,
          baselineId: commit.document.baselineId,
          epoch: commit.document.epoch,
        })
      )
        reason = "DOCUMENT_BASELINE_CHANGED";
      else {
        const current = restore(entry);
        let candidate;
        try {
          candidate = await applyNodeDocumentUpdate(
            current,
            Buffer.from(commit.document.update, "base64"),
            identity(entry)
          );
          const bytes = Y.encodeStateAsUpdate(candidate);
          const next = {
            ...entry,
            state: Buffer.from(bytes).toString("base64"),
            stateHash: hash(bytes),
            updatedAt: Math.max(entry.updatedAt, commit.document.updatedAt),
          };
          if (canonicalReplay && next.stateHash !== commit.stateHash)
            throw new Error("CANONICAL_DOCUMENT_HASH");
          plans.set(commit.id, { kind: "merge", before: entry.stateHash, entry: next });
          virtual.set(entry.contentId, next);
        } catch (error) {
          if (canonicalReplay) throw error;
          reason = error.code ?? error.message;
        } finally {
          candidate?.destroy();
          current.destroy();
        }
      }
      if (reason) {
        const full = snapshot?.documents?.find(
          entry => entry.contentId === commit.document.contentId
        );
        if (!full) throw new Error("DOCUMENT_FULL_STATE_REQUIRED");
        await validated(full);
        plans.set(commit.id, { kind: "preserve", entry: full, reason });
      }
    }
    return plans;
  }
  beforeAcceptBundle() {
    if (
      this.admissionHead !== this.state().head ||
      this.admissionDocuments !== hash(this.entries())
    )
      throw new Error("DOCUMENT_ADMISSION_RETRY");
  }
  allowForkEpoch(bundle) {
    return bundle.commits.length > 0 && bundle.commits.every(isDoc);
  }
  applyCommit(source) {
    if (!isDoc(source)) {
      const plan = this.plans.get(source.id);
      if (plan?.kind === "initial") for (const entry of plan.entries) this.persist(entry);
      return super.applyCommit(source);
    }
    this.validateCommit(source);
    const known = this.db
      .prepare("SELECT fingerprint FROM _linear_receipts WHERE id=?")
      .get(source.id);
    if (known) {
      if (known.fingerprint !== hash(source)) throw new Error("COMMIT_REUSED");
      return "duplicate";
    }
    const plan = this.plans.get(source.id);
    if (!plan) throw new Error("DOCUMENT_NOT_PREPARED");
    const state = this.state();
    const beforeDigest = this.dataHash();
    this.db.exec("UPDATE _linear_state SET applying=2");
    let body;
    if (plan.kind === "preserve") {
      const id = hash({ entry: plan.entry, reason: plan.reason });
      this.db
        .prepare("INSERT OR IGNORE INTO _linear_document_copies VALUES(?,?,?)")
        .run(id, plan.reason, canonical(plan.entry));
      body = {
        ...source,
        kind: "document-preserved",
        savedDocument: plan.entry,
        reason: plan.reason,
      };
    } else {
      if (this.entry(plan.entry.contentId)?.stateHash !== plan.before)
        throw new Error("DOCUMENT_ADMISSION_RETRY");
      this.persist(plan.entry);
      withoutTriggers(this.db, () => this.project(plan.entry));
      body = {
        ...source,
        stateHash: plan.entry.stateHash,
        document: { ...source.document, updatedAt: plan.entry.updatedAt },
      };
    }
    body = {
      ...body,
      epoch: state.epoch,
      parent: state.head,
      beforeDigest,
      afterDigest: this.dataHash(),
    };
    delete body.id;
    const commit = { ...body, id: hash(body) };
    this.append(commit, source);
    this.db.prepare("UPDATE _linear_state SET ack_head=?,applying=0").run(commit.id);
    return source.parent === state.head ? "incremental" : "rebased";
  }
  async acceptBundle(bundle) {
    return this.exclusive(() => this.acceptPrepared(bundle));
  }
  async acceptPrepared(bundle) {
    for (let attempt = 0; attempt < 5; attempt++) {
      this.admissionHead = this.state().head;
      const entries = this.entries();
      this.admissionDocuments = hash(entries);
      const source = bundle.snapshot ? unpackLinearSnapshot(bundle.snapshot) : null;
      try {
        this.plans = await this.prepare(bundle.commits, entries, source);
        const response = super.acceptBundle(bundle);
        return response;
      } catch (error) {
        if (error.message === "DOCUMENT_FULL_STATE_REQUIRED")
          return { kind: "needs-snapshot", reason: error.message };
        if (error.message !== "DOCUMENT_ADMISSION_RETRY") throw error;
      } finally {
        this.plans = new Map();
      }
    }
    throw new Error("DOCUMENT_ADMISSION_RETRY");
  }
  async installResponse(response, options) {
    return this.exclusive(() => this.installPrepared(response, options));
  }
  async installPrepared(response, options) {
    const prepared = { ...response };
    if (response.snapshot) {
      prepared.snapshot = await normalizedSnapshot(response.snapshot);
      prepared.dataHash = JSON.parse(prepared.snapshot.body).dataHash;
    }
    const state = this.state();
    const pending = this.db.prepare("SELECT 1 FROM _linear_local").get();
    const initial =
      pending && response.kind === "incremental"
        ? unpackLinearSnapshot(
            JSON.parse(this.db.prepare("SELECT payload FROM _linear_ack_snapshot").get().payload)
          ).documents
        : this.entries();
    this.plans = await this.prepare(
      (response.records ?? []).map(record => record.commit),
      initial,
      null,
      { canonicalReplay: true }
    );
    try {
      if (state.head !== this.state().head) throw new Error("LOCAL_CHANGED_DURING_SYNC");
      return super.installResponse(prepared, options);
    } finally {
      this.plans = new Map();
    }
  }
  async chooseBranch(id, options) {
    const row = this.db.prepare("SELECT payload FROM _linear_branches WHERE id=?").get(id);
    if (!row) throw new Error("BRANCH_MISSING");
    await normalizedSnapshot({ id, body: row.payload });
    return super.chooseBranch(id, options);
  }
  copies() {
    return this.db
      .prepare("SELECT * FROM _linear_document_copies ORDER BY id")
      .all()
      .map(row => ({ ...row, document: projection(JSON.parse(row.payload)).shared }));
  }
}

export async function synchronizeHybrid(replica, authority, options) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = replica.bodyBundle();
    const total = replica.db.prepare("SELECT count(*) AS n FROM _linear_local").get().n;
    if (body && body.pending.length < total) {
      let accepted = await authority.acceptBundle(body);
      if (accepted.kind === "needs-snapshot")
        accepted = await authority.acceptBundle(replica.bodyBundle({ includeSnapshot: true }));
    }
    let result = await authority.acceptBundle(replica.bundle({ includeSnapshot: false }));
    if (result.kind === "needs-snapshot") result = await authority.acceptBundle(replica.bundle());
    try {
      await replica.installResponse(result, options);
      return { ...result, libraryChoiceRequired: false, noteCopies: replica.copies().length };
    } catch (error) {
      if (error.message !== "LOCAL_CHANGED_DURING_SYNC" || attempt === 3) throw error;
    }
  }
}
