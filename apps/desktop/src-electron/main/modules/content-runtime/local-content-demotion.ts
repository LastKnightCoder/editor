import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  NODE_DOCUMENT_VERSION,
  readDocumentIdentity,
  type CollaborationSession,
} from "@tau/collaboration";
import type { CollaborationLocalStore } from "../collaboration/local-store";

export interface StagedContentDemotion {
  info: CollaborationSession;
  baselineId: string;
  epoch: number;
  state: string;
  hash: string;
}

export const contentDemotionKey = (id: string) => `demoting:${id}`;

const digest = (state: Uint8Array) => createHash("sha256").update(state).digest("hex");

export function stageContentDemotion(
  store: CollaborationLocalStore,
  info: CollaborationSession,
  doc: Y.Doc
) {
  const { baselineId, epoch } = readDocumentIdentity(doc);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  const plan: StagedContentDemotion = {
    info,
    baselineId,
    epoch,
    state: state.toString("base64"),
    hash: digest(state),
  };
  store.set(contentDemotionKey(info.id), plan);
}

export function readContentDemotion(plan: StagedContentDemotion, id: string) {
  const state = Buffer.from(plan.state, "base64");
  if (digest(state) !== plan.hash) throw new Error("结束共享的本机快照摘要不一致");
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, state);
    const identity = readDocumentIdentity(doc);
    if (
      identity.version !== NODE_DOCUMENT_VERSION ||
      identity.documentId !== id ||
      identity.baselineId !== plan.baselineId ||
      identity.epoch !== plan.epoch
    )
      throw new Error("结束共享的本机快照身份不一致");
    return doc;
  } catch (failure) {
    doc.destroy();
    throw failure;
  }
}
