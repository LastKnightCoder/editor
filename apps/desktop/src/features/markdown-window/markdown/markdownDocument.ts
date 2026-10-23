import {
  createLocalYjsDocument,
  replaceYText,
  type LocalChangeSource,
  type LocalYjsDocumentOptions,
} from "@tau/editor-collab/local";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import { desktopMarkdown } from "@/utils/markdown";
import { desktopCodecComposition } from "@/utils/markdown-composition";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { Text } from "slate";

/** 文件原文及其规范化缓存也归同一 Y.Doc，撤销时与正文一起恢复。 */
export function createMarkdownDocument(wrap?: LocalYjsDocumentOptions["wrap"]) {
  const serialize = desktopMarkdown.createIncrementalSerializer({
    codecs: desktopCodecComposition,
    textCodecs: [textFormattingCodec],
  });
  const local = createLocalYjsDocument(undefined, {
    wrap,
    matchKey: node =>
      Text.isText(node)
        ? `text:${desktopMarkdown.leafToMarkdown(node)}`
        : `${node.type}:${desktopMarkdown.elementToMarkdown(node, null)}`,
    preserveAttributes: node =>
      ["image", "inline-image", "code-block"].includes(node.type) ? ["uuid"] : [],
  });
  const raw = local.doc.getText("markdown-source");
  const normalized = local.doc.getText("markdown-normalized");
  const state = local.doc.getMap("markdown-state");
  local.undoManager.addToScope([raw, normalized, state]);
  const listeners = new Set<() => void>();
  const changes = new Set<(source: LocalChangeSource) => void>();
  const readSnapshot = () => {
    const content = local.getSnapshot();
    const error = typeof state.get("error") === "string" ? String(state.get("error")) : null;
    const current = error === null ? serialize(content) : null;
    return {
      content,
      text: current === null || current === normalized.toString() ? raw.toString() : current,
      loaded: state.get("loaded") === true,
      error,
    };
  };
  let snapshot = readSnapshot();
  const stop = local.subscribe(source => {
    snapshot = readSnapshot();
    for (const listener of listeners) listener();
    for (const listener of changes) listener(source);
  });
  return {
    document: local.document,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onChange: (listener: (source: LocalChangeSource) => void) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
    getText: () => {
      local.flush();
      return snapshot.text;
    },
    getContent: () =>
      state.has("error") ? importFromMarkdown(raw.toString()) : local.getContent(),
    applyMarkdown: (value: string, source: LocalChangeSource) => {
      local.transact(source, () => {
        replaceYText(raw, value);
        try {
          local.updateContent(importFromMarkdown(value), source);
          replaceYText(normalized, getMarkdown(local.getContent()));
          state.delete("error");
        } catch (error) {
          // 转换失败时原文仍是事实源，富文本停止展示，禁止静默丢字段后写回文件。
          state.set("error", error instanceof Error ? error.message : "暂时无法转换为富文本");
        }
        state.set("loaded", true);
      });
      return !state.has("error");
    },
    undo: local.undo,
    redo: local.redo,
    stopCapturing: () => local.undoManager.stopCapturing(),
    dispose: () => {
      stop();
      listeners.clear();
      changes.clear();
      local.dispose();
    },
  };
}
