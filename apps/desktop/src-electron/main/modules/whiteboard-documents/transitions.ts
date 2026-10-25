import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import {
  normalizeServerUrl,
  DocumentWriteQueue,
  createWhiteboardBaseline,
  whiteboardPublicationScope,
  WhiteboardModel,
  validateWhiteboardDocument,
  type DocumentMigration,
  type WhiteboardTransfer,
  type ContentNode,
} from "@tau/collaboration";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import type { CollaborationClient } from "../collaboration/client";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import { isVideoFile, type CollaborationAssetService } from "../collaboration/asset-service";
import { WhiteboardDocumentRepository } from "./repository";
import { stateHash } from "./journal";
import { WhiteboardMigration } from "./migration";

interface PublicationJob {
  operationId: string;
  workspaceId: string;
  documentId: string;
  sourceHash: string;
  serverUrl: string;
  bundle: WhiteboardTransfer;
  roomId?: string;
  mappings: Record<string, string>;
  state?: string;
  completed?: boolean;
  cancelled?: boolean;
}

/** 按精确契约声明替换元素载荷与板内正文中的资源引用；未登记的引用原样保留。 */
export function mapTransferResources(
  source: WhiteboardTransfer,
  mappings: Readonly<Record<string, string>>
): WhiteboardTransfer {
  const bundle = structuredClone(source);
  const body = (node: ContentNode): ContentNode => ({
    ...mapNodeResources(
      node,
      bundle.contracts[String(node.tauContract)]?.resources,
      ref => mappings[ref]
    ),
    ...(node.children ? { children: node.children.map(body) } : {}),
  });
  const visit = (
    node: WhiteboardTransfer["pages"][number]["elements"][number]
  ): WhiteboardTransfer["pages"][number]["elements"][number] => ({
    ...node,
    data: mapNodeResources(
      node.data,
      bundle.contracts[node.contractId].resources,
      ref => mappings[ref]
    ),
    ...(Array.isArray(node.body) ? { body: node.body.map(body) } : {}),
    children: node.children.map(visit),
  });
  bundle.pages = bundle.pages.map(page => ({ ...page, elements: page.elements.map(visit) }));
  bundle.resources = bundle.resources.map(ref => mappings[ref] ?? ref).sort();
  return bundle;
}

/** 仅宿主显式调用，所有网络重试使用已经耐久固定的候选和房间身份。 */
export class WhiteboardTransitions {
  private readonly queue = new DocumentWriteQueue(16 * 1024 * 1024);
  constructor(
    readonly migration: WhiteboardMigration,
    private readonly store: CollaborationLocalStore,
    private readonly client: CollaborationClient,
    private readonly assets: CollaborationAssetService
  ) {}
  blocked(name: string, documentId: string) {
    return (
      Boolean(this.migration.pending(name, documentId)) ||
      Boolean(
        this.store.db
          .prepare(
            "SELECT 1 FROM settings WHERE key LIKE 'whiteboard-migration-source:%' AND json_extract(value,'$.name')=? AND json_extract(value,'$.documentId')=? AND coalesce(json_extract(value,'$.done'),0)=0"
          )
          .get(name, documentId)
      ) ||
      this.store
        .get<PublicationJob[]>("whiteboard-publications", [])
        .some(job => job.workspaceId === name && job.documentId === documentId && !job.completed)
    );
  }
  /** 未完成的首次发布；界面据此续做或取消原操作，不另起新房间。 */
  pendingPublication(name: string, documentId: string) {
    const job = this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(
        value => value.workspaceId === name && value.documentId === documentId && !value.completed
      );
    return job ? { operationId: job.operationId, roomCreated: Boolean(job.roomId) } : null;
  }
  publicationDocument(name: string, operationId: string) {
    return this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(value => value.workspaceId === name && value.operationId === operationId)?.documentId;
  }
  private save(job: PublicationJob) {
    const jobs = this.store.get<PublicationJob[]>("whiteboard-publications", []);
    this.store.set("whiteboard-publications", [
      ...jobs.filter(value => value.operationId !== job.operationId),
      job,
    ]);
  }
  publish(
    db: Database.Database,
    name: string,
    documentId: string,
    request: { operationId: string; serverUrl: string; pageIds: string[] }
  ) {
    return this.queue.run(JSON.stringify([name, documentId]), 0, () =>
      this.publishOnce(db, name, documentId, request)
    );
  }
  private async publishOnce(
    db: Database.Database,
    name: string,
    documentId: string,
    request: { operationId: string; serverUrl: string; pageIds: string[] }
  ) {
    const repo = new WhiteboardDocumentRepository(db, name),
      source = repo.read(documentId);
    if (!source) throw new Error("白板不存在");
    const url = this.client.canonicalUrl(normalizeServerUrl(request.serverUrl));
    let job = this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(value => value.operationId === request.operationId);
    if (
      job &&
      (job.workspaceId !== name ||
        job.documentId !== documentId ||
        job.serverUrl !== url ||
        JSON.stringify(job.bundle.pages.map(page => page.id)) !== JSON.stringify(request.pageIds))
    )
      throw new Error("首次发布操作不能更换目标或范围");
    if (job?.cancelled) throw new Error("已取消的发布不能复活");
    if (job?.completed) return { documentId: job.roomId!, serverUrl: url };
    if (!job) {
      if (this.store.get(`whiteboard-binding:${name}:${documentId}`, null))
        throw new Error("此白板已绑定共享，不能再次创建并行房间");
      if (this.blocked(name, documentId)) throw new Error("原白板操作尚待恢复");
      const doc = new Y.Doc();
      Y.applyUpdate(doc, source.state);
      const model = new WhiteboardModel(doc);
      try {
        const bundle = whiteboardPublicationScope(model, documentId, request.pageIds);
        if (
          Object.values(bundle.contracts).some(contract =>
            ["host.whiteboard.recovery", "tau.recovery"].includes(contract.owner)
          )
        )
          throw new Error("旧不透明恢复元素须先确认资源与公开范围，不能直接发布");
        if (repo.read(documentId)?.hash !== source.hash) throw new Error("发布准备期间白板已变化");
        job = {
          operationId: request.operationId,
          workspaceId: name,
          documentId,
          sourceHash: source.hash,
          serverUrl: url,
          bundle,
          mappings: {},
        };
        this.save(job);
      } finally {
        model.dispose();
        doc.destroy();
      }
    }
    const record = this.migration.state.migration(job.operationId);
    if (!record?.decision && repo.read(documentId)?.hash !== job.sourceHash)
      throw new Error("原白板已变化，发布候选已保留");
    if (!job.roomId) {
      const room = await this.client.request<{ id: string; status: string }>(
        url,
        "/v1/documents",
        "POST",
        { idempotencyKey: job.operationId }
      );
      if (room.status === "closed") throw new Error("原发布已关闭，不能复活");
      job.roomId = room.id;
      this.save(job);
    }
    if (!job.state) {
      for (const reference of job.bundle.resources) {
        if (!reference.startsWith("tau-collab-") || job.mappings[reference]) continue;
        const file = await this.assets.readTransferFile("", documentId, reference);
        if (isVideoFile(file)) throw new Error("本机视频尚不支持共享发布，请调整发布范围");
        job.mappings[reference] = await this.assets.enqueue(job.roomId, file);
        this.save(job);
      }
      await this.assets.flush(url, job.roomId);
      const bundle = mapTransferResources(job.bundle, job.mappings);
      const candidate = await createWhiteboardBaseline(bundle, {
        documentId: job.roomId,
        baselineId: randomUUID(),
        epoch: 0,
      });
      try {
        job.state = Buffer.from(Y.encodeStateAsUpdate(candidate)).toString("base64");
        this.save(job);
      } finally {
        candidate.destroy();
      }
    }
    await this.migration.prepare(db, name, {
      operationId: job.operationId,
      documentId,
      candidate: Buffer.from(job.state, "base64"),
      target: { boardId: source.boardId, pages: [] },
      publication: { roomId: job.roomId, serverUrl: url },
      evidence: {
        publication: job.roomId,
        sourceHash: job.sourceHash,
        selectedPages: request.pageIds,
      },
    });
    await this.client.request(url, `/v1/documents/${job.roomId}/publish`, "POST", {
      state: job.state,
    });
    const status = await this.client.request<{
      state: string;
      receipt: { candidateHash: string; baselineId: string; version: number } | null;
    }>(url, `/v1/documents/${job.roomId}/publication`);
    if (
      status.state !== "COMMITTED" ||
      status.receipt?.candidateHash !== stateHash(Buffer.from(job.state, "base64"))
    )
      throw new Error("发布结果尚未确认，候选已保留");
    this.store.set(`whiteboard-publication-receipt:${job.operationId}`, status.receipt);
    await this.migration.install(db, name, job.operationId);
    this.store.set(`whiteboard-binding:${name}:${documentId}`, {
      serverUrl: url,
      documentId: job.roomId,
    });
    job.completed = true;
    this.save(job);
    return { documentId: job.roomId, serverUrl: url };
  }
  async resumePublication(db: Database.Database, name: string, operationId: string) {
    const job = this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(value => value.operationId === operationId);
    if (!job || job.workspaceId !== name) throw new Error("发布操作不存在");
    return this.publish(db, name, job.documentId, {
      operationId,
      serverUrl: job.serverUrl,
      pageIds: job.bundle.pages.map(page => page.id),
    });
  }
  async cancelPublication(name: string, operationId: string) {
    const job = this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(value => value.operationId === operationId);
    if (!job || job.workspaceId !== name) throw new Error("发布操作不存在");
    return this.queue.run(JSON.stringify([name, job.documentId]), 0, () =>
      this.cancelPublicationOnce(name, operationId)
    );
  }
  private async cancelPublicationOnce(name: string, operationId: string) {
    const job = this.store
      .get<PublicationJob[]>("whiteboard-publications", [])
      .find(value => value.operationId === operationId);
    if (!job || job.workspaceId !== name) throw new Error("发布操作不存在");
    if (job.cancelled) return;
    // 创建响应丢失也先按原操作找回房间，再由服务端原子取消。
    if (!job.roomId) {
      const room = await this.client.request<{ id: string }>(
        job.serverUrl,
        "/v1/documents",
        "POST",
        { idempotencyKey: operationId }
      );
      job.roomId = room.id;
      this.save(job);
    }
    const result = await this.client.request<{ state: string }>(
      job.serverUrl,
      `/v1/documents/${job.roomId}/publication/cancel`,
      "POST",
      {}
    );
    if (result.state !== "ABORTED") throw new Error("服务端已激活，请继续安装原发布结果");
    if (this.migration.state.migration(operationId))
      this.migration.state.decideLocal(operationId, "abort");
    job.cancelled = true;
    job.completed = true;
    this.save(job);
  }
  async finishMigration(
    db: Database.Database,
    name: string,
    operationId: string,
    url: string,
    cancel = false
  ) {
    if (
      this.store
        .get<PublicationJob[]>("whiteboard-publications", [])
        .some(job => job.operationId === operationId)
    )
      throw new Error("首次发布请从原发布入口重试或取消");
    const record = this.migration.state.migration(operationId);
    if (!record || record.plan.workspaceId !== name || record.plan.kind !== "whiteboard")
      throw new Error("白板迁移不存在");
    if (record.plan.remote) {
      const route = `/v1/documents/${record.plan.remoteDocumentId ?? record.plan.documentId}/migrations/${encodeURIComponent(operationId)}`;
      let result = await this.client.request<{ operation: DocumentMigration | null }>(url, route);
      if (!result.operation || result.operation.state === "PENDING") {
        if (cancel)
          result = await this.client.request(url, `${route}/cancel`, "POST", {
            expectedEpoch: record.plan.expectedEpoch,
          });
        else
          result = await this.client.request(url, `${route}/commit`, "POST", {
            ...record.plan.fingerprint,
            state: record.plan.prepared.candidate,
          });
      }
      this.migration.state.observeRemote(operationId, result.operation);
    } else if (cancel) return this.migration.cancel(db, name, operationId);
    const current = this.migration.state.migration(operationId)!;
    if (["ABORTED", "EXPIRED"].includes(current.phase)) return current;
    await this.migration.install(db, name, operationId);
    return this.migration.state.migration(operationId)!;
  }
  async remoteCandidate(
    serverUrl: string,
    roomId: string,
    operationId: string,
    expectedEpoch: number,
    expiresAt: number
  ) {
    const route = `/v1/documents/${roomId}/migrations/${encodeURIComponent(operationId)}`;
    await this.client.request(serverUrl, `${route}/prepare`, "POST", { expectedEpoch, expiresAt });
    const { operation } = await this.client.request<{ operation: DocumentMigration }>(
      serverUrl,
      `${route}/freeze`,
      "POST",
      {}
    );
    if (operation.state !== "PENDING") throw new Error("服务端迁移已结束");
    const value = await this.client.request<{ state: string }>(
      serverUrl,
      `/v1/documents/${roomId}/state`,
      "GET",
      undefined,
      3
    );
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Buffer.from(value.state, "base64"));
      await validateWhiteboardDocument(doc);
      if (stateHash(Y.encodeStateAsUpdate(doc)) !== operation.frozenRevision)
        throw new Error("服务端屏障修订不一致");
      return { operation, state: new Uint8Array(Buffer.from(value.state, "base64")) };
    } finally {
      doc.destroy();
    }
  }
}
