// 默认提示服务的确认：走编辑器内挂载的 @tau/ui ConfirmDialog，绝不落到 window.confirm。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, notifierOf } from "../index";
import type { EditorRef } from "../types/editor";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

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

  beforeEach(() => {
    nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
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
});
