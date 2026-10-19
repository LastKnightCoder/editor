import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Node, Transforms, type Descendant, type Element } from "slate";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";

import { createParagraph, isParagraphElement } from "../model/paragraph";
import { insertParagraphAndFocus } from "../utils/editor";
import { deleteVoidBlock } from "../utils/nodeOperations";
import { withNormalize } from "../plugins/withNormalize";
import AddParagraph, { type AddParagraphRef } from "../components/AddParagraph";

describe("段落纯入口与基础构造", () => {
  it("创建独立的无标记空段落，种类判断不接受伪装的文本", () => {
    const first = createParagraph();
    const second = createParagraph();
    expect(first).toEqual({ type: "paragraph", children: [{ type: "formatted", text: "" }] });
    expect(first).not.toBe(second);
    expect(first.children).not.toBe(second.children);
    expect(first.children[0]).not.toBe(second.children[0]);
    expect(isParagraphElement(first)).toBe(true);
    expect(isParagraphElement({ text: "", type: "paragraph" } as unknown as Node)).toBe(false);
    expect(isParagraphElement(createEditor())).toBe(false);
  });

  it("空根经规范化恢复基础段落", () => {
    const editor = withNormalize(createEditor());
    Editor.normalize(editor, { force: true });
    expect(editor.children).toEqual([createParagraph()]);
  });

  it("Node 以公开包入口加载，不允许带入 UI 实现", () => {
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { registerHooks } from 'node:module';
      import assert from 'node:assert/strict';
      registerHooks({ resolve(specifier, context, next) {
        if (['react', 'react-dom', 'slate-react', 'slate-dom', '@tau/ui', '@tau/shared'].some(name => specifier === name || specifier.startsWith(name + '/'))) {
          throw new Error('纯段落入口加载了 UI: ' + specifier);
        }
        return next(specifier, context);
      }});
      const { createParagraph, isParagraphElement } = await import('@tau/editor/api/paragraph');
      assert(isParagraphElement(createParagraph()));
      assert.equal(typeof document, 'undefined');
    `,
      ],
      { cwd: resolve(__dirname, "../../.."), stdio: "pipe" }
    );
  });
});

describe("追加段落与 AddParagraph", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mount = async (nested = false, readOnly = false) => {
    const target = createParagraph();
    const following = createParagraph();
    following.children = [{ type: "formatted", text: "后续内容" }];
    const editor = withReact(createEditor());
    const initialValue: Descendant[] = nested
      ? [{ type: "blockquote", children: [target, following] } as Descendant]
      : [target, following];
    const ref = createRef<AddParagraphRef>();
    const onAdd = vi.fn();
    const focus = vi.spyOn(ReactEditor, "focus").mockImplementation(() => undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    const mountedRoot = createRoot(host);
    root = mountedRoot;
    await act(async () =>
      mountedRoot.render(
        <Slate editor={editor} initialValue={initialValue}>
          <Editable
            readOnly={readOnly}
            renderElement={({ attributes, children }) => <div {...attributes}>{children}</div>}
          />
          <div data-append>
            <AddParagraph element={target} ref={ref} onAddParagraph={onAdd} />
          </div>
        </Slate>
      )
    );
    const handle = ref.current;
    const button = host.querySelector("[data-append] > div");
    if (!handle || !button) throw new Error("追加组件未挂载");
    return {
      editor,
      target,
      following,
      onAdd,
      focus,
      append: handle.addParagraph,
      click: () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      unmount: () => mountedRoot.unmount(),
    };
  };

  it.each([false, true])("在目标同父级后追加并选中（嵌套=%s）", async nested => {
    const { editor, target, following, focus } = await mount(nested);
    const path = nested ? [0, 1] : [1];
    let inserted: number[] | null = null;
    await act(async () => {
      inserted = insertParagraphAndFocus(editor, target);
    });
    expect(inserted).toEqual(path);
    expect(Node.get(editor, path)).toEqual(createParagraph());
    expect(Node.get(editor, nested ? [0, 2] : [2])).toBe(following);
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, path),
      focus: Editor.start(editor, path),
    });
    expect(focus).toHaveBeenCalledOnce();
  });

  it("点击与 ref 都只在成功插入后回调", async () => {
    const { editor, append, click, onAdd } = await mount();
    await act(async () => append());
    expect(onAdd).toHaveBeenCalledTimes(1);
    await act(async () => {
      click();
    });
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(editor.children).toHaveLength(4);
  });

  it("追加空段落不继承当前输入标记", async () => {
    const { editor, target } = await mount();
    await act(async () => {
      Transforms.select(editor, Editor.start(editor, [0]));
      Editor.addMark(editor, "bold", true);
      insertParagraphAndFocus(editor, target);
    });
    expect(Node.get(editor, [1])).toEqual(createParagraph());
  });

  it("只读时直接调用、ref 和点击都不写入或回调", async () => {
    const { editor, target, append, click, onAdd, focus } = await mount(false, true);
    const before = editor.children;
    await act(async () => {
      expect(insertParagraphAndFocus(editor, target)).toBeNull();
      append();
      click();
    });
    expect(editor.children).toBe(before);
    expect(editor.selection).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it.each(["删除", "替换"])("目标%s后旧路径不误写，后续有效目标仍可追加", async operation => {
    const { editor, target, append, onAdd, focus } = await mount();
    await act(async () => {
      if (operation === "删除") Transforms.removeNodes(editor, { at: [0] });
      else
        Editor.withoutNormalizing(editor, () => {
          Transforms.removeNodes(editor, { at: [0] });
          Transforms.insertNodes(editor, createParagraph(), { at: [0] });
        });
    });
    const before = editor.children;
    const selection = editor.selection;
    await act(async () => {
      expect(insertParagraphAndFocus(editor, target)).toBeNull();
      append();
    });
    expect(editor.children).toBe(before);
    expect(editor.selection).toBe(selection);
    expect(onAdd).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    await act(async () => {
      expect(insertParagraphAndFocus(editor, editor.children[0] as Element)).toEqual([1]);
    });
  });

  it("卸载后不依赖残留路径继续写入", async () => {
    const { editor, target, unmount, focus } = await mount();
    await act(async () => unmount());
    root = null;
    const before = editor.children;
    expect(insertParagraphAndFocus(editor, target)).toBeNull();
    expect(editor.children).toBe(before);
    expect(focus).not.toHaveBeenCalled();
  });

  it("真实写入异常继续抛出，不触发成功回调", async () => {
    const { append, onAdd, focus } = await mount();
    const failure = new Error("写入失败");
    vi.spyOn(Transforms, "insertNodes").mockImplementation(() => {
      throw failure;
    });
    expect(append).toThrow(failure);
    expect(onAdd).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("写入成功后焦点失败仍报告成功，不重复追加", async () => {
    const { editor, append, onAdd, focus } = await mount();
    focus.mockImplementation(() => {
      throw new Error("DOM 焦点不可用");
    });
    await act(async () => append());
    expect(editor.children).toHaveLength(3);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("删除唯一 void 块仍在原位置补一个空段落", async () => {
    const { editor } = await mount();
    editor.isVoid = element => element.type === "image";
    await act(async () => {
      editor.children = [
        {
          type: "image",
          url: "image.png",
          children: [{ type: "formatted", text: "" }],
        } as Descendant,
      ];
      vi.useFakeTimers();
      deleteVoidBlock(editor, [0]);
      vi.runAllTimers();
    });
    expect(editor.children).toEqual([createParagraph()]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 0 });
  });
});
