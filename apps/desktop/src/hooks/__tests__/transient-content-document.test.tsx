import { act, useState } from "react";
import * as Y from "yjs";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, defineExtension } from "@tau/editor";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { useBoundContentDocument, useTransientContentDocument } from "../useContentDocument";

it("旧网络协议绑定明确报错，不构造只读替代文档", async () => {
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", 1);
  const before = Y.encodeStateAsUpdate(doc);
  const binding = { doc, origin: "test" } as unknown as ContentCollaborationBinding;
  let result: ReturnType<typeof useBoundContentDocument> | undefined;
  function Probe() {
    result = useBoundContentDocument(binding);
    return null;
  }
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    expect(result?.document).toBeUndefined();
    expect(result?.error).toContain("UNSUPPORTED");
    expect(result?.frozen).toBe(true);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally {
    await act(async () => root.unmount());
    doc.destroy();
  }
});

it("临时草稿按原契约渲染旧版本，输入后保持编辑实例和旧字段", async () => {
  const previous = {
    type: "example.source",
    dataVersion: 1,
    kind: "block" as const,
    isVoid: true,
    collaboration: { textFields: ["source"] },
    render: ({ attributes, element, children }: any) => (
      <div {...attributes} data-version="1">
        {element.source}
        {children}
      </div>
    ),
  };
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "example",
        elements: [
          {
            ...previous,
            dataVersion: 2,
            collaboration: { textFields: ["code"] },
            previousVersions: [{ element: previous, access: "read" }],
            render: ({ attributes, element, children }: any) => (
              <div {...attributes} data-version="2">
                {element.code}
                {children}
              </div>
            ),
          },
        ],
      }),
    ],
  });
  const catalog = await desktopContentPlugins.prepareEditorContracts(kit.extensions);
  const old = Object.keys(catalog.dictionary).find(
    id =>
      catalog.dictionary[id].type === "example.source" && catalog.dictionary[id].dataVersion === 1
  )!;
  const prepared = await catalog.createDocument(
    [
      { type: "paragraph", children: [{ text: "原文" }] },
      {
        type: "example.source",
        tauContract: old,
        source: "旧源码",
        custom: "保留",
        children: [{ text: "" }],
      },
    ] as Descendant[],
    catalog.dictionary
  );
  let editor: SlateEditor | undefined,
    saved: Descendant[] = prepared.content;
  function Harness() {
    const [value, setValue] = useState(prepared.content);
    const binding = useTransientContentDocument(value, prepared.contracts, kit, false, next => {
      saved = next;
      setValue(next);
    });
    return binding.document ? (
      <Editor
        kit={kit}
        document={binding.document}
        readonly={false}
        onInit={value => {
          editor = value;
        }}
      />
    ) : null;
  }
  const container = document.createElement("div"),
    root = createRoot(container);
  document.body.appendChild(container);
  try {
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Harness />
        </DndProvider>
      );
    });
    expect(container.querySelector('[data-version="1"]')?.textContent).toContain("旧源码");
    expect(container.querySelector('[data-version="2"]')).toBeNull();
    const original = editor;
    await act(async () => {
      Transforms.insertText(editor!, "新", { at: { path: [0, 0], offset: 0 } });
    });
    expect(editor).toBe(original);
    expect(saved[1]).toMatchObject({ tauContract: old, source: "旧源码", custom: "保留" });
    expect((saved[0] as any).children[0].text).toBe("新原文");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
