// void 块公共外框与 useElement：点选、按键、删除、右键菜单、只读与字段写入。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant, Element } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import type { EditorRef } from "../types/editor";
import { defineExtension, type ElementRenderProps } from "../api";
import { elementRuntime } from "../../../source";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

type CardElement = { type: "test.card"; count: number; children: Descendant[] };

const text = (value = "") => ({ type: "formatted" as const, text: value });
const card = (count = 0) =>
  ({ type: "test.card", count, children: [text()] }) as unknown as Element;
const paragraph = (value = "") => ({ type: "paragraph", children: [text(value)] }) as Element;

function Card({ attributes, element: node, children }: ElementRenderProps) {
  const access = elementRuntime.useElement(node);
  const element = node as unknown as CardElement;
  return (
    <div {...attributes} data-card="" data-selected={String(access.selected)}>
      <button
        type="button"
        onClick={() => access.update({ count: element.count + 1 })}
        data-readonly={String(access.readOnly)}
      >
        {element.count}
      </button>
      {children}
    </div>
  );
}

const edit = vi.fn();
const extension = defineExtension({
  id: "test.card",
  elements: [
    {
      type: "test.card",
      kind: "block",
      isVoid: true,
      frame: { keys: { Enter: "test.card.edit" } },
      render: Card,
    },
  ],
  commands: [{ id: "test.card.edit", run: (_editor, ctx) => edit(ctx.element) }],
  menu: [{ id: "test.card.edit", title: "编辑卡片", command: "test.card.edit" }],
});

const kit = createEditorKit({
  extensions: [extension],
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  edit.mockClear();
});

async function mount(value: Element[], readonly = false) {
  const ref = createRef<EditorRef>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
      </DndProvider>
    )
  );
  return () => ref.current!.getEditor();
}

const body = () => host.querySelector<HTMLElement>("[data-element-frame] > div")!;
const keydown = (key: string) =>
  act(async () => {
    body().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

describe("void 块外框", () => {
  it("render 只渲染内容：外框接管 attributes 与 children，末尾有添加段落", async () => {
    await mount([card(), paragraph("后")]);
    const frame = host.querySelector("[data-element-frame]")!;
    expect(frame.getAttribute("data-slate-node")).toBe("element");
    expect(host.querySelector("[data-card]")?.hasAttribute("data-slate-node")).toBe(false);
    // 第二个子节点是添加段落：不可编辑、点击插入段落
    expect(frame.children[1]?.getAttribute("contenteditable")).toBe("false");
  });

  it("点选后描边并标记选中，点到外面取消；选中时按声明的键执行命令", async () => {
    const editor = await mount([card(), paragraph()]);
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(body().className).toContain("outline-[var(--ed-accent)]");
    expect(host.querySelector("[data-card]")?.getAttribute("data-selected")).toBe("true");
    await keydown("Enter");
    expect(edit).toHaveBeenCalledWith(editor().children[0]);
    await act(async () =>
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    expect(host.querySelector("[data-card]")?.getAttribute("data-selected")).toBe("false");
  });

  it("选中时 Delete 删除块并在原位留下空段落", async () => {
    const editor = await mount([card(), paragraph("后")]);
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await keydown("Delete");
    expect(editor().children.map(node => (node as Element).type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  it("右键打开块菜单，条目来自扩展的 menu", async () => {
    await mount([card(), paragraph()]);
    await act(async () =>
      body().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    );
    expect(document.body.textContent).toContain("编辑卡片");
  });

  it("useElement 写入字段；只读时不选中、不写入、最后一块不显示添加段落", async () => {
    const editor = await mount([paragraph(), card(1)]);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-card] button")!.click());
    expect((editor().children[1] as unknown as CardElement).count).toBe(2);
    await act(async () => root!.unmount());
    host.remove();

    const readonlyEditor = await mount([paragraph(), card(1)], true);
    expect(host.querySelector("[data-card] button")?.getAttribute("data-readonly")).toBe("true");
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(body().className).not.toContain("outline-[var(--ed-accent)]");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-card] button")!.click());
    expect((readonlyEditor().children[1] as unknown as CardElement).count).toBe(1);
    const frame = host.querySelector("[data-element-frame]")!;
    expect([...frame.children].filter(child => child.classList.contains("cursor-default"))).toEqual(
      []
    );
  });

  it("外框只适用于 void 块：声明错误的扩展不装配", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const badKit = createEditorKit({
      extensions: [
        defineExtension({
          id: "test.bad-frame",
          elements: [{ type: "test.bad", kind: "block", frame: true, render: () => null }],
        }),
      ],
    });
    expect(badKit.elementTypes).not.toContain("test.bad");
  });
});
