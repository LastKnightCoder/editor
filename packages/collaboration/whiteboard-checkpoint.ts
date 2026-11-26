import * as Y from "yjs";
import { createHash } from "node:crypto";
import type {
  DocumentProtocol,
  DocumentProtocolStore,
  DocumentOperationLedger,
  DocumentWriteQueue,
} from "./src/index";
import { isDeepStrictEqual } from "node:util";
import {
  WhiteboardModel,
  WHITEBOARD_DOCUMENT_VERSION,
  WHITEBOARD_LIMITS,
  type WhiteboardReference,
  type WhiteboardPlacement,
  validateWhiteboardDocument,
  type NodeDocumentIdentity,
} from "./src/index";

function cloneValue(value: unknown) {
  return value instanceof Y.AbstractType ? value.clone() : structuredClone(value);
}

function checkChannels(value: unknown) {
  if (
    (value instanceof Y.Map && value._start !== null) ||
    (value instanceof Y.Array && [...value._map.values()].some(item => !item.deleted))
  )
    throw new Error("白板存储含有未识别的混合字段");
}

// toJSON 会把带标记、嵌入和片段分界的富文本转成字符串。
function contents(value: unknown): unknown {
  checkChannels(value);
  if (value instanceof Y.Map)
    return ["map", new Map([...value].map(([key, entry]) => [key, contents(entry)]))];
  if (value instanceof Y.Array) return ["array", value.toArray().map(contents)];
  if (value instanceof Y.Text)
    return [
      value instanceof Y.XmlText ? "xml-text" : "text",
      value.getAttributes(),
      value.toDelta(),
    ];
  if (value instanceof Y.AbstractType) throw new Error("白板包含未支持的共享类型");
  return value;
}

function currentOrders(model: WhiteboardModel) {
  checkChannels(model.orders);
  checkChannels(model.pageOrder);
  const orders = new Map<string, WhiteboardReference[]>();
  for (const [key, order] of model.orders) {
    checkChannels(order);
    orders.set(
      key,
      order
        .toArray()
        .filter(
          ref =>
            (model.elements.get(ref.id)?.get("placement") as WhiteboardPlacement)?.token ===
            ref.token
        )
    );
  }
  const pages = model.pageOrder
    .toArray()
    .filter(ref => model.pages.get(ref.id)?.get("placement") === ref.token);
  return { orders, pages };
}

/** 从完整检查点重建，保留所有业务记录、恢复区、逻辑身份及未知插件字段。 */
export async function rebuildWhiteboardCheckpoint(
  state: Uint8Array,
  shared?: { source: NodeDocumentIdentity; target?: NodeDocumentIdentity }
): Promise<Uint8Array | null> {
  const source = new WhiteboardModel(new Y.Doc({ gc: false }));
  const fresh = new Y.Doc({ gc: false });
  const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    Y.applyUpdate(source.doc, state);
    if (shared) await validateWhiteboardDocument(source.doc, shared.source);
    else if (source.doc.share.has("meta")) return null;
    else await source.validate();
    const { orders, pages } = currentOrders(source);
    fresh.transact(() => {
      for (const [name, root] of source.doc.share) {
        if (name === "meta") {
          if (shared?.target) {
            const meta = fresh.getMap(name);
            for (const [key, value] of source.doc.getMap(name)) {
              meta.set(
                key,
                key === "epoch"
                  ? shared.target.epoch
                  : key === "baselineId"
                    ? shared.target.baselineId
                    : value
              );
            }
          }
        } else if (name === "whiteboard:orders") {
          const target = fresh.getMap(name);
          for (const [key, refs] of orders) target.set(key, Y.Array.from(refs));
        } else if (root instanceof Y.Map) {
          const target = fresh.getMap(name);
          for (const [key, value] of root) target.set(key, cloneValue(value));
        } else if (root instanceof Y.Array) {
          fresh
            .getArray(name)
            .push(name === "whiteboard:page-order" ? pages : root.toArray().map(cloneValue));
        } else if (root instanceof Y.Text) {
          const target =
            root instanceof Y.XmlText ? fresh.get(name, Y.XmlText) : fresh.getText(name);
          target.applyDelta(root.toDelta());
          for (const [key, value] of Object.entries(root.getAttributes()))
            target.setAttribute(key, value);
        } else throw new Error("白板包含无法完整重建的共享根");
      }
    });
    const bytes = Y.encodeStateAsUpdate(fresh);
    if ((!shared || shared.target) && bytes.length > state.length * 0.8) return null;
    Y.applyUpdate(reopened.doc, bytes);
    if (shared?.target) await validateWhiteboardDocument(reopened.doc, shared.target);
    else await reopened.validate();
    if (!isDeepStrictEqual(source.read(), reopened.read()))
      throw new Error("白板清理前后投影不一致");
    // 逐根核对，包括不在页面投影里的记录及可恢复文字。
    for (const [name, root] of source.doc.share) {
      if (name === "meta" && shared) continue;
      if (name === "whiteboard:orders") {
        const restored = new Map(
          [...reopened.orders].map(([key, order]) => [key, order.toArray()])
        );
        if (isDeepStrictEqual(orders, restored)) continue;
      } else if (name === "whiteboard:page-order") {
        if (isDeepStrictEqual(pages, reopened.pageOrder.toArray())) continue;
      } else if (isDeepStrictEqual(contents(root), contents(reopened.doc.share.get(name))))
        continue;
      throw new Error("白板清理前后记录不一致");
    }
    return bytes;
  } finally {
    source.doc.destroy();
    fresh.destroy();
    reopened.doc.destroy();
  }
}

export interface RoomCheckpoint {
  state: Uint8Array;
  baselineId: string;
  revision: string;
}

export async function prepareRoomCheckpoint(
  state: Uint8Array,
  source: NodeDocumentIdentity
): Promise<RoomCheckpoint | null> {
  const target = { ...source, epoch: source.epoch + 1, baselineId: crypto.randomUUID() };
  const bytes = await rebuildWhiteboardCheckpoint(state, { source, target });
  if (!bytes) return null;
  // 服务端重开使用 GC 编码；回执摘要必须来自同一表示。
  const canonical = new Y.Doc();
  try {
    Y.applyUpdate(canonical, bytes);
    const result = Y.encodeStateAsUpdate(canonical);
    return {
      state: result,
      baselineId: target.baselineId,
      revision: createHash("sha256").update(result).digest("hex"),
    };
  } finally {
    canonical.destroy();
  }
}

export async function reclaimIdleRoom(
  id: string,
  context: {
    bytes: number;
    limit: number;
    idle: () => boolean;
    protocols: DocumentProtocolStore;
    operations: DocumentOperationLedger;
    writes: DocumentWriteQueue;
    load: () => Y.Doc;
    prepare: typeof prepareRoomCheckpoint;
    install: (candidate: RoomCheckpoint) => void;
  }
): Promise<boolean> {
  const { idle, protocols, operations, writes } = context;
  const limit = Math.min(context.limit, WHITEBOARD_LIMITS.documentBytes);
  if (context.bytes < limit / 2 || !idle()) return false;
  const head = protocols.state(id);
  if (head.version !== WHITEBOARD_DOCUMENT_VERSION) return false;
  const sequence = operations.sequence(id);
  const doc = context.load();
  let state: Uint8Array;
  try {
    state = Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
  if (
    state.length < limit / 2 ||
    createHash("sha256").update(state).digest("hex") !== head.revision
  )
    return false;
  const candidate = await context.prepare(state, {
    documentId: id,
    epoch: head.epoch,
    baselineId: head.baselineId,
  });
  if (!candidate || candidate.state.length > limit || !idle()) return false;
  return writes.run(id, candidate.state.length, async () => {
    if (!idle()) return false;
    return protocols.reclaimWhiteboard(head, candidate.baselineId, candidate.revision, () => {
      if (operations.sequence(id) !== sequence) return false;
      context.install(candidate);
      operations.advance(id);
      return true;
    });
  });
}

/** 本机共享副本可丢弃已删除的物理载荷，但必须与服务端已确认的完整编码逐字节同摘要。 */
export async function compactConfirmedReplica(
  state: Uint8Array,
  head: DocumentProtocol
): Promise<Uint8Array | null> {
  const canonical = new Y.Doc(),
    source = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(canonical, state);
    const bytes = Y.encodeStateAsUpdate(canonical);
    if (
      head.version !== 3 ||
      bytes.length > state.length * 0.8 ||
      createHash("sha256").update(bytes).digest("hex") !== head.revision
    )
      return null;
    await validateWhiteboardDocument(canonical, {
      documentId: head.id,
      epoch: head.epoch,
      baselineId: head.baselineId,
    });
    Y.applyUpdate(source, state);
    if (!Y.equalSnapshots(Y.snapshot(source), Y.snapshot(canonical))) return null;
    return bytes;
  } finally {
    source.destroy();
    canonical.destroy();
  }
}

export interface OfflineCopyInput {
  kind: "offline";
  drafts?: Uint8Array[];
  state: Uint8Array;
  source: NodeDocumentIdentity;
  previous?: { state: Uint8Array; revision: string };
}

/** 本机可以落后于确认快照；仅当它还包含独有的结构或删除时才另存。 */
export async function prepareOfflineCopy(input: OfflineCopyInput): Promise<Uint8Array | null> {
  let state = input.state;
  if (input.drafts?.length) {
    const local = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(local, state);
      Y.applyUpdate(local, Y.mergeUpdates(input.drafts));
      if (local.store.pendingDs || local.store.pendingStructs) throw new Error("离线草稿缺少依赖");
      state = Y.encodeStateAsUpdate(local);
    } finally {
      local.destroy();
    }
  }
  if (input.previous) {
    const merged = new Y.Doc();
    try {
      Y.applyUpdate(merged, input.previous.state);
      Y.applyUpdate(merged, state);
      if (
        createHash("sha256").update(Y.encodeStateAsUpdate(merged)).digest("hex") ===
        input.previous.revision
      )
        return null;
    } finally {
      merged.destroy();
    }
  }
  const bytes = await rebuildWhiteboardCheckpoint(state, { source: input.source });
  if (!bytes) throw new Error("离线副本未能重建");
  const copy = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    Y.applyUpdate(copy.doc, bytes);
    copy.submit(
      [
        {
          type: "edit_title",
          edit: { offset: copy.title.length, remove: 0, text: "（离线副本）" },
        },
      ],
      null
    );
    return Y.encodeStateAsUpdate(copy.doc);
  } finally {
    copy.doc.destroy();
  }
}
