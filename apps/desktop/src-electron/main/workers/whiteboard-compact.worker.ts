import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";
import { compactLocalWhiteboard } from "../modules/whiteboard-documents/compact";
import { stateHash, type WhiteboardCheckpoint } from "../modules/whiteboard-documents/journal";

export type CompactInput = WhiteboardCheckpoint & ({ file: string } | { state: Uint8Array });

function read(input: CompactInput): Uint8Array | undefined {
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
  const state = read(input);
  if (!state || stateHash(state) !== input.hash) return null;
  return compactLocalWhiteboard(state);
}

void prepare(workerData).then(state => {
  if (!parentPort) throw new Error("白板清理缺少工作线程端口");
  parentPort.postMessage(state, state ? [state.buffer as ArrayBuffer] : []);
});
