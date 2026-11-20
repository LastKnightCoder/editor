import * as Y from "yjs";
import {
  base64ToBytes,
  buildDocumentHistoryUpdate,
  readDocumentHistoryPreview,
  type DocumentHistoryAction,
  type DocumentHistoryEntry,
  type DocumentHistoryPreview,
  type DocumentHistoryReader,
} from "@tau/collaboration";
import * as tauri from "../../../services/tauri";
import { request } from "./rest";

export interface HistoryApi {
  list(before?: number): Promise<DocumentHistoryEntry[]>;
  preview(sequence: number, compare?: boolean): Promise<DocumentHistoryPreview>;
  apply(action: DocumentHistoryAction): Promise<unknown>;
}

export function sharedHistoryApi(
  serverUrl: string,
  documentId: string,
  flush?: () => Promise<void>
): HistoryApi {
  const path = `/v1/documents/${encodeURIComponent(documentId)}/history`;
  return {
    list: before =>
      request({ serverUrl, path: before === undefined ? path : `${path}?before=${before}` }),
    preview: (sequence, compare) =>
      request({ serverUrl, path: `${path}/${sequence}${compare ? "?compare=current" : ""}` }),
    apply: async body => {
      await flush?.();
      return request({ serverUrl, path: `${path}/apply`, method: "POST", body });
    },
  };
}

const revision = async (state: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(state))))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

async function readLocalHistory(id: string, sequence: number): Promise<DocumentHistoryReader> {
  const version = await tauri.collabLocalHistoryVersion(id, sequence);
  const previous =
    version.entry.kind === "baseline"
      ? undefined
      : await tauri.collabLocalHistoryVersion(id, sequence - 1);
  return {
    entry: () => version.entry,
    undone: () => version.undone,
    replay: (_id, requested) => {
      const state = requested === sequence ? version : previous;
      if (!state || state.entry.sequence !== requested) throw new Error("历史版本已失效");
      const doc = new Y.Doc({ gc: false });
      try {
        for (const update of state.updates) {
          Y.applyUpdate(doc, base64ToBytes(update));
          if (doc.store.pendingStructs || doc.store.pendingDs)
            throw new Error("历史版本缺少先行增量");
        }
        return doc;
      } catch (error) {
        doc.destroy();
        throw error;
      }
    },
  };
}

export function localHistoryApi(
  id: string,
  doc: Y.Doc,
  requireWrite: () => void,
  flush: () => Promise<void>,
  commit: (update: Uint8Array, action: DocumentHistoryAction) => Promise<void>
): HistoryApi {
  let writing = false;
  return {
    list: async before => {
      await flush();
      return tauri.collabLocalHistoryList(id, before);
    },
    preview: async (sequence, compare) => {
      await flush();
      const archive = await readLocalHistory(id, sequence);
      return readDocumentHistoryPreview(
        archive,
        id,
        sequence,
        await revision(Y.encodeStateAsUpdate(doc)),
        "local",
        true,
        compare ? doc : undefined
      );
    },
    apply: async action => {
      if (writing) throw new Error("正文已有历史操作正在提交");
      writing = true;
      try {
        requireWrite();
        await flush();
        const entries = await readLocalHistory(id, action.sequence);
        const state = Y.encodeStateAsUpdate(doc);
        const observed = await revision(state);
        const update = await buildDocumentHistoryUpdate(
          entries,
          id,
          doc,
          action,
          observed,
          "local",
          true,
          { allowLocalResources: true }
        );
        requireWrite();
        const latest = Y.encodeStateAsUpdate(doc);
        if (latest.length !== state.length || !latest.every((byte, index) => byte === state[index]))
          throw new Error("正文已变化，请重新查看历史版本");
        await commit(update, action);
      } finally {
        writing = false;
      }
    },
  };
}
