// mobile 的编辑器提示服务：提示进 mobile 自己的 toast，确认走 MobileConfirmDialog（返回手势见 router 集成测试）。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../../components/toast";
import { EditorConfirmHost, mobileEditorNotifier, useEditorConfirmStore } from "../editorNotifier";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("mobileEditorNotifier", () => {
  beforeEach(() => {
    useToastStore.getState().clearAll();
    useEditorConfirmStore.setState({ pending: null });
  });

  it("提示进 mobile 的 toast 队列", () => {
    mobileEditorNotifier.success("已复制");
    mobileEditorNotifier.error("上传失败");
    mobileEditorNotifier.warning("请输入地址");
    expect(useToastStore.getState().toasts.map(item => [item.type, item.text])).toEqual([
      ["success", "已复制"],
      ["error", "上传失败"],
      ["warning", "请输入地址"],
    ]);
  });

  it("进行中提示用同一条落定为结果", () => {
    const progress = mobileEditorNotifier.loading("正在上传…");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    progress.success("已插入");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ type: "success", text: "已插入" });
  });

  describe("确认", () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
      vi.stubGlobal("confirm", vi.fn());
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => root.render(<EditorConfirmHost />));
    });

    afterEach(async () => {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = "";
      vi.unstubAllGlobals();
    });

    const button = (text: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent === text
      )!;

    it("弹出 MobileConfirmDialog，点确认 resolve true", async () => {
      let result!: Promise<boolean>;
      act(() => {
        result = mobileEditorNotifier.confirm({
          title: "确认删除",
          description: "确定要删除这个网页视图吗？",
          confirmText: "删除",
          danger: true,
        });
      });
      expect(document.body.textContent).toContain("确定要删除这个网页视图吗？");
      act(() => button("删除").click());
      await expect(result).resolves.toBe(true);
      expect(window.confirm).not.toHaveBeenCalled();
    });

    it("点取消 resolve false", async () => {
      let result!: Promise<boolean>;
      act(() => {
        result = mobileEditorNotifier.confirm({ title: "确认删除" });
      });
      act(() => button("取消").click());
      await expect(result).resolves.toBe(false);
    });
  });
});
