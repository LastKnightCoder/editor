import type Database from "better-sqlite3";
import * as Y from "yjs";
import {
  DocumentWriteQueue,
  WhiteboardModel,
  collectWhiteboardRelations,
  validateWhiteboardDocument,
} from "@tau/collaboration";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import { ContentLocalState } from "../collaboration/content-local-state";
import { ContentIdentityTable } from "../tables/content-identity";
import { WhiteboardJournal, journalKey, stateHash } from "./journal";
import { WhiteboardDocumentRepository, type WhiteboardRelationCounter } from "./repository";

type Target = Parameters<WhiteboardDocumentRepository["installBaseline"]>[2];
interface Installation {
  kind: "whiteboard";
  library: NonNullable<ReturnType<typeof ContentIdentityTable.library>>;
  expected: Parameters<WhiteboardDocumentRepository["installBaseline"]>[1];
  target: Target;
  beforeHash: string;
  publication?: { roomId: string; serverUrl: string };
  remoteIdentity?: { documentId: string; baselineId: string; epoch: number };
}

/** 共享操作保存候选与安装回执；主库与白板日志分别落盘，不假设跨库事务。 */
export class WhiteboardInstallation {
  private readonly queue = new DocumentWriteQueue(16 * 1024 * 1024);
  constructor(
    readonly state: ContentLocalState,
    readonly journal: WhiteboardJournal,
    private readonly counts?: WhiteboardRelationCounter,
    private readonly currentDatabase: (
      db: Database.Database,
      workspaceId: string
    ) => boolean = db => db.open
  ) {}
  pending(workspaceId: string, documentId: string) {
    return this.state
      .pendingInstallations()
      .find(
        record =>
          record.plan.kind === "whiteboard" &&
          record.plan.workspaceId === workspaceId &&
          record.plan.documentId === documentId
      );
  }
  async prepare(
    db: Database.Database,
    workspaceId: string,
    request: {
      operationId: string;
      documentId: string;
      candidate: Uint8Array;
      target: Omit<Target, "documentId" | "epoch">;
      evidence?: unknown;
      publication?: { roomId: string; serverUrl: string };
    }
  ) {
    if (!this.currentDatabase(db, workspaceId)) throw new Error("原资料库连接已变化");
    const previous = this.state.installation(request.operationId);
    if (previous) {
      if (
        previous.plan.kind !== "whiteboard" ||
        previous.plan.workspaceId !== workspaceId ||
        previous.plan.documentId !== request.documentId ||
        previous.plan.fingerprint.candidateHash !== stateHash(request.candidate)
      )
        throw new Error("共享提交操作不能更换候选或目标");
      return previous;
    }
    const library = ContentIdentityTable.library(db);
    if (!library) throw new Error("请先采用已确认的同源资料库基线");
    const repository = new WhiteboardDocumentRepository(db, workspaceId, this.counts);
    const original = repository.read(request.documentId);
    if (!original) throw new Error("白板文档不存在，不能安装共享结果");
    const durable = this.journal.load(journalKey(original));
    if (durable && (durable.hash !== original.hash || durable.projectedHash !== durable.hash))
      throw new Error("白板须先冲刷全部视图和主库投影");
    const candidate = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(candidate, request.candidate);
      const model = new WhiteboardModel(candidate);
      try {
        await model.validate();
        if (candidate.store.pendingStructs || candidate.store.pendingDs)
          throw new Error("白板候选缺少依赖");
        const meta = candidate.share.has("meta") ? candidate.getMap("meta") : undefined;
        const remoteIdentity = meta && {
          documentId: String(meta.get("documentId")),
          baselineId: String(meta.get("baselineId")),
          epoch: Number(meta.get("epoch")),
        };
        if (remoteIdentity) await validateWhiteboardDocument(candidate, remoteIdentity);
        const bytes = Y.encodeStateAsUpdate(candidate);
        if (stateHash(bytes) !== stateHash(request.candidate))
          throw new Error("候选须使用完整规范编码");
        const installation: Installation = {
          kind: "whiteboard",
          library,
          expected: { documentId: original.documentId, hash: original.hash, epoch: original.epoch },
          target: {
            ...request.target,
            documentId: request.documentId,
            epoch: original.epoch + 1,
          },
          beforeHash: durable?.hash ?? original.hash,
          ...(request.publication ? { publication: request.publication } : {}),
          ...(remoteIdentity ? { remoteIdentity } : {}),
        };
        if (!this.currentDatabase(db, workspaceId)) throw new Error("准备期间资料库连接已变化");
        const current = repository.read(request.documentId);
        if (current?.hash !== original?.hash || current?.epoch !== original?.epoch)
          throw new Error("准备期间白板已变化");
        return this.state.begin({
          kind: "whiteboard",
          operationId: request.operationId,
          workspaceId,
          documentId: request.documentId,
          expectedEpoch: original.epoch,
          fingerprint: {
            expectedRevision: original.hash,
            candidateHash: stateHash(bytes),
            baselineId: remoteIdentity?.baselineId ?? library.baselineId,
            targetVersion: 3,
          },
          prepared: {
            candidate: Buffer.from(bytes).toString("base64"),
            installation: canonicalContractJson(installation),
            conversion: canonicalContractJson(request.evidence ?? {}),
          },
        });
      } finally {
        model.dispose();
      }
    } finally {
      candidate.destroy();
    }
  }
  install(
    db: Database.Database,
    workspaceId: string,
    operationId: string,
    checkpoint?: (phase: "decision" | "main" | "journal" | "complete") => void
  ) {
    return this.queue.run(operationId, 0, () =>
      this.installOnce(db, workspaceId, operationId, checkpoint)
    );
  }
  private async installOnce(
    db: Database.Database,
    workspaceId: string,
    operationId: string,
    checkpoint?: (phase: "decision" | "main" | "journal" | "complete") => void
  ) {
    let record = this.state.installation(operationId);
    if (!record || record.plan.kind !== "whiteboard" || record.plan.workspaceId !== workspaceId)
      throw new Error("白板共享提交目标不匹配");
    if (["ABORTED", "EXPIRED"].includes(record.phase)) throw new Error("已终止共享提交不能安装");
    const installation = JSON.parse(record.plan.prepared.installation) as Installation;
    if (
      installation.kind !== "whiteboard" ||
      installation.target.documentId !== record.plan.documentId ||
      canonicalContractJson(ContentIdentityTable.library(db)) !==
        canonicalContractJson(installation.library)
    )
      throw new Error("资料库来源或基线不同，共享提交记录已保留");
    const bytes = Buffer.from(record.plan.prepared.candidate, "base64");
    if (stateHash(bytes) !== record.plan.fingerprint.candidateHash)
      throw new Error("候选摘要不匹配");
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, bytes);
    const model = new WhiteboardModel(doc);
    try {
      await model.validate();
      if (installation.remoteIdentity)
        await validateWhiteboardDocument(doc, installation.remoteIdentity);
      if (!this.currentDatabase(db, workspaceId))
        throw new Error("原资料库连接已变化，共享提交记录已保留");
      const repository = new WhiteboardDocumentRepository(db, workspaceId, this.counts);
      if (record.phase === "COMPLETE") {
        const current = repository.read(record.plan.documentId);
        if (!current || current.epoch !== installation.target.epoch)
          throw new Error("已完成共享提交的目标代次已变化");
        return current;
      }
      if (installation.publication) {
        const proof = this.state.db
          .prepare("SELECT value FROM settings WHERE key=?")
          .get(`whiteboard-publication-receipt:${operationId}`) as { value: string } | undefined;
        const receipt = proof && JSON.parse(proof.value);
        if (
          !receipt ||
          receipt.candidateHash !== record.plan.fingerprint.candidateHash ||
          receipt.baselineId !== installation.remoteIdentity?.baselineId ||
          receipt.version !== 3
        )
          throw new Error("首次发布尚未取得匹配的耐久服务端回执");
      }
      if (!record.decision) {
        const current = repository.read(record.plan.documentId);
        const installed =
          current?.epoch === installation.target.epoch &&
          current.hash === record.plan.fingerprint.candidateHash;
        if (
          !installed &&
          ((current?.hash ?? null) !== installation.beforeHash ||
            (current?.epoch ?? 0) !== record.plan.expectedEpoch)
        )
          throw new Error("原白板已变化，不能安装过时候选");
        record = this.state.decideLocal(operationId, "commit");
        checkpoint?.("decision");
      }
      const installed = db.transaction(() => {
        const installed = repository.installBaseline(
          model,
          installation.expected,
          installation.target
        );
        return installed;
      })();
      checkpoint?.("main");
      if (!record.decision) {
        record = this.state.decideLocal(operationId, "commit");
        checkpoint?.("decision");
      }
      const receipt = record.decision!;
      this.state.installed(operationId, "main", receipt);
      const existing = this.journal.load(journalKey(installed));
      if (existing) {
        if (existing.hash !== installed.hash || existing.revision !== 0)
          throw new Error("新代次日志与共享提交候选不同");
      } else
        this.journal.seed(
          { ...installed, projectedRevision: 0, projectedHash: installed.hash },
          collectWhiteboardRelations(model, true).map(ref => ref.target)
        );
      this.state.installed(operationId, "collaboration", receipt);
      checkpoint?.("journal");
      if (
        repository.read(installed.documentId)?.hash !== installed.hash ||
        this.journal.load(journalKey(installed))?.hash !== installed.hash
      )
        throw new Error("安装读回不一致");
      this.state.complete(operationId, receipt);
      checkpoint?.("complete");
      return installed;
    } finally {
      model.dispose();
      doc.destroy();
    }
  }
}
