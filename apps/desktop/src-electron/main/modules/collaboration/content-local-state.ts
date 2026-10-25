import type Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import {
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import type {
  DocumentMigration,
  MigrationFingerprint,
  MigrationReceipt,
  ContentInputDraft,
} from "@tau/collaboration";

export interface InputDraftIdentity {
  workspaceId: string;
  documentId: string;
  baselineId: string;
  epoch: number;
}

export interface NodeViewKey {
  workspaceId: string;
  documentId: string;
  nodeId: string;
  owner: string;
}
export interface LocalRecoveryReceipt {
  id: string;
  manifestHash: string;
  manifestPath: string;
}
export interface RemoteMigrationPreparation {
  operationId: string;
  workspaceId: string;
  documentId: string;
  expectedEpoch: number;
  expiresAt: number;
}
interface MigrationPlanFields {
  remoteDocumentId?: string;
  expiresAt?: number;
  operationId: string;
  workspaceId: string;
  documentId: string;
  expectedEpoch: number;
  targetEpoch?: number;
  remote: boolean;
  fingerprint: MigrationFingerprint;
}
export type LocalMigrationPlan = MigrationPlanFields &
  (
    | { kind?: undefined; recovery: LocalRecoveryReceipt; prepared?: never }
    | {
        kind: "whiteboard";
        recovery?: never;
        prepared: { candidate: string; installation: string; conversion: string };
      }
  );
export type LocalInstallTarget = "main" | "collaboration";
export interface LocalMigrationRecord<Plan extends LocalMigrationPlan = LocalMigrationPlan> {
  plan: Plan;
  phase:
    | "PREPARED"
    | "BACKED_UP"
    | "FROZEN"
    | "SERVER_COMMITTED"
    | "LOCAL_COMMITTED"
    | "LOCAL_INSTALLED"
    | "COMPLETE"
    | "ABORTED"
    | "EXPIRED";
  decision?: MigrationReceipt;
  installations: Partial<Record<LocalInstallTarget, MigrationReceipt>>;
  reason?: string;
}

const token = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const committed = (record: LocalMigrationRecord) => Boolean(record.decision);
const ended = (record: LocalMigrationRecord) =>
  ["ABORTED", "EXPIRED", "COMPLETE"].includes(record.phase);
const same = (left: unknown, right: unknown) =>
  canonicalContractJson(left) === canonicalContractJson(right);
function viewJson(value: unknown): string {
  let count = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++count > 10_000 || depth > 32) throw new Error("本机视图状态超过预算");
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    )
      return;
    if (Array.isArray(item)) {
      for (const value of item) visit(value, depth + 1);
      return;
    }
    if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
      for (const [key, value] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("本机视图状态属性无效");
        visit(value, depth + 1);
      }
      return;
    }
    throw new Error("本机视图状态必须是有限 JSON 数据");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("本机视图状态必须是对象");
  visit(value, 0);
  const encoded = canonicalContractJson(value);
  if (Buffer.byteLength(encoded) > 64 * 1024) throw new Error("本机视图状态超过预算");
  return encoded;
}
const keyOf = (key: NodeViewKey) => {
  const values = [key.workspaceId, key.documentId, key.nodeId, key.owner];
  if (!values.every(token)) throw new Error("本机节点视图身份无效");
  return values;
};

/** 本机数据库不进入资料库同步；所有提交均在返回前写入 FULL 同步事务。 */
export class ContentLocalState {
  constructor(readonly db: Database.Database) {}

  readView(key: NodeViewKey): { value: Record<string, unknown>; revision: string } | null {
    const row = this.db
      .prepare(
        "SELECT value,revision FROM node_views WHERE workspace_id=? AND document_id=? AND node_id=? AND owner=?"
      )
      .get(...keyOf(key)) as { value: string; revision: string } | undefined;
    return row ? { value: JSON.parse(row.value), revision: row.revision } : null;
  }

  saveDocumentDraft(
    identity: InputDraftIdentity,
    viewId: string,
    draft: { state: Uint8Array; sequence: number }
  ): void {
    if (
      ![identity.workspaceId, identity.documentId, identity.baselineId, viewId].every(token) ||
      !Number.isSafeInteger(identity.epoch) ||
      identity.epoch < 0 ||
      !Number.isSafeInteger(draft.sequence) ||
      draft.sequence < 1 ||
      !(draft.state instanceof Uint8Array) ||
      !draft.state.byteLength ||
      draft.state.byteLength > 8 * 1024 * 1024
    )
      throw new Error("文档恢复副本参数无效");
    const legacy = this.hasLegacyDraftsColumn();
    const legacySize = legacy ? "length(CAST(private_nodes AS BLOB))" : "0";
    const digest = createHash("sha256").update(draft.state).digest("hex");
    this.db.transaction(() => {
      const previous = this.db
        .prepare(
          `SELECT workspace_id,document_id,baseline_id,epoch,sequence,digest,length(state)+${legacySize} AS size,${legacy ? "private_nodes" : "'[]'"} AS legacy FROM document_drafts WHERE view_id=?`
        )
        .get(viewId) as
        | {
            workspace_id: string;
            document_id: string;
            baseline_id: string;
            epoch: number;
            sequence: number;
            digest: string;
            size: number;
            legacy: string;
          }
        | undefined;
      if (previous) {
        if (previous.legacy !== "[]") throw new Error("旧私有草稿尚未恢复，不能覆盖原始记录");
        if (
          previous.workspace_id !== identity.workspaceId ||
          previous.document_id !== identity.documentId ||
          previous.baseline_id !== identity.baselineId ||
          previous.epoch !== identity.epoch
        )
          throw new Error("文档副本的来源已变化");
        if (draft.sequence < previous.sequence) return;
        if (draft.sequence === previous.sequence) {
          if (digest !== previous.digest) throw new Error("文档副本批次内容冲突");
          return;
        }
      }
      this.db
        .prepare("DELETE FROM document_drafts WHERE workspace_id=? AND applied=1 AND view_id<>?")
        .run(identity.workspaceId, viewId);
      const used = (
        this.db
          .prepare(
            `SELECT coalesce(sum(length(state)+${legacySize}),0) AS bytes FROM document_drafts WHERE workspace_id=?`
          )
          .get(identity.workspaceId) as { bytes: number }
      ).bytes;
      if (used - (previous?.size ?? 0) + draft.state.byteLength > 128 * 1024 * 1024)
        throw new Error("未确认文档副本超过本机容量，请先恢复或导出已有副本");
      this.db
        .prepare(
          `INSERT INTO document_drafts(view_id,workspace_id,document_id,baseline_id,epoch,state,${legacy ? "private_nodes," : ""}digest,sequence,applied) VALUES (?,?,?,?,?,?,${legacy ? "'[]'," : ""}?,?,0) ON CONFLICT(view_id) DO UPDATE SET state=excluded.state,digest=excluded.digest,sequence=excluded.sequence,applied=0`
        )
        .run(
          viewId,
          identity.workspaceId,
          identity.documentId,
          identity.baselineId,
          identity.epoch,
          Buffer.from(draft.state),
          digest,
          draft.sequence
        );
    })();
  }

  private hasLegacyDraftsColumn(): boolean {
    return (this.db.prepare("PRAGMA table_info(document_drafts)").all() as { name: string }[]).some(
      column => column.name === "private_nodes"
    );
  }

  documentDrafts(workspaceId: string) {
    return this.db
      .prepare(
        `SELECT view_id AS viewId,document_id AS documentId,baseline_id AS baselineId,epoch,state,${this.hasLegacyDraftsColumn() ? "private_nodes" : "'[]'"} AS legacyPrivateNodes,digest,sequence FROM document_drafts WHERE workspace_id=? AND applied=0 ORDER BY view_id`
      )
      .all(workspaceId) as {
      viewId: string;
      documentId: string;
      baselineId: string;
      epoch: number;
      state: Buffer;
      legacyPrivateNodes: string;
      digest: string;
      sequence: number;
    }[];
  }

  confirmDocumentDrafts(
    documentId: string,
    baselineId: string,
    epoch: number,
    includes: (state: Uint8Array) => boolean
  ): void {
    const drafts = this.db
      .prepare(
        `SELECT view_id,state,digest FROM document_drafts WHERE document_id=? AND baseline_id=? AND epoch=? AND applied=0${this.hasLegacyDraftsColumn() ? " AND private_nodes='[]'" : ""}`
      )
      .all(documentId, baselineId, epoch) as { view_id: string; state: Buffer; digest: string }[];
    for (const draft of drafts)
      if (includes(draft.state))
        this.db
          .prepare("UPDATE document_drafts SET applied=1 WHERE view_id=? AND digest=?")
          .run(draft.view_id, draft.digest);
  }

  hasDocumentDrafts(workspaceId: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM document_drafts WHERE workspace_id=? AND applied=0 LIMIT 1")
        .get(workspaceId)
    );
  }

  saveInputDraft(identity: InputDraftIdentity, viewId: string, draft: ContentInputDraft): void {
    if (
      ![
        identity.workspaceId,
        identity.documentId,
        identity.baselineId,
        viewId,
        draft.nodeId,
        draft.field,
        draft.revision,
      ].every(token) ||
      !Number.isSafeInteger(identity.epoch) ||
      identity.epoch < 0 ||
      !Number.isSafeInteger(draft.sequence) ||
      draft.sequence < 1 ||
      typeof draft.value !== "string" ||
      Buffer.byteLength(draft.value) > 8 * 1024 * 1024
    )
      throw new Error("输入副本无效或超过预算");
    this.db.transaction(() => {
      const old = this.db
        .prepare("SELECT * FROM input_drafts WHERE view_id=? AND node_id=? AND field=?")
        .get(viewId, draft.nodeId, draft.field) as
        | {
            workspace_id: string;
            document_id: string;
            baseline_id: string;
            epoch: number;
            sequence: number;
            revision: string;
            value: string;
          }
        | undefined;
      if (old) {
        if (
          old.workspace_id !== identity.workspaceId ||
          old.document_id !== identity.documentId ||
          old.baseline_id !== identity.baselineId ||
          old.epoch !== identity.epoch
        )
          throw new Error("输入副本不能更换来源");
        if (old.sequence > draft.sequence) return;
        if (old.sequence === draft.sequence) {
          if (old.revision !== draft.revision || old.value !== draft.value)
            throw new Error("输入副本批次身份冲突");
          return;
        }
      }
      this.db
        .prepare(
          `INSERT INTO input_drafts VALUES (?,?,?,?,?,?,?,?,?,?,0,?)
        ON CONFLICT(view_id,node_id,field) DO UPDATE SET value=excluded.value,revision=excluded.revision,sequence=excluded.sequence,applied=0,updated_at=excluded.updated_at`
        )
        .run(
          identity.workspaceId,
          identity.documentId,
          identity.baselineId,
          identity.epoch,
          viewId,
          draft.nodeId,
          draft.field,
          draft.value,
          draft.revision,
          draft.sequence,
          Date.now()
        );
      const bytes = () =>
        (
          this.db
            .prepare(
              "SELECT coalesce(sum(length(cast(value AS BLOB))),0) AS bytes FROM input_drafts WHERE workspace_id=?"
            )
            .get(identity.workspaceId) as { bytes: number }
        ).bytes;
      if (bytes() > 64 * 1024 * 1024)
        this.db
          .prepare("DELETE FROM input_drafts WHERE workspace_id=? AND applied=1")
          .run(identity.workspaceId);
      if (bytes() > 64 * 1024 * 1024)
        throw new Error("待恢复输入超过本机预算，请先导出或处理已有副本");
    })();
  }

  confirmInputDrafts(
    documentId: string,
    baselineId: string,
    epoch: number,
    read: (nodeId: string, field: string) => string | undefined
  ): void {
    this.db.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT view_id,node_id,field,value FROM input_drafts WHERE document_id=? AND baseline_id=? AND epoch=? AND applied=0"
        )
        .all(documentId, baselineId, epoch) as {
        view_id: string;
        node_id: string;
        field: string;
        value: string;
      }[];
      const update = this.db.prepare(
        "UPDATE input_drafts SET applied=1 WHERE view_id=? AND node_id=? AND field=?"
      );
      for (const row of rows)
        if (read(row.node_id, row.field) === row.value)
          update.run(row.view_id, row.node_id, row.field);
    })();
  }

  inputDrafts(workspaceId: string) {
    return this.db
      .prepare(
        "SELECT document_id AS documentId,baseline_id AS baselineId,epoch,view_id AS viewId,node_id AS nodeId,field,value,revision,sequence,updated_at AS updatedAt FROM input_drafts WHERE workspace_id=? AND applied=0 ORDER BY updated_at"
      )
      .all(workspaceId) as (ContentInputDraft &
      Omit<InputDraftIdentity, "workspaceId"> & { viewId: string; updatedAt: number })[];
  }

  writeView(key: NodeViewKey, value: Record<string, unknown>, expectedRevision: string | null) {
    const encoded = viewJson(value);
    return this.db.transaction(() => {
      if ((this.readView(key)?.revision ?? null) !== expectedRevision)
        throw new Error("本机视图状态已变化");
      const revision = randomUUID();
      this.db
        .prepare(
          "INSERT INTO node_views VALUES (?,?,?,?,?,?) ON CONFLICT(workspace_id,document_id,node_id,owner) DO UPDATE SET value=excluded.value,revision=excluded.revision"
        )
        .run(...keyOf(key), encoded, revision);
      return { value: JSON.parse(encoded) as Record<string, unknown>, revision };
    })();
  }

  replaceHolds(
    workspaceId: string,
    holder: string,
    reason: "shared-membership" | "undo" | "offline-edit" | "recovery",
    targets: readonly ContentEntityReference[]
  ) {
    if (
      !token(workspaceId) ||
      !token(holder) ||
      !["shared-membership", "undo", "offline-edit", "recovery"].includes(reason) ||
      targets.some(target => !isContentEntityReference(target))
    )
      throw new Error("本机持有记录无效");
    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM entity_holds WHERE workspace_id=? AND holder=?")
        .run(workspaceId, holder);
      const insert = this.db.prepare("INSERT OR IGNORE INTO entity_holds VALUES (?,?,?,?,?,?)");
      for (const target of targets)
        insert.run(workspaceId, holder, reason, target.sourceId, target.kind, target.entityId);
    })();
  }

  isHeld(workspaceId: string, target: ContentEntityReference): boolean {
    if (!isContentEntityReference(target)) return false;
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM entity_holds WHERE workspace_id=? AND source_id=? AND entity_kind=? AND entity_id=? LIMIT 1"
        )
        .get(workspaceId, target.sourceId, target.kind, target.entityId)
    );
  }

  holders(workspaceId: string, holder?: string) {
    return this.db
      .prepare(
        "SELECT holder,reason,source_id AS sourceId,entity_kind AS kind,entity_id AS entityId FROM entity_holds WHERE workspace_id=?" +
          (holder === undefined ? "" : " AND holder=?") +
          " ORDER BY holder,source_id,entity_kind,entity_id"
      )
      .all(
        ...(holder === undefined ? [workspaceId] : [workspaceId, holder])
      ) as (ContentEntityReference & { holder: string; reason: string })[];
  }

  /** 仅在恢复包已落盘并逐文件校验后登记；登记不能代替恢复包的完整性校验。 */
  registerRecovery(receipt: LocalRecoveryReceipt, workspaceId: string) {
    if (
      !token(receipt.id) ||
      !digest(receipt.manifestHash) ||
      !receipt.manifestPath ||
      !token(workspaceId)
    )
      throw new Error("恢复包回执无效");
    const old = this.recovery(receipt.id);
    if (old && !same(old, receipt)) throw new Error("恢复包身份冲突");
    const scope = this.db
      .prepare("SELECT workspace_id FROM recoveries WHERE id=?")
      .get(receipt.id) as { workspace_id: string | null } | undefined;
    if (scope?.workspace_id && scope.workspace_id !== workspaceId)
      throw new Error("恢复包不能更换资料库归属");
    this.db
      .prepare(
        "INSERT INTO recoveries(id,manifest_hash,manifest_path,workspace_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id"
      )
      .run(receipt.id, receipt.manifestHash, receipt.manifestPath, workspaceId);
  }

  recovery(id: string): LocalRecoveryReceipt | null {
    return (
      (this.db
        .prepare(
          "SELECT id,manifest_hash AS manifestHash,manifest_path AS manifestPath FROM recoveries WHERE id=?"
        )
        .get(id) as LocalRecoveryReceipt | undefined) ?? null
    );
  }

  preparation(documentId: string): RemoteMigrationPreparation | null {
    const row = this.db
      .prepare(
        "SELECT record FROM migrations WHERE document_id=? AND json_extract(record,'$.phase')='PREPARING'"
      )
      .get(documentId) as { record: string } | undefined;
    return row ? JSON.parse(row.record).plan : null;
  }

  preparations(workspaceId: string): RemoteMigrationPreparation[] {
    return (
      this.db
        .prepare(
          "SELECT record FROM migrations WHERE workspace_id=? AND json_extract(record,'$.phase')='PREPARING'"
        )
        .all(workspaceId) as { record: string }[]
    ).map(row => JSON.parse(row.record).plan);
  }

  prepareRemote(plan: RemoteMigrationPreparation): RemoteMigrationPreparation {
    if (
      ![plan.operationId, plan.workspaceId, plan.documentId].every(token) ||
      !Number.isSafeInteger(plan.expectedEpoch) ||
      plan.expectedEpoch < 0 ||
      !Number.isSafeInteger(plan.expiresAt)
    )
      throw new Error("迁移准备身份无效");
    return this.db.transaction(() => {
      const current = this.preparation(plan.documentId);
      if (current) return current;
      if (this.pendingMigrations(plan.documentId).length) throw new Error("原迁移仍待恢复");
      this.db
        .prepare("INSERT INTO migrations VALUES (?,?,?,?)")
        .run(
          plan.operationId,
          plan.workspaceId,
          plan.documentId,
          canonicalContractJson({ preparing: true, phase: "PREPARING", plan })
        );
      return plan;
    })();
  }

  finishPreparation(operation: DocumentMigration): void {
    const plan = this.preparation(operation.documentId);
    if (
      !plan ||
      plan.operationId !== operation.id ||
      plan.expectedEpoch !== operation.expectedEpoch ||
      !["ABORTED", "EXPIRED"].includes(operation.state)
    )
      throw new Error("迁移准备终态不匹配");
    this.db
      .prepare("UPDATE migrations SET record=? WHERE operation_id=?")
      .run(
        canonicalContractJson({ preparing: true, phase: operation.state, plan }),
        plan.operationId
      );
  }

  migration(id: string): LocalMigrationRecord | null {
    const row = this.db.prepare("SELECT record FROM migrations WHERE operation_id=?").get(id) as
      | { record: string }
      | undefined;
    const record = row ? JSON.parse(row.record) : null;
    return record?.preparing ? null : record;
  }

  pendingMigrations(documentId?: string): LocalMigrationRecord[] {
    return (
      this.db
        .prepare(
          `SELECT record FROM migrations WHERE ${documentId === undefined ? "" : "document_id=? AND "}json_extract(record,'$.phase') NOT IN ('PREPARING','COMPLETE','ABORTED','EXPIRED')`
        )
        .all(...(documentId === undefined ? [] : [documentId])) as { record: string }[]
    ).map(row => JSON.parse(row.record) as LocalMigrationRecord);
  }

  begin<Plan extends LocalMigrationPlan>(plan: Plan): LocalMigrationRecord<Plan> {
    if (
      ![plan.operationId, plan.workspaceId, plan.documentId, plan.fingerprint.baselineId].every(
        token
      ) ||
      typeof plan.remote !== "boolean" ||
      (plan.kind !== undefined && plan.kind !== "whiteboard") ||
      (plan.remoteDocumentId !== undefined &&
        (plan.kind !== "whiteboard" || !plan.remote || !token(plan.remoteDocumentId))) ||
      !Number.isSafeInteger(plan.expectedEpoch) ||
      plan.expectedEpoch < 0 ||
      (plan.targetEpoch !== undefined &&
        (!Number.isSafeInteger(plan.targetEpoch) ||
          plan.targetEpoch <= plan.expectedEpoch ||
          (plan.remote && plan.targetEpoch !== plan.expectedEpoch + 1))) ||
      plan.fingerprint.targetVersion !== (plan.kind === "whiteboard" ? 3 : 2) ||
      (plan.expiresAt !== undefined &&
        (!Number.isSafeInteger(plan.expiresAt) || plan.expiresAt <= 0)) ||
      !digest(plan.fingerprint.candidateHash) ||
      !token(plan.fingerprint.expectedRevision)
    )
      throw new Error("本机迁移计划无效");
    return this.db.transaction(() => {
      const previous = this.migration(plan.operationId);
      if (previous) {
        if (!same(previous.plan, plan)) throw new Error("迁移操作不能更换计划");
        return previous as LocalMigrationRecord<Plan>;
      }
      const row = this.db
        .prepare("SELECT record FROM migrations WHERE operation_id=?")
        .get(plan.operationId) as { record: string } | undefined;
      if (row) {
        const preparation = JSON.parse(row.record);
        if (
          !preparation.preparing ||
          preparation.phase !== "PREPARING" ||
          !plan.remote ||
          preparation.plan.documentId !== plan.documentId ||
          preparation.plan.workspaceId !== plan.workspaceId ||
          preparation.plan.expectedEpoch !== plan.expectedEpoch ||
          preparation.plan.expiresAt !== plan.expiresAt
        )
          throw new Error("迁移准备不能更换身份或复活");
      }
      if (plan.kind === "whiteboard") {
        if (
          !plan.prepared ||
          typeof plan.prepared.candidate !== "string" ||
          typeof plan.prepared.installation !== "string" ||
          typeof plan.prepared.conversion !== "string" ||
          Buffer.byteLength(canonicalContractJson(plan.prepared)) > 32 * 1024 * 1024 ||
          createHash("sha256")
            .update(Buffer.from(plan.prepared.candidate, "base64"))
            .digest("hex") !== plan.fingerprint.candidateHash
        )
          throw new Error("迁移候选不完整或摘要不匹配");
        JSON.parse(plan.prepared.installation);
        JSON.parse(plan.prepared.conversion);
      } else if (!same(this.recovery(plan.recovery.id), plan.recovery))
        throw new Error("恢复材料尚未完成保存");
      if (
        this.db
          .prepare(
            "SELECT 1 FROM migrations WHERE workspace_id=? AND document_id=? AND operation_id<>? AND json_extract(record,'$.phase') NOT IN ('COMPLETE','ABORTED','EXPIRED') LIMIT 1"
          )
          .get(plan.workspaceId, plan.documentId, plan.operationId)
      )
        throw new Error("该文档仍有待恢复迁移");
      const record: LocalMigrationRecord<Plan> = {
        plan,
        phase: plan.kind === "whiteboard" ? "PREPARED" : "BACKED_UP",
        installations: {},
      };
      this.db
        .prepare(
          "INSERT INTO migrations VALUES (?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET record=excluded.record"
        )
        .run(plan.operationId, plan.workspaceId, plan.documentId, canonicalContractJson(record));
      return record;
    })();
  }

  private update(id: string, change: (record: LocalMigrationRecord) => void): LocalMigrationRecord {
    return this.db.transaction(() => {
      const record = this.migration(id);
      if (!record) throw new Error("迁移记录不存在，不能推断已经取消");
      change(record);
      this.db
        .prepare("UPDATE migrations SET record=? WHERE operation_id=?")
        .run(canonicalContractJson(record), id);
      return record;
    })();
  }

  observeRemote(id: string, operation: DocumentMigration | null): LocalMigrationRecord {
    return this.update(id, record => {
      if (!record.plan.remote) throw new Error("纯本机迁移不能使用服务端回执");
      if (!operation) return;
      const plan = record.plan;
      if (
        operation.id !== id ||
        operation.documentId !== (plan.remoteDocumentId ?? plan.documentId) ||
        operation.expectedEpoch !== plan.expectedEpoch ||
        (operation.fingerprint && !same(operation.fingerprint, plan.fingerprint))
      )
        throw new Error("服务端迁移回执身份不匹配");
      if (operation.state === "COMMITTED") {
        if (!operation.fingerprint || !operation.receipt) throw new Error("服务端提交回执不完整");
        this.acceptDecision(record, operation.receipt, "SERVER_COMMITTED");
      } else if (operation.state === "ABORTED" || operation.state === "EXPIRED") {
        if (committed(record) || (ended(record) && record.phase !== operation.state))
          throw new Error("服务端终态与本机已确认决定冲突");
        record.phase = operation.state;
        record.reason = operation.reason ?? operation.state;
      } else if (!ended(record) && !committed(record) && operation.frozenRevision) {
        if (operation.frozenRevision !== plan.fingerprint.expectedRevision)
          throw new Error("写入屏障修订已变化");
        record.phase = "FROZEN";
      }
    });
  }

  /** 后台本机升级按原文校验续做，不因客户端离线时间丢弃未决候选。 */
  continueLocal(id: string): LocalMigrationRecord {
    const record = this.migration(id);
    if (!record || record.plan.remote || ended(record))
      throw new Error("该迁移不能作为本机未决操作续做");
    if (record.plan.expiresAt === undefined || record.decision) return record;
    return this.update(id, current => {
      delete current.plan.expiresAt;
    });
  }

  decideLocal(
    id: string,
    decision: "commit" | "abort",
    verifiedUninstalled = false
  ): LocalMigrationRecord {
    const current = this.migration(id);
    if (
      current &&
      !current.plan.remote &&
      !committed(current) &&
      !ended(current) &&
      current.plan.expiresAt !== undefined &&
      Date.now() >= current.plan.expiresAt
    ) {
      this.update(id, record => {
        record.phase = "EXPIRED";
        record.reason = "deadline";
      });
    }
    return this.update(id, record => {
      if (record.plan.remote) throw new Error("共享迁移必须查询服务端裁决");
      if (record.phase === "ABORTED" || record.phase === "EXPIRED") {
        if (decision === "commit") throw new Error("已终止的迁移不能复活");
        return;
      }
      if (decision === "abort") {
        if (
          verifiedUninstalled &&
          (record.plan.kind !== "whiteboard" || Object.keys(record.installations).length)
        )
          throw new Error("只能取消已核对未安装的本机白板转换");
        if (committed(record) && !verifiedUninstalled)
          throw new Error("已提交的本机迁移只能继续安装");
        delete record.decision;
        record.phase = "ABORTED";
        record.reason = "local-cancel";
      } else
        this.acceptDecision(
          record,
          {
            operationId: id,
            documentId: record.plan.documentId,
            epoch: record.plan.targetEpoch ?? record.plan.expectedEpoch + 1,
            revision: record.plan.fingerprint.candidateHash,
            version: record.plan.fingerprint.targetVersion,
            baselineId: record.plan.fingerprint.baselineId,
          },
          "LOCAL_COMMITTED"
        );
    });
  }

  private verifyReceipt(record: LocalMigrationRecord, receipt: MigrationReceipt) {
    const { plan } = record;
    if (
      receipt.operationId !== plan.operationId ||
      receipt.documentId !== (plan.remoteDocumentId ?? plan.documentId) ||
      receipt.epoch !== (plan.targetEpoch ?? plan.expectedEpoch + 1) ||
      receipt.version !== plan.fingerprint.targetVersion ||
      receipt.baselineId !== plan.fingerprint.baselineId ||
      receipt.revision !== plan.fingerprint.candidateHash
    )
      throw new Error("迁移安装回执不匹配");
  }

  private acceptDecision(
    record: LocalMigrationRecord,
    receipt: MigrationReceipt,
    phase: "SERVER_COMMITTED" | "LOCAL_COMMITTED"
  ) {
    this.verifyReceipt(record, receipt);
    if (record.phase === "ABORTED" || record.phase === "EXPIRED")
      throw new Error("已终止的迁移不能复活");
    if (record.decision) {
      if (!same(record.decision, receipt)) throw new Error("迁移提交决定冲突");
      return;
    }
    record.decision = receipt;
    record.phase = phase;
  }

  installed(
    id: string,
    target: LocalInstallTarget,
    receipt: MigrationReceipt
  ): LocalMigrationRecord {
    return this.update(id, record => {
      if (!["main", "collaboration"].includes(target) || !record.decision)
        throw new Error("迁移未确认提交或安装目标无效");
      this.verifyReceipt(record, receipt);
      record.installations[target] = receipt;
      if (
        record.phase !== "COMPLETE" &&
        ["main", "collaboration"].every(
          target => record.installations[target as LocalInstallTarget]
        )
      )
        record.phase = "LOCAL_INSTALLED";
    });
  }

  complete(id: string, readback: MigrationReceipt): LocalMigrationRecord {
    return this.update(id, record => {
      if (record.phase !== "LOCAL_INSTALLED" && record.phase !== "COMPLETE")
        throw new Error("各存储尚未安装完成");
      this.verifyReceipt(record, readback);
      record.phase = "COMPLETE";
    });
  }
}
