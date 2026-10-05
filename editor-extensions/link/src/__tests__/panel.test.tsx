// 链接浮层：新建 / 编辑 / 点外面完成 / Esc 还原 / 取消后撤销，均在真实编辑器里走一遍
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it } from "vitest";

import { Editor as EditorComponent, createEditorKit, type EditorRef } from "@tau/editor";
import extension from "../index";
import { linkPanelOf } from "../panel/controller";
import type { LinkElement } from "../types";
import { link, text } from "./helpers";

const paragraph = (...children: Descendant[]) =>
  ({ type: "paragraph", children }) as unknown as Descendant;

// jsdom 的 Range 没有布局方法；还原展开选区后悬浮工具条会测量它
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

const mount = async (initValue: Descendant[], readonly = false) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({ extensions: [extension] });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <EditorComponent ref={ref} kit={kit} readonly={readonly} initValue={initValue} />
      </DndProvider>
    );
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  const editor = ref.current!.getEditor();
  return { container, editor, controller: linkPanelOf(editor) };
};

const links = (editor: Editor) =>
  [...Editor.nodes(editor, { at: [], match: node => (node as LinkElement).type === "link" })].map(
    ([node]) => node as LinkElement
  );

const panelInputs = () =>
  [...document.body.querySelectorAll<HTMLInputElement>("body > div input")].filter(
    input => !input.closest("[data-slate-editor]")
  );

const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const press = (target: HTMLElement, key: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

const button = (label: string) =>
  document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
  [...document.body.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;

describe("链接浮层", () => {
  it("选中文字新建：回车成链，不留空链接", async () => {
    const { editor, controller } = await mount([paragraph(text("参考官方文档"))]);
    await act(async () => {
      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 2 },
        focus: { path: [0, 0], offset: 6 },
      });
      controller.startFromSelection("above");
    });
    expect(links(editor)).toHaveLength(0);
    const [input] = panelInputs();
    await type(input, "react.dev");
    await press(input, "Enter");

    const [created] = links(editor);
    expect(created.url).toBe("https://react.dev");
    expect(Node.string(created)).toBe("官方文档");
    expect(controller.getState().mode).toBe("closed");
  });

  it("新建时 Esc 取消，文档不变", async () => {
    const { editor, controller } = await mount([paragraph(text("参考官方文档"))]);
    const before = JSON.stringify(editor.children);
    await act(async () => {
      Transforms.select(editor, Editor.range(editor, [0, 0]));
      controller.startFromSelection("below");
    });
    const [input] = panelInputs();
    await type(input, "react.dev");
    await press(input, "Escape");
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(controller.getState().mode).toBe("closed");
  });

  it("无效地址回车提示错误，不提交", async () => {
    const { editor, controller } = await mount([paragraph(text("文字"))]);
    await act(async () => {
      Transforms.select(editor, Editor.range(editor, [0, 0]));
      controller.startFromSelection("below");
    });
    const [input] = panelInputs();
    await type(input, "react dev");
    await press(input, "Enter");
    expect(document.body.textContent).toContain("看起来不是有效地址");
    expect(links(editor)).toHaveLength(0);
    expect(controller.getState().mode).toBe("create");
  });

  it("编辑同时改文字和地址；Esc 还原", async () => {
    const { editor, controller } = await mount([
      paragraph(text("看 "), link("https://a.com", text("旧")), text("")),
    ]);
    await act(async () => controller.openEdit(links(editor)[0]));
    const [textInput, urlInput] = panelInputs();
    expect(textInput.value).toBe("旧");
    expect(urlInput.value).toBe("https://a.com");
    await type(textInput, "新");
    await type(urlInput, "b.com");
    await press(urlInput, "Escape");
    expect(links(editor)[0]).toMatchObject({ url: "https://a.com" });
    expect(Node.string(links(editor)[0])).toBe("旧");

    await act(async () => controller.openEdit(links(editor)[0]));
    const [textAgain, urlAgain] = panelInputs();
    await type(textAgain, "新");
    await type(urlAgain, "b.com");
    await press(urlAgain, "Enter");
    expect(links(editor)[0]).toMatchObject({ url: "https://b.com" });
    expect(Node.string(links(editor)[0])).toBe("新");
  });

  it("编辑时点外面算完成", async () => {
    const { editor, controller } = await mount([paragraph(link("https://a.com", text("文字")))]);
    await act(async () => controller.openEdit(links(editor)[0]));
    const [, urlInput] = panelInputs();
    await type(urlInput, "https://b.com");
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(links(editor)[0].url).toBe("https://b.com");
    expect(controller.getState().mode).toBe("closed");
  });

  it("取消链接后可撤销", async () => {
    const { editor, controller } = await mount([
      paragraph(text("前"), link("https://a.com", text("中间")), text("后")),
    ]);
    await act(async () => controller.openEdit(links(editor)[0]));
    await act(async () => button("取消链接").click());
    expect(links(editor)).toHaveLength(0);
    expect(controller.getState().mode).toBe("notice");

    await act(async () => button("撤销").click());
    const [restored] = links(editor);
    expect(restored.url).toBe("https://a.com");
    expect(Node.string(restored)).toBe("中间");
    expect(controller.getState().mode).toBe("closed");
  });

  it("只读时不挂浮层", async () => {
    const { editor, controller } = await mount(
      [paragraph(link("https://a.com", text("文字")))],
      true
    );
    await act(async () => controller.openEdit(links(editor)[0]));
    expect(panelInputs()).toHaveLength(0);
  });
});
