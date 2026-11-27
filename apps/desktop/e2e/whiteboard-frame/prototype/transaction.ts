import * as Y from "yjs";
import { WhiteboardModel, type WhiteboardModelCommand } from "@tau/collaboration";
import {
  nodeInitializationRanges,
  preserveNodeInitialization,
} from "../../../../../packages/collaboration/src/node-tree-history";

export interface Candidate {
  update: Uint8Array;
  ranges: { client: number; clock: number; len: number }[];
  createdIds: readonly string[];
  prepareMs: number;
  executeMs: number;
  validateMs: number;
  proofReused: boolean;
  baselineReused: boolean;
}

/** 仅性能夹具使用；生产入口仍走现有同步模型。 */
export async function prepareCandidate(
  source: WhiteboardModel,
  commands: readonly WhiteboardModelCommand[],
  incremental = false
): Promise<Candidate> {
  const start = performance.now();
  const baselineReused = incremental && Boolean(source.readIncrementalSnapshot());
  if (incremental) source.prepareLocalTranslations();
  const model = incremental
    ? source.forkPreparedBaseline()
    : new WhiteboardModel(new Y.Doc({ gc: false }));
  const doc = model.doc;
  if (!incremental) {
    Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(source.doc));
    for (const name of source.doc.share.keys())
      if (name === "node-tree:nodes" || /^node-tree:roots:.*:nodes$/.test(name)) doc.getMap(name);
  }
  const vector = Y.encodeStateVector(doc),
    ranges: Candidate["ranges"] = [];
  doc.on("afterTransaction", transaction => ranges.push(...nodeInitializationRanges(transaction)));
  try {
    model.prepareLocalTranslations();
    const executeStart = performance.now();
    const local = model.tryLocalStructure(commands, {});
    const result = local ?? model.submitChunks(commands, {});
    const executeMs = performance.now() - executeStart,
      validateStart = performance.now();
    const proofReused = incremental && local?.isolated === true;
    if (!proofReused) await model.validate(source);
    const validateMs = performance.now() - validateStart;
    return {
      update: Y.encodeStateAsUpdate(doc, vector),
      ranges,
      createdIds: result.createdIds,
      executeMs,
      validateMs,
      proofReused,
      baselineReused,
      prepareMs: performance.now() - start,
    };
  } finally {
    model.dispose();
    doc.destroy();
  }
}

export function applyCandidate(model: WhiteboardModel, candidate: Candidate, origin: object) {
  model.doc.transact(transaction => {
    for (const range of candidate.ranges) preserveNodeInitialization(transaction, range);
    Y.applyUpdate(model.doc, candidate.update, origin);
    transaction.local = true;
  }, origin);
}
