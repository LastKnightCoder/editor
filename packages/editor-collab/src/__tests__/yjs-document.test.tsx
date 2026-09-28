import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Awareness } from "y-protocols/awareness";
import { YjsEditor } from "@slate-yjs/core";
import { createSharedDocument, readSharedContent, type SharedContent } from "@tau/collaboration";
import { Editor, createEditorKit } from "@tau/editor";
import { createDefaultEditorSlots, IEditorSlots } from "@tau/editor/src/services";

import { createYjsDocument } from "../document";
import { useCollaboration } from "../context";
import type { EditorCollaborationBinding } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

const article = (content: SharedContent["content"]): SharedContent => ({
  title: "协作",
  content,
  bannerBg: "",
  bannerPosition: "center",
});

function bindingFor(content: SharedContent["content"], mode: "local" | "shared" = "shared") {
  const privateNodes = new Map();
  const doc = createSharedDocument(article(content), privateNodes, mode);
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

describe("createYjsDocument", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  const render = async (node: React.ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
    });
    return container;
  };

  it("内容来自 Y.Doc，编辑写回 Y.Doc，撤销由 Y.UndoManager 负责", async () => {
    const binding = bindingFor([{ type: "paragraph", children: [{ text: "共享正文" }] }]);
    let editor: SlateEditor | null = null;
    const host = await render(
      <Editor
        kit={kit}
        document={createYjsDocument(binding)}
        readonly={false}
        onInit={value => (editor = value)}
      />
    );
    expect(host.textContent).toContain("共享正文");
    expect(YjsEditor.isYjsEditor(editor)).toBe(true);
    expect(binding.flushLocal).toBeTypeOf("function");

    await act(async () => {
      Transforms.insertText(editor!, "新", { at: { path: [0, 0], offset: 0 } });
      binding.flushLocal!();
    });
    expect(JSON.stringify(readSharedContent(binding.doc).content)).toContain("新共享正文");

    await act(async () => (editor as unknown as { undo(): void }).undo());
    expect(JSON.stringify(readSharedContent(binding.doc).content)).not.toContain("新共享正文");
  });

  it("卸载时断开并清掉 flushLocal", async () => {
    const binding = bindingFor([{ type: "paragraph", children: [{ text: "x" }] }]);
    await render(<Editor kit={kit} document={createYjsDocument(binding)} readonly />);
    expect(binding.flushLocal).toBeTypeOf("function");
    await act(async () => root?.unmount());
    root = null;
    expect(binding.flushLocal).toBeUndefined();
  });

  it("共享模式下远端看不到私有块数据，显示占位", async () => {
    const binding = bindingFor([
      { type: "whiteboard", whiteBoardContentId: 7, children: [{ text: "" }] },
    ]);
    binding.privateNodes.clear();
    const host = await render(<Editor kit={kit} document={createYjsDocument(binding)} readonly />);
    expect(host.textContent).toContain("未共享，仅保存在创建者本机");
  });

  it("子树可以读到 binding（useCollaboration）", async () => {
    let seen: EditorCollaborationBinding | undefined;
    function Probe() {
      seen = useCollaboration();
      return null;
    }
    const probeKit = kit.extend({
      extensions: [
        {
          type: "probe",
          getPlugins: () => [],
          getHotkeyConfigs: () => [],
          getBlockPanelItems: () => [],
          getHoveringBarElements: () => [],
          render: ({ attributes, children }) => (
            <p {...attributes}>
              <Probe />
              {children}
            </p>
          ),
        },
      ],
      override: true,
    });
    const probeBinding = bindingFor([{ type: "probe", children: [{ text: "y" }] }], "local");
    await render(<Editor kit={probeKit} document={createYjsDocument(probeBinding)} readonly />);
    expect(seen).toBe(probeBinding);
  });
});
