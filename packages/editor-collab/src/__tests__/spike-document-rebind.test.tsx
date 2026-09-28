/**
 * 【Spike S2，不是产品代码】验证「同谱系文档源切换不重建编辑器」是否可行。
 * 见 docs/editor-refactor/02-阶段计划.md P0 与 01 §7.3 第 3 层。结论写入 04 执行日志后，
 * 本文件在 P7 由正式实现的测试取代并删除。
 *
 * 场景：同一个 Slate editor 先绑定 Y.Doc A，再切到内容相同（或略有差异）的 Y.Doc B。
 * slate-yjs 的 withYjs 在创建时把 sharedRoot 写死在 editor 上，connect() 会整体替换
 * editor.children，因此需要：
 *  1. rebind：disconnect → 改 sharedRoot → 重建 UndoManager → connect；
 *  2. 结构共享：connect 后把新树中与旧树深度相等的子树换回旧对象，
 *     slate-react 以节点对象身份作 key（NODE_TO_KEY WeakMap），对象不变就不会重新挂载。
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Editor, Element, Node, Transforms, type Descendant } from "slate";
import { Editable, Slate, withReact, type RenderElementProps } from "slate-react";
import { withYHistory, withYjs, YjsEditor, slateNodesToInsertDelta } from "@slate-yjs/core";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const paragraph = (text: string, id: string): Descendant =>
  ({ type: "paragraph", id, children: [{ text }] }) as unknown as Descendant;

const docWith = (nodes: Descendant[]) => {
  const doc = new Y.Doc();
  doc.get("content", Y.XmlText).applyDelta(slateNodesToInsertDelta(nodes));
  return doc;
};

type RebindableEditor = ReturnType<typeof createRebindable>;

function createRebindable(doc: Y.Doc) {
  return withYHistory(withYjs(withReact(createEditor()), doc.get("content", Y.XmlText)));
}

/** 与旧树深度相等的子树复用旧对象（自顶向下，同位置比较） */
function shareStructure(previous: Descendant[], next: Descendant[]): Descendant[] {
  return next.map((node, index) => {
    const old = previous[index];
    if (!old) return node;
    if (JSON.stringify(old) === JSON.stringify(node)) return old;
    if (Element.isElement(node) && Element.isElement(old)) {
      const children = shareStructure(old.children, node.children);
      return { ...node, children } as Descendant;
    }
    return node;
  });
}

function rebind(editor: RebindableEditor, doc: Y.Doc) {
  const previous = editor.children;
  const selection = editor.selection;
  YjsEditor.disconnect(editor);
  editor.undoManager.destroy();
  editor.sharedRoot = doc.get("content", Y.XmlText);
  editor.undoManager = new Y.UndoManager(editor.sharedRoot, {
    trackedOrigins: new Set([editor.localOrigin]),
  });
  YjsEditor.connect(editor);
  editor.children = shareStructure(previous, editor.children);
  if (
    selection &&
    Node.has(editor, selection.anchor.path) &&
    Node.has(editor, selection.focus.path)
  )
    editor.selection = selection;
}

const mounts = new Map<string, number>();
const unmounts = new Map<string, number>();

function TrackedElement({ attributes, children, element }: RenderElementProps) {
  const id = (element as unknown as { id: string }).id;
  useEffect(() => {
    mounts.set(id, (mounts.get(id) ?? 0) + 1);
    return () => void unmounts.set(id, (unmounts.get(id) ?? 0) + 1);
  }, [id]);
  return <p {...attributes}>{children}</p>;
}

describe("Spike S2：同谱系文档源切换", () => {
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

  const content = [paragraph("第一段", "a"), paragraph("第二段", "b"), paragraph("第三段", "c")];

  it("纯 Slate 层：内容相同时 rebind 后节点对象全部复用", () => {
    const editor = createRebindable(docWith(content));
    YjsEditor.connect(editor);
    const before = editor.children;

    rebind(editor, docWith(content));

    editor.children.forEach((node, index) => expect(node).toBe(before[index]));
  });

  it("纯 Slate 层：只有一段不同时，其余段落复用，差异段是新对象", () => {
    const editor = createRebindable(docWith(content));
    YjsEditor.connect(editor);
    const before = editor.children;

    rebind(editor, docWith([content[0], paragraph("第二段·改", "b"), content[2]]));

    expect(editor.children[0]).toBe(before[0]);
    expect(editor.children[1]).not.toBe(before[1]);
    expect(editor.children[2]).toBe(before[2]);
    expect(Editor.string(editor, [1])).toBe("第二段·改");
  });

  it("rebind 后写入走新文档，旧文档不再收到改动；撤销只作用于新文档", () => {
    const docA = docWith(content);
    const docB = docWith(content);
    const editor = createRebindable(docA);
    YjsEditor.connect(editor);

    rebind(editor, docB);
    Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 0 } });
    YjsEditor.flushLocalChanges(editor);

    const text = (doc: Y.Doc) => JSON.stringify(doc.get("content", Y.XmlText).toDelta());
    expect(text(docB)).toContain("新第一段");
    expect(text(docA)).not.toContain("新第一段");

    editor.undo();
    expect(Editor.string(editor, [0])).toBe("第一段");
  });

  it("远端更新在 rebind 后只从新文档进来", () => {
    const docA = docWith(content);
    const docB = docWith(content);
    const editor = createRebindable(docA);
    YjsEditor.connect(editor);
    rebind(editor, docB);

    docA.get("content", Y.XmlText).insert(0, "不该出现");
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(docB));
    (remote.get("content", Y.XmlText).toDelta()[0].insert as Y.XmlText).insert(0, "远端");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(docB)));

    expect(Editor.string(editor, [0])).toBe("远端第一段");
    expect(JSON.stringify(editor.children)).not.toContain("不该出现");
  });

  it("slate-react 渲染：rebind 到相同内容，元素组件不重新挂载，选区保留", async () => {
    const editor = createRebindable(docWith(content));
    YjsEditor.connect(editor);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const render = () => (
      <Slate editor={editor} initialValue={editor.children}>
        <Editable renderElement={props => <TrackedElement {...props} />} />
      </Slate>
    );
    await act(async () => root?.render(render()));
    Transforms.select(editor, { path: [1, 0], offset: 2 });
    expect([...mounts.values()]).toEqual([1, 1, 1]);

    await act(async () => {
      rebind(editor, docWith(content));
      editor.onChange();
    });

    expect([...mounts.values()]).toEqual([1, 1, 1]);
    expect(unmounts.size).toBe(0);
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 2 });
  });

  it("对照组：不做结构共享时，rebind 会让全部元素重新挂载", async () => {
    const editor = createRebindable(docWith(content));
    YjsEditor.connect(editor);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <Slate editor={editor} initialValue={editor.children}>
          <Editable renderElement={props => <TrackedElement {...props} />} />
        </Slate>
      )
    );

    await act(async () => {
      YjsEditor.disconnect(editor);
      editor.sharedRoot = docWith(content).get("content", Y.XmlText);
      YjsEditor.connect(editor);
    });

    expect([...mounts.values()]).toEqual([2, 2, 2]);
  });
});
