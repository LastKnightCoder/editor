/**
 * 同谱系换源（01 §7.3 第 3 层）：本机 ↔ 共享切换只是换同步方式，不是换文档。
 * lineage 相同时编辑器不重建、块组件不重新挂载、选区保留。取代 P0 的 spike S2。
 */
import { act, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms } from "slate";
import type { RenderElementProps } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createSharedDocument, readSharedContent, type ContentNode } from "@tau/collaboration";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { defineExtension } from "@tau/editor/api";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

import { createYjsDocument } from "../document";
import type { EditorCollaborationBinding } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounts = new Map<string, number>();
const unmounts = new Map<string, number>();

/** 自定义块统计挂载次数，避免替换核心段落实现。 */
function TrackedBlock({ attributes, children, element }: RenderElementProps) {
  const id = String((element as unknown as ContentNode).probeId);
  useEffect(() => {
    mounts.set(id, (mounts.get(id) ?? 0) + 1);
    return () => void unmounts.set(id, (unmounts.get(id) ?? 0) + 1);
  }, [id]);
  return <p {...attributes}>{children}</p>;
}

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  extensions: [
    defineExtension({
      id: "test.tracked-block",
      elements: [{ type: "tracked-block", kind: "block", render: TrackedBlock }],
    }),
  ],
});

const content = (suffix = ""): ContentNode[] => [
  { type: "tracked-block", probeId: "a", children: [{ text: `第一段${suffix}` }] },
  { type: "tracked-block", probeId: "b", children: [{ text: "第二段" }] },
  { type: "tracked-block", probeId: "c", children: [{ text: "第三段" }] },
];

function makeBinding(nodes: ContentNode[], mode: "local" | "shared") {
  const privateNodes = new Map();
  const doc = createSharedDocument(
    { title: "内容", content: nodes, bannerBg: "", bannerPosition: "center" },
    privateNodes,
    mode
  );
  const binding: EditorCollaborationBinding = {
    mode,
    doc,
    awareness: new Awareness(doc),
    origin: {},
    privateNodes,
    uploadResource: async () => "",
    resolveResource: async url => url,
  };
  return binding;
}

/** 共享侧文档：内容与本机一致（会话升级的产物），谱系相同 */
function upgraded(local: EditorCollaborationBinding) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(local.doc));
  doc.getMap("meta").set("mode", "shared");
  const binding: EditorCollaborationBinding = {
    ...local,
    mode: "shared",
    doc,
    awareness: new Awareness(doc),
    origin: {},
  };
  return binding;
}

describe("同谱系换源", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    mounts.clear();
    unmounts.clear();
  });

  const render = async (node: React.ReactNode) => {
    if (!container) {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    }
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
    });
    return container;
  };

  it("lineage 相同时编辑器不重建，块组件不重新挂载，选区保留", async () => {
    const local = makeBinding(content(), "local");
    const shared = upgraded(local);
    const editorRef = createRef<EditorRef>();
    const view = (binding: EditorCollaborationBinding) => (
      <Editor
        kit={kit}
        ref={editorRef}
        document={createYjsDocument(binding, { lineage: "content:1" })}
        readonly={false}
      />
    );

    const host = await render(view(local));
    const before = editorRef.current!.getEditor();
    await act(async () =>
      Transforms.select(editorRef.current!.getEditor(), { path: [1, 0], offset: 2 })
    );
    expect(["a", "b", "c"].map(id => mounts.get(id))).toEqual([1, 1, 1]);

    await render(view(shared));

    expect(editorRef.current!.getEditor()).toBe(before);
    expect(["a", "b", "c"].map(id => mounts.get(id))).toEqual([1, 1, 1]);
    expect(["a", "b", "c"].map(id => unmounts.get(id))).toEqual([undefined, undefined, undefined]);
    expect(before.selection?.anchor).toEqual({ path: [1, 0], offset: 2 });
    expect(host.textContent).toContain("第二段");
  });

  it("换源后写入只进新文档，撤销也只作用于新文档", async () => {
    const local = makeBinding(content(), "local");
    const shared = upgraded(local);
    const editorRef = createRef<EditorRef>();
    const view = (binding: EditorCollaborationBinding) => (
      <Editor
        kit={kit}
        ref={editorRef}
        document={createYjsDocument(binding, { lineage: "content:1" })}
        readonly={false}
      />
    );
    await render(view(local));
    await render(view(shared));

    await act(async () => {
      Transforms.insertText(editorRef.current!.getEditor(), "新", {
        at: { path: [0, 0], offset: 0 },
      });
      shared.flushLocal!();
    });
    expect(JSON.stringify(readSharedContent(shared.doc).content)).toContain("新第一段");
    expect(JSON.stringify(readSharedContent(local.doc).content)).not.toContain("新第一段");

    await act(async () => (editorRef.current!.getEditor() as unknown as { undo(): void }).undo());
    expect(JSON.stringify(readSharedContent(shared.doc).content)).not.toContain("新第一段");
  });

  it("本机关闭光标发送，升级共享后开启，降级后再次关闭，始终复用实例", async () => {
    const local = makeBinding(content(), "local");
    const shared = upgraded(local);
    const downgraded = makeBinding(content(), "local");
    const editorRef = createRef<EditorRef>();
    const view = (binding: EditorCollaborationBinding, cursors: boolean) => (
      <Editor
        kit={kit}
        ref={editorRef}
        document={createYjsDocument(binding, { lineage: "content:1", cursors })}
        readonly={false}
      />
    );
    try {
      await render(view(local, false));
      const original = editorRef.current!.getEditor();
      await act(async () => Transforms.select(original, { path: [0, 0], offset: 1 }));
      expect(local.awareness.getLocalState()?.selection).toBeUndefined();

      await render(view(shared, true));
      expect(editorRef.current!.getEditor()).toBe(original);
      await act(async () => Transforms.select(original, { path: [0, 0], offset: 2 }));
      expect(shared.awareness.getLocalState()?.selection).toBeTruthy();

      await render(view(downgraded, false));
      expect(editorRef.current!.getEditor()).toBe(original);
      await act(async () => Transforms.select(original, { path: [0, 0], offset: 3 }));
      expect(downgraded.awareness.getLocalState()?.selection).toBeUndefined();
    } finally {
      await act(async () => root?.unmount());
      root = null;
      for (const binding of [local, shared, downgraded]) {
        binding.awareness.destroy();
        binding.doc.destroy();
      }
    }
  });

  it("只有一段不同时，其余段落不重新挂载，差异段重建", async () => {
    const local = makeBinding(content(), "local");
    const shared = upgraded(local);
    shared.doc.transact(() => {
      const paragraph = (
        shared.doc.get("content", Y.XmlText).toDelta() as { insert: Y.XmlText }[]
      )[1].insert;
      paragraph.insert(paragraph.length, "·改");
    });
    const editorRef = createRef<EditorRef>();
    const view = (binding: EditorCollaborationBinding) => (
      <Editor
        kit={kit}
        ref={editorRef}
        document={createYjsDocument(binding, { lineage: "content:1" })}
        readonly={false}
      />
    );
    await render(view(local));
    await render(view(shared));

    expect(mounts.get("a")).toBe(1);
    expect(mounts.get("c")).toBe(1);
    expect(mounts.get("b")).toBe(2);
    expect(SlateEditor.string(editorRef.current!.getEditor(), [1])).toBe("第二段·改");
  });

  it("lineage 不同视为换了一篇文档，编辑器重建", async () => {
    const first = makeBinding(content(), "local");
    const second = makeBinding(content("·另一篇"), "local");
    const editorRef = createRef<EditorRef>();
    const view = (binding: EditorCollaborationBinding, lineage: string) => (
      <Editor
        kit={kit}
        ref={editorRef}
        document={createYjsDocument(binding, { lineage })}
        readonly={false}
      />
    );
    await render(view(first, "content:1"));
    const before = editorRef.current!.getEditor();

    await render(view(second, "content:2"));

    expect(editorRef.current!.getEditor()).not.toBe(before);
    expect(SlateEditor.string(editorRef.current!.getEditor(), [0])).toBe("第一段·另一篇");
  });
});
