import { Activity, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createEditorKit } from "@tau/editor";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { createEditor, Editor, Transforms } from "slate";
import { UiProvider } from "@tau/ui";
import Whiteboard, { defineWhiteboardExtension, type BoardElement } from "@tau/whiteboard";
import { createStandardWhiteboardExtensions } from "@tau/whiteboard/extensions";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import "@tau/ui/styles.css";
import "../../../../examples/whiteboard/src/style.css";

async function mount() {
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  const schema = await prepareBuiltinWhiteboardTypes();
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const definition = createEditorKit()
    .extensions.flatMap(extension => extension.elements ?? [])
    .find(element => element.type === "paragraph");
  if (!definition) throw new Error("段落定义缺失");
  model.submit([{ type: "create_page", id: "p", title: "尺寸回归" }], null);
  const text = (value: string) => [
    { type: "paragraph", children: [{ type: "formatted", text: value }] },
  ];
  const nodes: BoardElement[] = [
    {
      id: "mind",
      type: "mind-node",
      x: 200,
      y: 80,
      width: 24,
      height: 56,
      actualHeight: 56,
      level: 1,
      direction: "right",
      children: [],
      childrenHeight: 0,
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      text: text("这是一个思维导图节点"),
    },
    {
      id: "text",
      type: "richtext",
      x: 600,
      y: 80,
      width: 24,
      height: 40,
      maxWidth: 300,
      maxHeight: 1000,
      resized: false,
      readonly: false,
      content: text("这是一段重新进入白板后也应完整展开的文字"),
    },
    {
      id: "fixed",
      type: "richtext",
      x: 600,
      y: 300,
      width: 240,
      height: 120,
      maxWidth: 240,
      maxHeight: 120,
      resized: true,
      readonly: false,
      content: text("手动调整的文本框保持尺寸"),
    },
    {
      id: "auto",
      type: "richtext",
      x: 200,
      y: 300,
      width: 170,
      height: 4,
      maxWidth: 170,
      maxHeight: 1000,
      resized: true,
      autoHeight: true,
      readonly: false,
      content: text("固定宽度自适应高度的文字需要根据换行重新测量"),
    },
  ];
  let currentBinding: ReturnType<typeof createWhiteboardBinding>;
  const probe = defineWhiteboardExtension({
    id: "test.measurement",
    create(api) {
      Object.assign(window, { measurementApi: api });
      queueMicrotask(() => {
        if (!api.children.length)
          api.apply(nodes.map((node, index) => ({ type: "insert_node", path: [index], node })));
      });
      return {};
    },
  });
  const extensions = [...createStandardWhiteboardExtensions(), probe];
  function Canvas() {
    const binding = useMemo(
      () =>
        createWhiteboardBinding(model, {
          pageId: "p",
          documentId: "measurement",
          types: schema.types,
          preparedContracts: [...schema.prepared, paragraph],
          editorVersions: {
            current: type => (type === "paragraph" ? paragraph : undefined),
            resolve: node =>
              node.tauContract === paragraph.id
                ? { access: "edit", element: definition }
                : undefined,
          },
        }),
      []
    );
    currentBinding = binding;
    return (
      <Whiteboard
        document={binding}
        extensions={extensions}
        initData={[]}
        initViewPort={{ minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 }}
      />
    );
  }
  function App() {
    const [open, setOpen] = useState(true);
    const [hidden, setHidden] = useState(false);
    Object.assign(window, {
      measurement: {
        model,
        text,
        state: () => Array.from(Y.encodeStateAsUpdate(model.doc)),
        replaceText: (id: string, value: string) => {
          const body = currentBinding.textDocument(id)?.binding;
          if (!body) throw new Error("正文绑定缺失");
          const editor = body.install(createEditor()) as NodeTreeEditor;
          editor.connectNodeTree();
          try {
            Transforms.insertText(editor, value, { at: Editor.range(editor, []) });
          } finally {
            editor.disposeNodeTree();
          }
        },
        toggle: () => setOpen(value => !value),
        hide: (value: boolean) => setHidden(value),
        binding: () => currentBinding,
      },
    });
    return (
      <DndProvider backend={HTML5Backend}>
        <UiProvider className="h-full">
          <div style={{ display: hidden ? "none" : undefined }} className="h-full">
            <Activity mode={hidden ? "hidden" : "visible"}>{open && <Canvas />}</Activity>
          </div>
        </UiProvider>
      </DndProvider>
    );
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("画布挂载点缺失");
  createRoot(root).render(<App />);
}
void mount();
