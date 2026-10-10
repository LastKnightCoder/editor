import type Database from "better-sqlite3";
import * as Y from "yjs";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import { getBody, readSharedContent } from "@tau/collaboration";
import type { Descendant } from "slate";
import type { DocumentTaskAttributes } from "@tau/shared/task-assistant";
import { getContentLength } from "@/utils/helper";
import { minimalTextEdit } from "@/entity/text-edits";
import ContentTable from "./tables/content";
import { assertContentIsLocal } from "./collaboration-guard";
import { contentSession, projectLocalContent } from "./collaboration/content-sessions";
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

/** 只同步有变化的节点和文字；其他节点的 CRDT 身份、选区与格式保持原位。 */
function patchTree(target: Y.XmlText, previous: TaskContentNode[], next: TaskContentNode[]) {
  const delta = target.toDelta() as Array<{
    insert: string | Y.XmlText;
    attributes?: Record<string, unknown>;
  }>;
  let offset = 0;
  const positions = delta.map(part => {
    const entry = { offset, part };
    offset += typeof part.insert === "string" ? part.insert.length : 1;
    return entry;
  });
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    canonical(previous[prefix]) === canonical(next[prefix])
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    canonical(previous.at(-1 - suffix)) === canonical(next.at(-1 - suffix))
  )
    suffix++;
  const oldMiddle = previous.slice(prefix, previous.length - suffix);
  const newMiddle = next.slice(prefix, next.length - suffix);
  if (!oldMiddle.length && !newMiddle.length) return;
  if (oldMiddle.length === newMiddle.length && positions.length === previous.length) {
    for (let index = oldMiddle.length - 1; index >= 0; index--) {
      const oldNode = oldMiddle[index],
        newNode = newMiddle[index];
      const { offset: at, part } = positions[prefix + index];
      if (
        typeof oldNode.text === "string" &&
        typeof newNode.text === "string" &&
        typeof part.insert === "string"
      ) {
        const edit = minimalTextEdit(oldNode.text, newNode.text);
        if (edit) {
          if (edit.remove) target.delete(at + edit.index, edit.remove);
          if (edit.insert) target.insert(at + edit.index, edit.insert, part.attributes);
        }
      } else if (
        part.insert instanceof Y.XmlText &&
        oldNode.type === newNode.type &&
        oldNode.taskId === newNode.taskId
      ) {
        const element = part.insert;
        for (const key of new Set([...Object.keys(oldNode), ...Object.keys(newNode)])) {
          if (key === "children") continue;
          if (!(key in newNode)) element.removeAttribute(key);
          else if (canonical(oldNode[key]) !== canonical(newNode[key]))
            element.setAttribute(key, newNode[key] as never);
        }
        patchTree(element, oldNode.children ?? [], newNode.children ?? []);
      } else {
        target.delete(at, typeof part.insert === "string" ? part.insert.length : 1);
        target.applyDelta([{ retain: at }, ...slateNodesToInsertDelta([newNode] as Descendant[])]);
      }
    }
    return;
  }
  const at = previous
    .slice(0, prefix)
    .reduce((sum, node) => sum + (typeof node.text === "string" ? node.text.length : 1), 0);
  const remove = oldMiddle.reduce(
    (sum, node) => sum + (typeof node.text === "string" ? node.text.length : 1),
    0
  );
  if (remove) target.delete(at, remove);
  if (newMiddle.length)
    target.applyDelta([{ retain: at }, ...slateNodesToInsertDelta(newMiddle as Descendant[])]);
}

export function readTaskContent(db: Database.Database, contentId: number, createdAt: number) {
  const content = ContentTable.getContentById(db, contentId);
  if (!content || content.createTime !== createdAt)
    return fail("NOT_FOUND", "原文已删除或身份已变化");
  return content.content as unknown as TaskContentNode[];
}

export function assertTaskContentWritable(db: Database.Database, contentId: number) {
  const session = contentSession(db, contentId);
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
  const receipt = session?.doc.getMap("task-operation-receipts");
  if (receipt?.has(operationId)) return;
  if (revision(readTaskContent(db, contentId, createdAt)) !== revision(previous))
    fail("VERSION_CONFLICT", "正文已变化，请重新读取");
  if (session) {
    if (!session.persistTaskChanges) fail("CONTENT_BUSY", "正文持久化能力未就绪");
    session.doc.transact(() => {
      patchTree(getBody(session.doc), previous, next);
      receipt!.set(operationId, { digest: revision(next), at: Date.now() });
    }, "task-assistant");
    session.persistTaskChanges!();
    // update 监听器同步追加会话存储；投影失败时正文回执仍能供恢复使用。
    const source = session.info.source;
    if (!source) fail("CONTENT_BUSY", "正文会话没有本地来源");
    const content = readSharedContent(session.doc, session.privateNodes).content;
    projectLocalContent(db, source!, content, getContentLength(content as Descendant[]));
    emitContentWritten(db, contentId, "update");
  } else {
    ContentTable.updateContent(db, contentId, { content: next as Descendant[] });
  }
}

export function hasTaskContentReceipt(
  db: Database.Database,
  contentId: number,
  operationId: string
) {
  const session = contentSession(db, contentId);
  const present = session?.doc.getMap("task-operation-receipts").has(operationId) ?? false;
  if (present) {
    if (!session?.persistTaskChanges) fail("CONTENT_BUSY", "正文持久化能力未就绪");
    session!.persistTaskChanges!();
    const source = session!.info.source;
    if (source) {
      const content = readSharedContent(session!.doc, session!.privateNodes).content;
      projectLocalContent(db, source, content, getContentLength(content as Descendant[]));
      emitContentWritten(db, contentId, "update");
    }
  }
  return present;
}
