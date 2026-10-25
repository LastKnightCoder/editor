import * as Y from "yjs";
import { WhiteboardModel } from "./whiteboard-model";
import { createWhiteboardDocument } from "./whiteboard-document";
import { exportWhiteboardTransfer, prepareWhiteboardTransfer } from "./whiteboard-transfer";
import type { NodeDocumentIdentity } from "./node-document";
import type { WhiteboardTransfer } from "./whiteboard-types";

/** 只从确认投影建立新共享根；逻辑身份保留，旧删除历史不进入候选。 */
export async function createWhiteboardBaseline(
  bundle: WhiteboardTransfer,
  identity?: NodeDocumentIdentity
): Promise<Y.Doc> {
  const doc = new Y.Doc({ gc: false }),
    model = new WhiteboardModel(doc);
  try {
    const plan = await prepareWhiteboardTransfer(model, bundle, {
      targetDocumentId: identity?.documentId ?? bundle.sourceDocumentId,
      baseline: true,
    });
    model.submitChunks(plan.commands, null, plan.prepared, plan.initialBodies);
    await model.validate();
    if (!identity) return doc;
    return await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(doc));
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    model.dispose();
    if (identity) doc.destroy();
  }
}

export function whiteboardPublicationScope(
  model: WhiteboardModel,
  documentId: string,
  pageIds: readonly string[]
): WhiteboardTransfer {
  const available = new Set(model.read().pages.map(page => page.id));
  if (
    !pageIds.length ||
    new Set(pageIds).size !== pageIds.length ||
    pageIds.some(id => !available.has(id))
  )
    throw new Error("发布范围包含不存在或重复的页面");
  return exportWhiteboardTransfer(model, documentId, undefined, {
    pageIds,
    includeRecovery: false,
  });
}

export function assertWhiteboardVersionUpgrade(
  before: WhiteboardTransfer,
  after: WhiteboardTransfer
): void {
  const shell = (bundle: WhiteboardTransfer) => ({
    title: bundle.title,
    presentations: bundle.presentations,
    pages: bundle.pages.map(page => ({ ...page, elements: page.elements.map(strip) })),
  });
  const strip = (node: WhiteboardTransfer["pages"][number]["elements"][number]): unknown => {
    const { data: _data, contractId: _contract, children, ...rest } = node;
    return { ...rest, children: children.map(strip) };
  };
  if (JSON.stringify(shell(before)) !== JSON.stringify(shell(after)))
    throw new Error("插件转换不能改变页面、节点身份、结构、几何、正文或引用");
  const flat = (bundle: WhiteboardTransfer) => {
    const result = new Map<string, WhiteboardTransfer["pages"][number]["elements"][number]>();
    const visit = (nodes: WhiteboardTransfer["pages"][number]["elements"]) =>
      nodes.forEach(node => {
        result.set(node.id, node);
        visit(node.children);
      });
    bundle.pages.forEach(page => visit(page.elements));
    return result;
  };
  const prior = flat(before);
  for (const [id, node] of flat(after)) {
    const old = prior.get(id)!;
    const source = before.contracts[old.contractId],
      target = after.contracts[node.contractId];
    if (
      !source ||
      !target ||
      source.domain !== "whiteboard-element" ||
      target.domain !== "whiteboard-element" ||
      source.owner !== target.owner ||
      source.type !== target.type ||
      JSON.stringify(source.structure) !== JSON.stringify(target.structure) ||
      target.dataVersion < source.dataVersion
    )
      throw new Error("转换契约归属或结构不匹配");
    if (
      old.contractId === node.contractId &&
      JSON.stringify(old.data) !== JSON.stringify(node.data)
    )
      throw new Error("未换版本的载荷不能夹带迁移写入");
  }
}
