import { mergeDeviceDocument, prepareDeviceDocument } from "./documents";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import * as Y from "yjs";
import { bytesToBase64, base64ToBytes } from "../encoding";
import {
  DEVICE_SYNC_PROTOCOL,
  type DeviceCommit,
  type DeviceOffer,
  type DeviceReply,
  type DeviceStorage,
  type DeviceView,
  type HistoryEntry,
  type PreparedDeviceDocument,
} from "./protocol";

const changed = (view: DeviceView) =>
  view.allChanges.length > 0 || view.documents.length > 0 || Boolean(view.forceSnapshot);
const id = () => crypto.randomUUID();
const hash = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
const basePlan = (view: DeviceView): DeviceCommit => ({
  expectedGeneration: view.generation,
  expectedSequence: view.sequence,
  expectedHead: view.state.head,
  state: { ...view.state },
});

/** 无读依赖信息的数据库事务只允许沿共同头重放，正文另行合并。 */
export class DeviceSyncEngine {
  private tail = Promise.resolve();
  private readonly knownVectors = new Map<number, { baselineId: string; vector: string }>();
  constructor(private readonly storage: DeviceStorage) {}
  head(node: string) {
    return this.serial(async () => {
      const view = await this.storage.read();
      return { state: view.state, sourceSequence: view.receipts[node]?.sequence ?? 0 };
    });
  }
  download(node: string, assertActive: () => void = () => {}) {
    return this.serial(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const view = await this.storage.read(true);
        if (view.state.node !== view.state.authority || !view.state.enabled)
          throw new Error("DEVICE_SYNC_NOT_AUTHORITY: 此设备不能提供资料库快照");
        assertActive();
        if (changed(view)) {
          const history: HistoryEntry = {
            id: id(),
            parent: view.state.head,
            changes: view.allChanges,
            documents: view.documents,
            snapshot: view.forceSnapshot,
          };
          const plan = basePlan(view);
          plan.assertActive = assertActive;
          plan.history = history;
          plan.state.head = plan.state.ackHead = history.id;
          plan.state.revision++;
          plan.state.ackSeq = view.sequence;
          plan.state.requiresSnapshot = false;
          plan.state.recovering = false;
          try {
            await this.storage.commit(plan);
          } catch (error) {
            if (!String(error).includes("DEVICE_SYNC_RETRY") || attempt === 3) throw error;
          }
          continue;
        }
        return {
          protocol: DEVICE_SYNC_PROTOCOL,
          kind: "snapshot",
          state: view.state,
          changes: [],
          documents: view.snapshot!.documents,
          snapshot: view.snapshot,
          sourceSequence: view.receipts[node]?.sequence ?? 0,
        } satisfies DeviceReply;
      }
      throw new Error("DEVICE_SYNC_RETRY: 资料库正在变化，稍后重新下载");
    });
  }
  replace(reply: DeviceReply) {
    return this.serial(async () => {
      if (reply.protocol !== DEVICE_SYNC_PROTOCOL || reply.kind !== "snapshot" || !reply.snapshot)
        throw new Error("DEVICE_SYNC_REPLACE: 下载快照不完整");
      const documents = await Promise.all(reply.snapshot.documents.map(prepareDeviceDocument));
      const base = this.storage.replacementBase
        ? await this.storage.replacementBase(reply.state, reply.sourceSequence ?? 0)
        : await this.storage.read();
      if (base.state.library !== reply.state.library || base.state.schema !== reply.state.schema)
        throw new Error("DEVICE_SYNC_IDENTITY: 不能覆盖不同来源或不同结构的资料库");
      await this.storage.commit({
        expectedHead: base.state.head,
        expectedSequence: base.sequence,
        expectedGeneration: base.generation,
        replaceLocal: true,
        generation: id(),
        snapshot: reply.snapshot,
        documents,
        state: {
          ...reply.state,
          node: base.state.node,
          ackHead: reply.state.head,
          ackSeq: base.sequence,
          enabled: true,
          requiresSnapshot: false,
          recovering: false,
        },
      });
      this.knownVectors.clear();
    });
  }

  private async serial<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async offer(snapshot = false): Promise<DeviceOffer> {
    const view = await this.storage.read(snapshot);
    if (!view.state.enabled) throw new Error("DEVICE_SYNC_DISABLED: 设备同步未开启");
    return {
      protocol: DEVICE_SYNC_PROTOCOL,
      generation: view.generation,
      state: view.state,
      sequence: view.sequence,
      changes: view.changes,
      forceSnapshot:
        view.forceSnapshot ||
        (view.allChanges.length > view.changes.length && !view.documents.length),
      documents: await Promise.all(
        view.documents.map(async document => {
          const known = this.knownVectors.get(document.contentId);
          return {
            ...document,
            fullHash: await hash(base64ToBytes(document.state)),
            ...(known?.baselineId === document.baselineId
              ? {
                  state: bytesToBase64(
                    Y.diffUpdate(base64ToBytes(document.state), base64ToBytes(known.vector))
                  ),
                }
              : {}),
          };
        })
      ),
      vectors: Object.fromEntries(
        view.documents.map(document => [
          document.contentId,
          {
            baselineId: document.baselineId,
            vector: bytesToBase64(Y.encodeStateVectorFromUpdate(base64ToBytes(document.state))),
          },
        ])
      ),
      ...(snapshot ? { snapshot: view.snapshot } : {}),
    };
  }
  async withVectors(offer: DeviceOffer, ids: number[]): Promise<DeviceOffer> {
    if (ids.length > 1000 || ids.some(id => !Number.isSafeInteger(id)))
      throw new Error("DEVICE_SYNC_VECTORS: 正文列表无效");
    const documents = new Map(
      (await this.storage.loadDocuments(ids)).map(document => [document.contentId, document])
    );
    return {
      ...offer,
      vectors: {
        ...offer.vectors,
        ...Object.fromEntries(
          ids.map(id => {
            const document = documents.get(id);
            return [
              id,
              document
                ? {
                    baselineId: document.baselineId,
                    vector: bytesToBase64(
                      Y.encodeStateVectorFromUpdate(base64ToBytes(document.state))
                    ),
                  }
                : { baselineId: "", vector: "" },
            ];
          })
        ),
      },
    };
  }

  accept(offer: DeviceOffer, assertActive: () => void = () => {}): Promise<DeviceReply> {
    return this.serial(async () => {
      assertActive();
      if (offer.protocol !== DEVICE_SYNC_PROTOCOL)
        throw new Error("DEVICE_SYNC_VERSION: 同步协议不兼容");
      if (
        !Number.isSafeInteger(offer.sequence) ||
        offer.sequence < 0 ||
        !Number.isSafeInteger(offer.state.revision) ||
        offer.state.revision < 0 ||
        !Array.isArray(offer.changes) ||
        !Array.isArray(offer.documents) ||
        offer.changes.length > 100_000 ||
        offer.documents.length > 1000
      )
        throw new Error("DEVICE_SYNC_OFFER: 同步批次格式或容量无效");
      const fingerprint = await hash(
        new TextEncoder().encode(
          canonicalContractJson({
            node: offer.state.node,
            recovery: offer.state.recovering ? offer.state.head : undefined,
            sequence: offer.sequence,
            changes: offer.changes,
            documents: offer.documents.map(({ state, fullHash, ...document }) => ({
              ...document,
              state: fullHash ?? state,
            })),
          })
        )
      );
      let preserveMetadata = false;
      let savedNotes: NonNullable<DeviceCommit["noteCopies"]> = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        let view = await this.storage.read();
        if (view.state.node !== view.state.authority || !view.state.enabled)
          throw new Error("DEVICE_SYNC_NOT_AUTHORITY: 此设备不是当前排序节点");
        if (offer.state.library !== view.state.library || offer.state.schema !== view.state.schema)
          throw new Error("DEVICE_SYNC_SCHEMA: 资料库身份或数据结构不同");
        if (offer.state.epoch !== view.state.epoch)
          throw new Error("DEVICE_SYNC_EPOCH: 资料库基线已更换，原副本已保留");
        if (
          offer.state.ackHead &&
          (offer.state.revision > view.state.revision ||
            (offer.state.revision === view.state.revision &&
              offer.state.ackHead !== view.state.head))
        )
          throw new Error(
            "DEVICE_SYNC_AUTHORITY_BEHIND: 排序库已回退或分叉，本机资料仍完整保留，请检查电脑上的整库备份"
          );
        try {
          if (changed(view)) {
            const history: HistoryEntry = {
              id: id(),
              parent: view.state.head,
              changes: view.allChanges,
              documents: view.documents,
              snapshot: view.forceSnapshot,
            };
            const plan = basePlan(view);
            plan.history = history;
            plan.assertActive = assertActive;
            plan.state.head = plan.state.ackHead = history.id;
            plan.state.revision = view.state.revision + 1;
            plan.state.ackSeq = view.sequence;
            plan.state.requiresSnapshot = false;
            plan.state.recovering = false;
            await this.storage.commit(plan);
            view = await this.storage.read();
          }
          const receipt = view.receipts[offer.state.node];
          const already =
            receipt?.sequence === offer.sequence && receipt.fingerprint === fingerprint;
          const metadataFork =
            !already &&
            (offer.changes.length > 0 || offer.state.recovering) &&
            (offer.state.recovering || preserveMetadata || offer.state.ackHead !== view.state.head);
          let branchId = already ? receipt.outcome?.branchId : undefined;
          if (already) savedNotes = receipt.outcome?.noteCopies ?? [];
          if (!already && metadataFork && !offer.snapshot)
            return {
              protocol: DEVICE_SYNC_PROTOCOL,
              kind: "need-snapshot",
              state: view.state,
              changes: [],
              documents: [],
            };
          if (!already && (offer.changes.length || offer.documents.length || metadataFork)) {
            const local = new Map(
              (
                await this.storage.loadDocuments(
                  offer.documents.map(document => document.contentId)
                )
              ).map(document => [document.contentId, document])
            );
            const documents: PreparedDeviceDocument[] = [];
            const noteCopies: NonNullable<DeviceCommit["noteCopies"]> = [];
            for (const incoming of offer.documents) {
              if (documents.length && documents.length % 8 === 0) {
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                assertActive();
              }
              const original = local.get(incoming.contentId);
              const fullIncoming =
                offer.snapshot?.documents.find(
                  document => document.contentId === incoming.contentId
                ) ?? incoming;

              if (
                !original &&
                (metadataFork ||
                  !offer.changes.some(
                    change =>
                      change.table === "contents" &&
                      Number(
                        typeof change.key[0] === "object" &&
                          change.key[0] &&
                          "$integer" in change.key[0]
                          ? change.key[0].$integer
                          : change.key[0]
                      ) === incoming.contentId &&
                      change.before === null
                  ))
              ) {
                await prepareDeviceDocument(fullIncoming);
                noteCopies.push({ document: fullIncoming, reason: "正文已删除或归属已变化" });
                continue;
              }
              if (
                original &&
                (original.baselineId !== incoming.baselineId ||
                  original.documentId !== incoming.documentId ||
                  original.epoch !== incoming.epoch)
              ) {
                await prepareDeviceDocument(fullIncoming);
                noteCopies.push({ document: fullIncoming, reason: "正文合并基线已变化" });
                continue;
              }
              let prepared: PreparedDeviceDocument;
              try {
                prepared = original
                  ? await mergeDeviceDocument(original, incoming)
                  : await prepareDeviceDocument(incoming);
              } catch {
                if (!offer.snapshot)
                  throw new Error("DEVICE_SYNC_DOCUMENT_FULL_REQUIRED: 合并前需要完整笔记副本");
                await prepareDeviceDocument(fullIncoming);
                noteCopies.push({
                  document: fullIncoming,
                  reason: "正文合并校验未通过，完整笔记已保留",
                });
                continue;
              }
              documents.push(prepared);
              if (original?.deleted)
                noteCopies.push({
                  document: (({ projection: _, ...document }) => document)(prepared),
                  reason: "正文已删除，离线输入已保留为笔记副本",
                });
              local.set(incoming.contentId, prepared);
            }
            if (noteCopies.length && !offer.snapshot)
              return {
                protocol: DEVICE_SYNC_PROTOCOL,
                kind: "need-snapshot",
                state: view.state,
                changes: [],
                documents: [],
              };
            const history: HistoryEntry = {
              id: id(),
              parent: view.state.head,
              changes: metadataFork ? [] : [...offer.changes],
              documents: documents.map(({ projection: _, ...document }) => document),
            };
            const plan = basePlan(view);
            plan.assertActive = assertActive;
            plan.changes = history.changes;
            plan.documents = documents;
            plan.noteCopies = noteCopies;
            plan.history = history;
            plan.state.head = plan.state.ackHead = history.id;
            plan.state.revision = view.state.revision + 1;
            plan.state.ackSeq = view.sequence;
            if (metadataFork || noteCopies.length) {
              branchId = `${offer.state.node}-${offer.sequence}-${fingerprint}`;
              plan.branch = {
                id: branchId,
                snapshot: offer.snapshot!,
                reason: metadataFork ? "元数据事务已分叉" : "正文及关联数据已完整保全",
              };
            }
            plan.receipt = {
              node: offer.state.node,
              sequence: offer.sequence,
              fingerprint,
              outcome: { branchId, noteCopies },
            };
            await this.storage.commit(plan);
            savedNotes = noteCopies;
            view = await this.storage.read();
          }
          const chain: HistoryEntry[] = [];
          let cursor = offer.state.ackHead;
          for (const history of view.history) {
            if (history.parent !== cursor) continue;
            chain.push(history);
            cursor = history.id;
          }
          if (
            cursor !== view.state.head ||
            branchId ||
            savedNotes.length ||
            offer.forceSnapshot ||
            chain.some(entry => entry.snapshot)
          ) {
            const full = await this.storage.read(true);
            return {
              protocol: DEVICE_SYNC_PROTOCOL,
              kind: "snapshot",
              state: full.state,
              changes: [],
              documents: full.snapshot!.documents,
              snapshot: full.snapshot,
              preserved: Boolean(branchId),
              branchId,
              noteCopies: savedNotes,
            };
          }
          const documents = [
            ...new Map(
              chain
                .flatMap(entry => entry.documents)
                .map(document => [document.contentId, document])
            ).values(),
          ];
          const missing = documents
            .filter(document => !Object.hasOwn(offer.vectors ?? {}, String(document.contentId)))
            .map(document => document.contentId);
          if (missing.length)
            return {
              protocol: DEVICE_SYNC_PROTOCOL,
              kind: "need-vectors",
              state: view.state,
              changes: [],
              documents: [],
              documentIds: missing,
            };
          return {
            protocol: DEVICE_SYNC_PROTOCOL,
            kind: "delta",
            state: view.state,
            changes: chain.flatMap(entry => entry.changes),
            documents: documents.map(document => {
              const vector = offer.vectors?.[document.contentId];
              return vector?.baselineId === document.baselineId && vector.vector
                ? {
                    ...document,
                    state: bytesToBase64(
                      Y.diffUpdate(base64ToBytes(document.state), base64ToBytes(vector.vector))
                    ),
                  }
                : document;
            }),
          };
        } catch (error) {
          if (
            !offer.snapshot &&
            error instanceof Error &&
            (error.message.includes("DEVICE_SYNC_DOCUMENT_DEPENDENCY") ||
              error.message.includes("DEVICE_SYNC_DOCUMENT_FULL_REQUIRED"))
          )
            return {
              protocol: DEVICE_SYNC_PROTOCOL,
              kind: "need-snapshot",
              state: view.state,
              changes: [],
              documents: [],
            };
          if (
            error instanceof Error &&
            error.message.includes("DEVICE_SYNC_PREIMAGE") &&
            offer.changes.length
          ) {
            if (!offer.snapshot)
              return {
                protocol: DEVICE_SYNC_PROTOCOL,
                kind: "need-snapshot",
                state: view.state,
                changes: [],
                documents: [],
              };
            preserveMetadata = true;
            continue;
          }
          if (
            !(error instanceof Error) ||
            !error.message.includes("DEVICE_SYNC_RETRY") ||
            attempt === 3
          )
            throw error;
        }
      }
      throw new Error("DEVICE_SYNC_RETRY: 本机持续变化，稍后重试");
    });
  }

  install(offer: DeviceOffer, reply: DeviceReply): Promise<void> {
    return this.serial(async () => {
      if (reply.protocol !== DEVICE_SYNC_PROTOCOL || !["delta", "snapshot"].includes(reply.kind))
        throw new Error("DEVICE_SYNC_REPLY: 同步响应无效");
      const view = await this.storage.read(Boolean(reply.preserved));
      if ((offer.generation ?? "") !== (view.generation ?? ""))
        throw new Error("DEVICE_SYNC_REPLACED: 本机资料库已重新下载");
      if (view.sequence !== offer.sequence || view.state.head !== offer.state.head)
        throw new Error("DEVICE_SYNC_RETRY: 同步期间新增了本机修改");
      if (
        reply.state.library !== view.state.library ||
        reply.state.schema !== view.state.schema ||
        reply.state.epoch !== view.state.epoch
      )
        throw new Error("DEVICE_SYNC_IDENTITY: 同步响应身份不一致");
      if (
        reply.kind === "delta" &&
        reply.state.head === view.state.head &&
        !view.allChanges.length &&
        !view.documents.length &&
        !reply.changes.length &&
        !reply.documents.length
      )
        return;
      if (view.forceSnapshot && !reply.snapshot)
        throw new Error("DEVICE_SYNC_REPLY: 本机增量已压缩，必须安装完整检查点");
      const plan = basePlan(view);
      plan.state.requiresSnapshot = false;
      plan.state.recovering = false;
      plan.state.head = plan.state.ackHead = reply.state.head;
      plan.state.revision = reply.state.revision;
      plan.state.ackSeq = view.sequence;
      plan.snapshot = reply.snapshot;
      plan.rollback = reply.snapshot
        ? undefined
        : [...view.allChanges]
            .reverse()
            .map(change => ({ ...change, before: change.after, after: change.before }));
      plan.changes = reply.changes;
      const local = new Map(
        (await this.storage.loadDocuments(reply.documents.map(document => document.contentId))).map(
          document => [document.contentId, document]
        )
      );
      const canonical = new Map<number, PreparedDeviceDocument>();
      plan.pendingDocuments = [];
      plan.documents = await Promise.all(
        reply.documents.map(async document => {
          const original = local.get(document.contentId);
          const prepared = reply.snapshot ? await prepareDeviceDocument(document) : undefined;
          const merged =
            original?.baselineId === document.baselineId &&
            !reply.noteCopies?.some(copy => copy.document.contentId === document.contentId)
              ? await mergeDeviceDocument(original, document, true)
              : (prepared ?? (await prepareDeviceDocument(document)));
          canonical.set(document.contentId, prepared ?? merged);
          if (prepared && prepared.state !== merged.state)
            plan.pendingDocuments!.push(document.contentId);
          return merged;
        })
      );
      plan.noteCopies = reply.noteCopies;
      if (reply.preserved)
        plan.branch = {
          id: reply.branchId ?? `${view.state.node}-${view.sequence}`,
          snapshot: view.snapshot!,
          reason: "元数据事务已分叉",
        };
      await this.storage.commit(plan);
      for (const document of canonical.values())
        this.knownVectors.set(document.contentId, {
          baselineId: document.baselineId,
          vector: bytesToBase64(Y.encodeStateVectorFromUpdate(base64ToBytes(document.state))),
        });
      while (this.knownVectors.size > 256)
        this.knownVectors.delete(this.knownVectors.keys().next().value!);
    });
  }
}

export async function synchronizeDevice(
  engine: DeviceSyncEngine,
  exchange: (offer: DeviceOffer) => Promise<DeviceReply>
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let offer = await engine.offer();
    let reply = await exchange(offer);
    if (reply.kind === "need-snapshot") {
      offer = await engine.offer(true);
      reply = await exchange(offer);
    }
    if (reply.kind === "need-vectors") {
      offer = await engine.withVectors(offer, reply.documentIds ?? []);
      reply = await exchange(offer);
    }
    try {
      await engine.install(offer, reply);
      return reply;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("DEVICE_SYNC_RETRY") ||
        attempt === 3
      )
        throw error;
    }
  }
  throw new Error("DEVICE_SYNC_RETRY: 暂无法取得稳定同步点");
}
