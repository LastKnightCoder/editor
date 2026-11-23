import * as Y from "yjs";
import { collectWhiteboardRelations, WhiteboardModel } from "@tau/collaboration";
import type { WhiteboardDocumentIdentity } from "@/types/whiteboard-document";
import { prepareProjection } from "./projection";

export interface AppendInput {
  identity: WhiteboardDocumentIdentity;
  revision: number;
  state: Uint8Array;
  update: Uint8Array;
}

export async function prepareAppend(input: AppendInput) {
  const doc = new Y.Doc({ gc: false }),
    model = new WhiteboardModel(doc);
  try {
    Y.applyUpdate(doc, input.state);
    if ((await model.receive(input.update)).status !== "applied")
      throw new Error("MISSING_DEPENDENCIES: 请保留更新并补齐白板基线");
    return {
      projection: prepareProjection(input.identity, model, input.revision),
      retained: collectWhiteboardRelations(model, true).map(ref => ref.target),
    };
  } finally {
    model.dispose();
    doc.destroy();
  }
}
export type PreparedAppend = Awaited<ReturnType<typeof prepareAppend>>;
