import * as Y from "yjs";
import {
  readDocumentIdentity,
  WhiteboardModel,
  type DocumentSyncState,
  type DocumentProtocol,
  type NodeDocumentIdentity,
} from "@tau/collaboration";
import {
  prepareOfflineCopy,
  type OfflineCopyInput,
} from "@tau/collaboration/whiteboard-checkpoint";
import { runCheckpointWorker } from "./checkpoint-worker";

export function readPredecessor(state: Uint8Array, head: DocumentProtocol): NodeDocumentIdentity {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const source = readDocumentIdentity(doc);
    if (
      source.version !== 3 ||
      head.version !== 3 ||
      source.documentId !== head.id ||
      source.epoch >= head.epoch ||
      source.baselineId === head.baselineId
    )
      throw new Error("只允许重新连接同一房间的后续代次");
    return { documentId: source.documentId, baselineId: source.baselineId, epoch: source.epoch };
  } finally {
    doc.destroy();
  }
}

export async function recoverOfflineBoard(
  state: Uint8Array,
  snapshot: DocumentSyncState,
  source: NodeDocumentIdentity,
  drafts?: Uint8Array[]
) {
  const old = snapshot.rejected.findLast(
    branch =>
      branch.baseline.protocol.id === source.documentId &&
      branch.baseline.protocol.epoch === source.epoch &&
      branch.baseline.protocol.baselineId === source.baselineId
  )?.baseline;
  const input: OfflineCopyInput = {
    kind: "offline",
    drafts,
    source,
    state,
    previous: old && { state: old.state, revision: old.protocol.revision },
  };
  try {
    return { copy: await materializeCopy(input), keepOriginal: false };
  } catch (error) {
    console.warn("离线草稿未完整重建，保留原代次日志", String(error));
    if (drafts?.length) {
      try {
        return { copy: await materializeCopy({ ...input, drafts: undefined }), keepOriginal: true };
      } catch (failure) {
        console.warn("已保存的离线内容未能另存", String(failure));
      }
    }
    return { copy: undefined, keepOriginal: true };
  }
}

async function materializeCopy(input: OfflineCopyInput) {
  const size =
    input.state.byteLength +
    (input.previous?.state.byteLength ?? 0) +
    (input.drafts?.reduce((sum, item) => sum + item.byteLength, 0) ?? 0);
  const bytes =
    size >= 128 * 1024 ? await runCheckpointWorker(input) : await prepareOfflineCopy(input);
  if (!bytes) return undefined;
  const copy = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    Y.applyUpdate(copy.doc, bytes);
    return copy;
  } catch (error) {
    copy.doc.destroy();
    throw error;
  }
}
