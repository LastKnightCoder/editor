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
