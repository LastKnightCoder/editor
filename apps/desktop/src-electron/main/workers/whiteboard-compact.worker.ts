import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";
import type { DocumentProtocol } from "@tau/collaboration";
import {
  prepareOfflineCopy,
  type OfflineCopyInput,
  compactConfirmedReplica,
  rebuildWhiteboardCheckpoint,
} from "@tau/collaboration/whiteboard-checkpoint";
import { stateHash, type WhiteboardCheckpoint } from "../modules/whiteboard-documents/journal";

type StoredInput = WhiteboardCheckpoint & { confirmed?: DocumentProtocol } & (
    | { file: string }
    | { state: Uint8Array }
  );

export type CompactInput = StoredInput | OfflineCopyInput;

function read(input: StoredInput): Uint8Array | undefined {
  if ("state" in input) return input.state;
  const db = new Database(input.file, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare(
        "SELECT state FROM whiteboard_documents WHERE document_id=? AND source_id=? AND baseline_id=? AND epoch=? AND revision=? AND revision_hash=?"
      )
      .pluck()
      .get(
        input.documentId,
        input.sourceId,
        input.baselineId,
        input.epoch,
        input.revision,
        input.hash
      ) as Buffer | undefined;
  } finally {
    db.close();
  }
}

async function prepare(input: CompactInput) {
  if ("kind" in input) return prepareOfflineCopy(input);
  const state = read(input);
  if (!state || stateHash(state) !== input.hash) return null;
  return input.confirmed
    ? compactConfirmedReplica(state, input.confirmed)
    : rebuildWhiteboardCheckpoint(state);
}

void prepare(workerData).then(state => {
  if (!parentPort) throw new Error("白板清理缺少工作线程端口");
  parentPort.postMessage(state, state ? [state.buffer as ArrayBuffer] : []);
});
