import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { CollaborationSession } from "@tau/collaboration";
import type * as tauri from "../../../services/tauri";

export type RuntimeSession = {
  inputDrafts: Map<string, tauri.CachedInputDraft>;
  info: CollaborationSession;
  doc: Y.Doc;
  awareness: Awareness;
  provider: HocuspocusProvider | null;
  writeTail: Promise<void>;
  pendingUpdates: Uint8Array[];
  saveError?: { frozen: boolean };
  nodeViews: Record<string, Record<string, unknown>>;
  projection?: Promise<void>;
  close?: tauri.CachedContentSession["close"];
  assetsPending?: boolean;
  resourceGeneration?: number;
  resourcesDirty?: boolean;
  resourceTask?: Promise<void>;
  /** 会话拆除时摘除 doc 上的标题监听 */
  detachDocListener?: () => void;
  releaseResourceSource?: () => void;
};
