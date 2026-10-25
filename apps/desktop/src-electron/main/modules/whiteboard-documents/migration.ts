import type Database from "better-sqlite3";
import { dirname } from "node:path";
import { ContentRecoveryStore } from "../collaboration/content-recovery";
import type { LocalRecoveryReceipt } from "../collaboration/content-local-state";
import {
  installContentLibraryBaseline,
  type ContentLibraryBaseline,
} from "../collaboration/content-baseline";
import * as Y from "yjs";
import {
  DocumentWriteQueue,
  WhiteboardModel,
  collectWhiteboardRelations,
  validateWhiteboardDocument,
  type DocumentMigration,
} from "@tau/collaboration";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import { ContentLocalState } from "../collaboration/content-local-state";
import { ContentIdentityTable } from "../tables/content-identity";
import { WhiteboardJournal, journalKey, stateHash } from "./journal";
import { WhiteboardDocumentRepository, type WhiteboardRelationCounter } from "./repository";
import { legacyWhiteboardReferenceCounts } from "./legacy";

type Target = Parameters<WhiteboardDocumentRepository["installBaseline"]>[2];
interface Installation {
  kind: "whiteboard";
  baseline?: { hash: string; value: ContentLibraryBaseline };
  library: NonNullable<ReturnType<typeof ContentIdentityTable.library>>;
  expected: Parameters<WhiteboardDocumentRepository["installBaseline"]>[1];
  target: Target;
  beforeHash: string | null;
  publication?: { roomId: string; serverUrl: string };
  remoteIdentity?: { documentId: string; baselineId: string; epoch: number };
}
const json = (value: unknown) => Buffer.from(canonicalContractJson(value));

/** 复用正文迁移账保存候选与安装回执；主库与白板日志分别落盘，不假设跨库事务。 */
export class WhiteboardMigration {
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
      .pendingMigrations()
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
      operation?: DocumentMigration;
      evidence?: unknown;
      baseline?: { hash: string; value: ContentLibraryBaseline };
      publication?: { roomId: string; serverUrl: string };
    }
  ) {
    if (!this.currentDatabase(db, workspaceId)) throw new Error("原资料库连接已变化");
    const previous = this.state.migration(request.operationId);
    if (previous) {
      if (
        previous.plan.kind !== "whiteboard" ||
        previous.plan.workspaceId !== workspaceId ||
        previous.plan.documentId !== request.documentId ||
        previous.plan.fingerprint.candidateHash !== stateHash(request.candidate)
      )
        throw new Error("迁移操作不能更换候选或目标");
      return previous;
    }
    const library =
      ContentIdentityTable.library(db) ??
      (request.baseline
        ? {
            sourceId: request.baseline.value.library.source_id,
            baselineId: request.baseline.value.library.baseline_id,
            confirmedSnapshot: request.baseline.value.library.confirmed_snapshot,
          }
        : null);
    if (!library) throw new Error("请先采用已确认的同源资料库基线");
    const repository = new WhiteboardDocumentRepository(db, workspaceId, this.counts);
    const original = repository.read(request.documentId);
    const durable = original && this.journal.load(journalKey(original));
    if (durable && (durable.hash !== original!.hash || durable.projectedHash !== durable.hash))
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
        const operation = request.operation;
        if (
          operation &&
          (operation.state !== "PENDING" ||
            !operation.frozenRevision ||
            operation.id !== request.operationId ||
            operation.documentId !== remoteIdentity?.documentId ||
            remoteIdentity?.epoch !== operation.expectedEpoch + 1)
        )
          throw new Error("服务端屏障与白板候选不匹配");
        const bytes = Y.encodeStateAsUpdate(candidate);
        if (stateHash(bytes) !== stateHash(request.candidate))
          throw new Error("候选须使用完整规范编码");
        const installation: Installation = {
          kind: "whiteboard",
          library,
          ...(request.baseline ? { baseline: request.baseline } : {}),
          expected: original
            ? { documentId: original.documentId, hash: original.hash, epoch: original.epoch }
            : null,
          target: {
            ...request.target,
            documentId: request.documentId,
            epoch: (original?.epoch ?? 0) + 1,
          },
          beforeHash: durable?.hash ?? original?.hash ?? null,
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
          expectedEpoch: operation?.expectedEpoch ?? original?.epoch ?? 0,
          remote: Boolean(operation),
          ...(operation ? { remoteDocumentId: operation.documentId } : {}),
          ...(request.publication
            ? {}
            : { expiresAt: operation?.expiresAt ?? Date.now() + 600_000 }),
          fingerprint: {
            expectedRevision:
              operation?.frozenRevision ?? original?.hash ?? stateHash(json(request.target)),
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
  cancel(db: Database.Database, workspaceId: string, operationId: string) {
    return this.queue.run(operationId, 0, () => this.cancelOnce(db, workspaceId, operationId));
  }
  private async cancelOnce(db: Database.Database, workspaceId: string, operationId: string) {
    const record = this.state.migration(operationId);
    if (
      !record ||
      record.plan.kind !== "whiteboard" ||
      record.plan.workspaceId !== workspaceId ||
      record.plan.remote ||
      !this.currentDatabase(db, workspaceId)
    )
      throw new Error("本机转换来源不匹配");
    const installation = JSON.parse(record.plan.prepared.installation) as Installation;
    const library = ContentIdentityTable.library(db);
    if (library && canonicalContractJson(library) !== canonicalContractJson(installation.library))
      throw new Error("资料库来源不同，不能裁决原转换");
    if (installation.beforeHash !== null || installation.publication)
      return this.state.decideLocal(operationId, "abort");
    const installed = new WhiteboardDocumentRepository(db, workspaceId, this.counts).read(
      record.plan.documentId
    );
    if (installed) {
      if (
        installed.epoch !== installation.target.epoch ||
        installed.hash !== record.plan.fingerprint.candidateHash
      )
        throw new Error("主库已有不同白板，不能认定转换未安装");
      await this.installOnce(db, workspaceId, operationId);
      return this.state.migration(operationId)!;
    }
    return this.state.decideLocal(operationId, "abort", true);
  }
  private async installOnce(
    db: Database.Database,
    workspaceId: string,
    operationId: string,
    checkpoint?: (phase: "decision" | "main" | "journal" | "complete") => void
  ) {
    let record = this.state.migration(operationId);
    if (!record || record.plan.kind !== "whiteboard" || record.plan.workspaceId !== workspaceId)
      throw new Error("白板迁移目标不匹配");
    if (["ABORTED", "EXPIRED"].includes(record.phase)) throw new Error("已终止迁移不能安装");
    const installation = JSON.parse(record.plan.prepared.installation) as Installation;
    if (
      installation.kind !== "whiteboard" ||
      installation.target.documentId !== record.plan.documentId ||
      (ContentIdentityTable.library(db)
        ? canonicalContractJson(ContentIdentityTable.library(db)) !==
          canonicalContractJson(installation.library)
        : !installation.baseline || stateHash(db.serialize()) !== installation.baseline.hash)
    )
      throw new Error("资料库来源或基线不同，迁移记录已保留");
    const evidence = JSON.parse(record.plan.prepared.conversion) as {
      recovery?: LocalRecoveryReceipt;
    };
    if (evidence.recovery)
      new ContentRecoveryStore(dirname(this.state.db.name), this.state).verify(evidence.recovery);
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
      const legacyReferences =
        installation.beforeHash === null
          ? await legacyWhiteboardReferenceCounts(installation.target.pages)
          : [];
      if (!this.currentDatabase(db, workspaceId))
        throw new Error("原资料库连接已变化，迁移记录已保留");
      const repository = new WhiteboardDocumentRepository(db, workspaceId, this.counts);
      if (record.phase === "COMPLETE") {
        const current = repository.read(record.plan.documentId);
        if (!current || current.epoch !== installation.target.epoch)
          throw new Error("已完成迁移的目标代次已变化");
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
        if (record.plan.remote) throw new Error("须先确认服务端迁移裁决");
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
        if (installation.beforeHash !== null || installation.publication) {
          record = this.state.decideLocal(operationId, "commit");
          checkpoint?.("decision");
        }
      }
      const installed = db.transaction(() => {
        const pageTimes =
          installation.beforeHash === null
            ? installation.target.pages.map(page => ({
                id: page.contentId,
                row: db
                  .prepare("SELECT update_time FROM white_board_contents WHERE id=?")
                  .get(page.contentId) as { update_time: number } | undefined,
              }))
            : [];
        const boardTime =
          installation.beforeHash === null && installation.target.boardId !== null
            ? (db
                .prepare("SELECT update_time FROM white_boards WHERE id=?")
                .get(installation.target.boardId) as { update_time: number } | undefined)
            : undefined;
        if (installation.baseline) installContentLibraryBaseline(db, installation.baseline.value);
        const installed = repository.installBaseline(
          model,
          installation.expected,
          installation.target,
          legacyReferences
        );
        for (const page of pageTimes)
          if (page.row)
            db.prepare("UPDATE white_board_contents SET update_time=? WHERE id=?").run(
              page.row.update_time,
              page.id
            );
        if (boardTime)
          db.prepare("UPDATE white_boards SET update_time=? WHERE id=?").run(
            boardTime.update_time,
            installation.target.boardId
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
          throw new Error("新代次日志与迁移候选不同");
      } else
        this.journal.seed(
          { ...installed, projectedRevision: 0, projectedHash: installed.hash },
          collectWhiteboardRelations(model, true).map(ref => ref.target)
        );
      const conversion = JSON.parse(record.plan.prepared!.conversion) as {
        views?: { pageId: string; selection: unknown; viewPort: unknown }[];
      };
      this.state.db.transaction(() => {
        if (!this.state.migration(operationId)?.installations.collaboration)
          for (const view of conversion.views ?? []) {
            const key = {
              workspaceId,
              documentId: record!.plan.documentId,
              nodeId: view.pageId,
              owner: "host.whiteboard.page",
            };
            const current = this.state.readView(key);
            this.state.writeView(
              key,
              { selection: view.selection, viewPort: view.viewPort, ...current?.value },
              current?.revision ?? null
            );
          }
        this.state.installed(operationId, "collaboration", receipt);
      })();
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
