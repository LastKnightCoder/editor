import { createHash, randomUUID } from "node:crypto";
// 走 core 子入口，避免编辑器根入口把 presets/扩展组件/渲染库拖进主进程 bundle
import { createEditorKit } from "@tau/editor/core";
import { checkList, checkListItem } from "@tau/editor/extensions/list";
import { applyNodeTreeContent } from "@tau/editor-collab";
import { NodeTree, NODE_DOCUMENT_VERSION, NODE_DOCUMENT_MAX_BYTES } from "@tau/collaboration";
import {
  normalizeContentContract,
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import { ContentDocumentTable } from "./tables/content-document";
import { projectContractContent, readLocalSessionContent } from "./collaboration/content-sessions";
import type { RuntimeSession } from "./collaboration/types";
import type Database from "better-sqlite3";
import * as Y from "yjs";
import type { Descendant } from "slate";
import type { DocumentTaskAttributes } from "@tau/shared/task-assistant";
import { getContentLength } from "@/utils/helper";
import ContentTable from "./tables/content";
import { assertContentIsLocal } from "./collaboration-guard";
import { contentSession } from "./collaboration/content-sessions";
import { emitContentWritten } from "./content-events";
import { canonical, fail, revision } from "./task-assistant/common";

export interface TaskContentNode extends DocumentTaskAttributes {
  type?: string;
  text?: string;
  taskId?: string;
  checked?: boolean;
  children?: TaskContentNode[];
  [key: string]: unknown;
}

export function taskNode(nodes: TaskContentNode[], taskId: string): TaskContentNode | undefined {
  for (const node of nodes) {
    if (node.type === "check-list-item" && node.taskId === taskId) return node;
    const child = taskNode(node.children ?? [], taskId);
    if (child) return child;
  }
  return undefined;
}

export function readTaskContent(db: Database.Database, contentId: number, createdAt: number) {
  const content = ContentTable.getContentById(db, contentId);
  if (!content || content.createTime !== createdAt)
    return fail("NOT_FOUND", "原文已删除或身份已变化");
  return content.content as unknown as TaskContentNode[];
}

export function assertTaskContentWritable(db: Database.Database, contentId: number) {
  const session = contentSession(db, contentId);
  if (session && session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    fail("READ_ONLY", "正文格式不受支持");
  if (session && session.info.mode !== "local") fail("READ_ONLY", "共享正文请通过协作编辑器修改");
  if (
    session?.info.frozen ||
    session?.info.leaving ||
    (session && session.info.status !== "active")
  )
    fail("CONTENT_BUSY", "正文会话正在切换，请稍后重试");
  // 助理不扩大正文编辑器之外的共享写入权限。
  assertContentIsLocal(db, contentId);
}

const taskElements = createEditorKit({ extensions: [checkList, checkListItem] }).extensions.flatMap(
  extension => (extension.elements ?? []).map(element => ({ owner: extension.id, element }))
);

export function prepareTaskNodes(
  nodes: TaskContentNode[],
  existing: ContentContractDictionary = {}
) {
  const contracts = { ...existing };
  const visit = (node: TaskContentNode): TaskContentNode => {
    if (!node.children) return structuredClone(node);
    let id = typeof node.tauContract === "string" ? node.tauContract : undefined;
    if (!id) {
      const definition = taskElements.find(item => item.element.type === node.type);
      if (!definition) fail("INVALID_CONTENT", "任务转换不能猜测未知节点的版本");
      const { type, dataVersion, kind, isVoid, collaboration, resources } = definition!.element;
      const contract = normalizeContentContract(definition!.owner, {
        type,
        dataVersion: dataVersion!,
        kind,
        ...(isVoid === undefined ? {} : { isVoid }),
        ...(collaboration ? { collaboration } : {}),
        ...(resources ? { resources } : {}),
      });
      id = createHash("sha256").update(canonicalContractJson(contract)).digest("hex");
      contracts[id] = contract;
    }
    return {
      ...structuredClone(node),
      tauContract: id,
      collabId: node.collabId ?? randomUUID(),
      children: node.children.map(visit),
    };
  };
  const content = nodes.map(visit);
  return { content, contracts: validateContentContractsSync(contracts) };
}

function projectTaskSession(
  db: Database.Database,
  contentId: number,
  session: RuntimeSession,
  expectedRevision: string | undefined
) {
  const source = session.info.source;
  if (!source) fail("CONTENT_BUSY", "正文会话没有本地来源");
  const stored = ContentDocumentTable.read(db, contentId);
  if (!stored) fail("CONTENT_BUSY", "正文格式尚未转换");
  const content = readLocalSessionContent(session).content;
  projectContractContent(
    db,
    source!,
    session,
    {
      documentId: stored!.documentId,
      contracts: session.doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
      content,
    },
    expectedRevision,
    getContentLength(content as Descendant[])
  );
  source!.projectionRevision = ContentDocumentTable.read(db, contentId)!.revision;
  session.store!.metadata(session.info);
  emitContentWritten(db, contentId, "update");
}

export function applyTaskContentPatch(
  db: Database.Database,
  contentId: number,
  createdAt: number,
  previous: TaskContentNode[],
  next: TaskContentNode[],
  operationId: string
) {
  assertTaskContentWritable(db, contentId);
  const session = contentSession(db, contentId);
  if (session?.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
    if (!session.store) fail("CONTENT_BUSY", "正文持久化能力未就绪");
    const receiptKey = `task-receipt:${session.info.id}:${operationId}`;
    const receipt = session.store!.get<{ expectedRevision?: string } | null>(receiptKey, null);
    if (receipt) {
      projectTaskSession(db, contentId, session, receipt.expectedRevision);
      return;
    }
    if (revision(readTaskContent(db, contentId, createdAt)) !== revision(previous))
      fail("VERSION_CONFLICT", "正文已变化，请重新读取");
    const candidate = new Y.Doc({ gc: false });
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
    const vector = Y.encodeStateVector(candidate),
      tree = new NodeTree(candidate);
    try {
      const document = prepareTaskNodes(next, tree.contracts.toJSON() as ContentContractDictionary);
      for (const [id, contract] of Object.entries(document.contracts))
        if (!tree.contracts.has(id)) tree.contracts.set(id, contract);
      const originals = new Map<string, TaskContentNode>();
      const collect = (nodes: TaskContentNode[]) =>
        nodes.forEach(node => {
          if (typeof node.collabId === "string") originals.set(node.collabId, node);
          if (node.children) collect(node.children);
        });
      collect(previous);
      const preserveResources = (node: TaskContentNode): TaskContentNode => {
        const id = typeof node.collabId === "string" ? node.collabId : "";
        const before = originals.get(id),
          raw = tree.nodes.has(id) ? tree.nodeSnapshot(id) : undefined;
        if (before && raw)
          for (const key of Object.keys(node))
            if (key !== "children" && canonical(node[key]) === canonical(before[key]) && key in raw)
              node[key] = structuredClone(raw[key]);
        if (node.children) node.children = node.children.map(preserveResources);
        return node;
      };
      applyNodeTreeContent(tree, document.content.map(preserveResources), {});
      if (Y.encodeStateAsUpdate(candidate).byteLength > NODE_DOCUMENT_MAX_BYTES)
        fail("CAPACITY", "正文超过容量限制");
      const update = Y.encodeStateAsUpdate(candidate, vector),
        expectedRevision = session.info.source?.projectionRevision;
      session.store!.db.transaction(() => {
        session.retainNodeState?.(candidate);
        session.store!.append(session.info.id, update);
        session.store!.set(receiptKey, { expectedRevision, digest: revision(next) });
      })();
      Y.applyUpdate(session.doc, update, "renderer-persisted");
      projectTaskSession(db, contentId, session, expectedRevision);
      return;
    } finally {
      tree.dispose();
      candidate.destroy();
    }
  }
  if (revision(readTaskContent(db, contentId, createdAt)) !== revision(previous))
    fail("VERSION_CONFLICT", "正文已变化，请重新读取");
  const stored = ContentDocumentTable.read(db, contentId);
  const prepared = stored ? prepareTaskNodes(next, stored.contracts) : { content: next };
  ContentTable.updateContent(db, contentId, {
    ...prepared,
    content: prepared.content as Descendant[],
    expectedRevision: stored?.revision,
  });
}

export function hasTaskContentReceipt(
  db: Database.Database,
  contentId: number,
  operationId: string
) {
  const session = contentSession(db, contentId);
  if (session?.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
    const receipt = session.store?.get<{ expectedRevision?: string } | null>(
      `task-receipt:${session.info.id}:${operationId}`,
      null
    );
    if (receipt) projectTaskSession(db, contentId, session, receipt.expectedRevision);
    return !!receipt;
  }
  return false;
}
