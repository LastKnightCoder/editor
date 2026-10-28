import * as Y from "yjs";
import {
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  NODE_DOCUMENT_VERSION,
  bytesToBase64,
  type ContentNode,
  type DocumentOperation,
  type DocumentOperationRequest,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { PluginConflictError } from "@tau/plugins";
import { collaborationManager } from "../features/collaboration/core/manager";
import { request } from "../features/collaboration/core/rest";

const hash = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");

export async function readPluginSharedContent(documentId: string) {
  await collaborationManager.openDocument(documentId);
  const session = collaborationManager.session(documentId);
  if (!session || session.info.status !== "active") throw new Error("协作会话已失效");
  const state = Y.encodeStateAsUpdate(session.doc);
  const nodes = readNodeDocument(session.doc).content;
  const contracts = session.doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary;
  const revision = await hash(state);
  if (collaborationManager.session(documentId) !== session) throw new Error("协作会话已变化");
  return { nodes, contracts, revision };
}

/** 条件提交由服务器裁决，拒绝时不把候选写入正在编辑的副本。 */
export async function writePluginSharedContent(
  documentId: string,
  content: ContentNode[],
  contracts: ContentContractDictionary,
  expectedRevision: string,
  guard: () => Promise<void>,
  plugin?: {
    token: string;
    database: string;
    pluginId: string;
    taskOperationId?: number;
    taskRestoreId?: number;
    timeZone?: string;
  },
  prepared?: (value: {
    operationId: string;
    revision: string;
    nodes: ContentNode[];
    request: DocumentOperationRequest;
  }) => Promise<void>
) {
  const session = collaborationManager.session(documentId);
  if (!session) throw new Error("协作会话尚未就绪");
  const live = () => {
    if (
      collaborationManager.session(documentId) !== session ||
      session.info.frozen ||
      session.info.leaving ||
      session.info.status !== "active" ||
      session.saveError
    )
      throw new Error("协作会话不可写");
  };
  live();
  await guard();
  const state = Y.encodeStateAsUpdate(session.doc);
  if ((await hash(state)) !== expectedRevision) throw new PluginConflictError();
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, state);
  const vector = Y.encodeStateVector(candidate);
  const tree = new NodeTree(candidate);
  const identity = {
    documentId,
    baselineId: String(candidate.getMap("meta").get("baselineId")),
    epoch: Number(candidate.getMap("meta").get("epoch")),
  };
  try {
    await tree.installContracts(contracts, null);
    applyNodeTreeContent(tree, content, {});
    await validateNodeDocument(candidate, identity, session.doc);
    const update = Y.encodeStateAsUpdate(candidate, vector);
    const updateHash = await hash(update);
    const protocol = await request<{ revision: string; sequence: number }>({
      serverUrl: session.info.serverUrl,
      path: `/v1/documents/${documentId}/protocol`,
    });
    live();
    await guard();
    if (
      protocol.revision !== expectedRevision ||
      (await hash(Y.encodeStateAsUpdate(session.doc))) !== expectedRevision
    )
      throw new PluginConflictError();
    live();
    await guard();
    const operationId = crypto.randomUUID();
    const operationRequest: DocumentOperationRequest = {
      operationId,
      version: NODE_DOCUMENT_VERSION,
      baselineId: identity.baselineId,
      epoch: identity.epoch,
      expectedRevision,
      expectedSequence: protocol.sequence,
      updateHash,
      expiresAt: Date.now() + 4 * 60_000,
    };
    await prepared?.({
      operationId,
      revision: await hash(Y.encodeStateAsUpdate(candidate)),
      nodes: readNodeDocument(candidate).content,
      request: operationRequest,
    });
    await guard();
    live();
    if ((await hash(Y.encodeStateAsUpdate(session.doc))) !== expectedRevision)
      throw new PluginConflictError();
    const path = `/v1/documents/${documentId}/operations/${operationId}`;
    let receipt: { operation: DocumentOperation | null };
    try {
      receipt = await request({
        serverUrl: session.info.serverUrl,
        path,
        method: "POST",
        body: {
          ...operationRequest,
          update: bytesToBase64(update),
        },
      });
    } catch (error) {
      receipt = await request({ serverUrl: session.info.serverUrl, path });
      if (!receipt.operation) throw error;
    }
    if (receipt.operation?.state !== "COMMITTED")
      throw new PluginConflictError("共享修改未提交，请重新读取");
    live();
    if (
      session.doc.getMap("meta").get("baselineId") !== identity.baselineId ||
      session.doc.getMap("meta").get("epoch") !== identity.epoch
    )
      throw new Error("共享修改已提交，但本机会话代次已变化，请重新打开");
    Y.applyUpdate(session.doc, update, "plugin-content");
    await collaborationManager.flushCache(documentId);
    await collaborationManager.project(documentId, plugin);
    return (await readPluginSharedContent(documentId)).revision;
  } finally {
    tree.dispose();
    candidate.destroy();
  }
}
