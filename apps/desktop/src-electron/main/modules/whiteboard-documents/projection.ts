import * as Y from "yjs";
import { collectWhiteboardRelations, type WhiteboardModel } from "@tau/collaboration";
import type { WhiteboardDocumentIdentity } from "@/types/whiteboard-document";

export function prepareProjection(
  identity: WhiteboardDocumentIdentity,
  model: WhiteboardModel,
  revision: number
) {
  const snapshot = model.read();
  const canvasNodes = (
    nodes: readonly import("@tau/collaboration").WhiteboardElementSnapshot[]
  ): unknown[] =>
    nodes.map(node => ({ ...node, ...node.geometry, children: canvasNodes(node.children) }));
  const visible = new Map(snapshot.pages.map((page, index) => [page.id, { page, index }]));
  const pages = Array.from(model.pages, ([pageId, record]) => {
    const selected = visible.get(pageId);
    const projection = {
      version: 3,
      documentKind: "whiteboard",
      documentId: identity.documentId,
      pageId,
      epoch: identity.epoch,
      revision,
      children: canvasNodes(selected?.page.children ?? []),
      recovery: canvasNodes(selected?.page.recovery ?? []),
      sketch: selected?.page.sketch,
      presentationSequences: snapshot.presentations ?? [],
    };
    return {
      pageId,
      title: String(record.get("title")),
      index: selected?.index ?? -1,
      data: JSON.stringify(projection),
    };
  });
  return {
    pages,
    title: snapshot.title,
    contracts: JSON.stringify(model.contracts.toJSON()),
    snapshot: JSON.stringify(snapshot),
    state: Y.encodeStateAsUpdate(model.doc),
    relations: collectWhiteboardRelations(model),
  };
}
export type PreparedProjection = ReturnType<typeof prepareProjection>;
