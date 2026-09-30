// 默认提示服务的确认与输入：走编辑器内挂载的 @tau/ui 对话框，绝不落到 window.confirm / window.prompt。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, notifierOf } from "../index";
import type { EditorRef } from "../types/editor";
import { createDefaultEditorSlots, IEditorSlots } from "../services";
import { openMediaUrlInput } from "../utils/mediaInsert";

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});
const doc = [
  { type: "paragraph", children: [{ type: "formatted", text: "正文" }] },
] as Descendant[];

describe("默认确认框", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let nativeConfirm: ReturnType<typeof vi.fn>;
  let nativePrompt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativeConfirm = vi.fn(() => true);
    nativePrompt = vi.fn(() => "https://native.example/x.png");
    vi.stubGlobal("confirm", nativeConfirm);
    vi.stubGlobal("prompt", nativePrompt);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const mount = async (editors = 1) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const refs = Array.from({ length: editors }, () => createRef<EditorRef>());
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          {refs.map((ref, index) => (
            // 每个编辑器独立的节点副本：Slate 的 node→key 映射是全局 WeakMap，
            // 跨编辑器共享同一批 node 对象会在 decoration 阶段竞态
            <Editor
              key={index}
              ref={ref}
              kit={kit}
              initValue={structuredClone(doc)}
              readonly={false}
            />
          ))}
        </DndProvider>
      );
    });
    return refs.map(ref => ref.current!.getEditor());
  };

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;

  it("确认：弹出 @tau/ui 对话框，点确认 resolve true", async () => {
    const [editor] = await mount();
    let result!: Promise<boolean>;
    await act(async () => {
      result = notifierOf(editor).confirm({
        title: "确认删除",
        description: "确定要删除这个网页视图吗？",
        confirmText: "删除",
        danger: true,
      });
    });
    expect(dialog()?.textContent).toContain("确认删除");
    expect(dialog()?.textContent).toContain("确定要删除这个网页视图吗？");
    await act(async () => button("删除").click());
    await expect(result).resolves.toBe(true);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("取消：resolve false", async () => {
    const [editor] = await mount();
    let result!: Promise<boolean>;
    await act(async () => {
      result = notifierOf(editor).confirm({ title: "确认删除" });
    });
    await act(async () => button("取消").click());
    await expect(result).resolves.toBe(false);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("同页多个编辑器只出一个对话框", async () => {
    const [first] = await mount(2);
    await act(async () => {
      void notifierOf(first).confirm({ title: "只出现一次" });
    });
    const titles = [...document.querySelectorAll("*")].filter(
      el => el.children.length === 0 && el.textContent === "只出现一次"
    );
    expect(titles).toHaveLength(1);
  });

  it("编辑器卸载时未决的确认按取消结算，不会永远挂起", async () => {
    const [editor] = await mount();
    let result!: Promise<boolean>;
    await act(async () => {
      result = notifierOf(editor).confirm({ title: "确认删除" });
    });
    await act(async () => root?.unmount());
    root = null;
    await expect(result).resolves.toBe(false);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  describe("输入", () => {
    const input = () => dialog()!.querySelector<HTMLInputElement>("input")!;
    // 受控 input 只认原生 setter + input 事件
    const type = async (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input(), value);
        input().dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    it("弹出 @tau/ui 对话框，提交返回去掉首尾空白的值", async () => {
      const [editor] = await mount();
      let result!: Promise<string | null>;
      await act(async () => {
        result = notifierOf(editor).prompt({ title: "插入网络图片", confirmText: "插入" });
      });
      expect(dialog()?.textContent).toContain("插入网络图片");
      expect(button("插入").disabled).toBe(true);
      await type("  https://example.com/a.png  ");
      await act(async () => button("插入").click());
      await expect(result).resolves.toBe("https://example.com/a.png");
      expect(nativePrompt).not.toHaveBeenCalled();
    });

    it("校验不通过时保持打开并就地提示，改对后才结算", async () => {
      const [editor] = await mount();
      const validate = vi.fn((value: string) =>
        value.startsWith("http") ? undefined : "地址无效"
      );
      let settled = false;
      await act(async () => {
        void notifierOf(editor)
          .prompt({ title: "输入地址", confirmText: "插入", validate })
          .then(() => (settled = true));
      });
      await type("abc");
      await act(async () => button("插入").click());
      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe("地址无效");
      expect(input().getAttribute("aria-invalid")).toBe("true");
      expect(settled).toBe(false);

      await type("https://ok");
      expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
      await act(async () => button("插入").click());
      expect(settled).toBe(true);
      expect(validate).toHaveBeenLastCalledWith("https://ok");
    });

    it("取消返回 null；编辑器卸载时未决的输入同样按取消结算", async () => {
      const [editor] = await mount();
      let cancelled!: Promise<string | null>;
      await act(async () => {
        cancelled = notifierOf(editor).prompt({ title: "输入地址" });
      });
      await act(async () => button("取消").click());
      await expect(cancelled).resolves.toBeNull();

      let pending!: Promise<string | null>;
      await act(async () => {
        pending = notifierOf(editor).prompt({ title: "输入地址" });
      });
      await act(async () => root?.unmount());
      root = null;
      await expect(pending).resolves.toBeNull();
    });

    it("网络地址插入：经 prompt 取地址，在光标处插入图片", async () => {
      const [editor] = await mount();
      await act(async () => Transforms.select(editor, { path: [0, 0], offset: 2 }));
      await act(async () => void openMediaUrlInput(editor, "image"));
      expect(dialog()?.textContent).toContain("插入网络图片");
      expect(input().inputMode).toBe("url");
      await type("https://example.com/a.png");
      await act(async () => button("插入").click());
      const image = editor.children.find(node => (node as { type?: string }).type === "image");
      expect(image).toMatchObject({ type: "image", url: "https://example.com/a.png" });
    });

    it("网络地址插入：没有可插入的选区时就地提示，不插入", async () => {
      const [editor] = await mount();
      await act(async () => Transforms.deselect(editor));
      await act(async () => void openMediaUrlInput(editor, "image"));
      await type("https://example.com/a.png");
      await act(async () => button("插入").click());
      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("当前选区无法插入");
      expect(editor.children.some(node => (node as { type?: string }).type === "image")).toBe(
        false
      );
    });
  });
});
