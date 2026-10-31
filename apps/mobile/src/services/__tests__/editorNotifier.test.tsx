// mobile 的编辑器提示服务：提示进统一的 @tau/ui toast，确认走 MobileConfirmDialog，输入走 BottomSheet（返回手势见 router 集成测试）。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastQueue } from "../../components/toast";
import {
  EditorConfirmHost,
  EditorPromptHost,
  mobileEditorNotifier,
  useEditorConfirmStore,
  useEditorPromptStore,
} from "../editorNotifier";
import { recordUploadFailure, resetUploadOutcomeForTest } from "../uploadOutcome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("mobileEditorNotifier", () => {
  beforeEach(() => {
    toastQueue.clearAll();
    useEditorConfirmStore.setState({ pending: null });
  });

  it("提示进统一的 toast 队列", () => {
    mobileEditorNotifier.success("已复制");
    mobileEditorNotifier.error("上传失败");
    mobileEditorNotifier.warning("请输入地址");
    expect(toastQueue.list().map(item => [item.type, item.text])).toEqual([
      ["success", "已复制"],
      ["error", "上传失败"],
      ["warning", "请输入地址"],
    ]);
  });

  it("紧随上传失败的错误提示补上原因与「去设置」入口，只补一次", () => {
    resetUploadOutcomeForTest();
    recordUploadFailure("github", new Error("RESOURCE_UPLOAD_FAILED:HTTP 401 Bad credentials"));
    mobileEditorNotifier.error("图片上传失败");
    mobileEditorNotifier.error("上传失败");
    const [enriched, plain] = toastQueue.list();
    expect(enriched).toMatchObject({
      type: "error",
      text: "图片没传上去：账号已失效或没有写入权限",
    });
    expect(enriched.action?.label).toBe("去设置");
    expect(plain).toMatchObject({ type: "error", text: "上传失败" });
    expect(plain.action).toBeUndefined();
  });

  it("进行中提示用同一条落定为结果", () => {
    const progress = mobileEditorNotifier.loading("正在上传…");
    expect(toastQueue.list()).toMatchObject([{ type: "loading", text: "正在上传…" }]);
    progress.success("已插入");
    const toasts = toastQueue.list();
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

  describe("输入", () => {
    it("发起者取消只关闭对应请求，旧信号不影响后续输入", async () => {
      const controller = new AbortController();
      let first!: Promise<string | null>;
      act(() => {
        first = mobileEditorNotifier.prompt({ title: "输入", signal: controller.signal });
      });
      act(() => controller.abort());
      await expect(first).resolves.toBeNull();
      expect(useEditorPromptStore.getState().pending).toBeNull();
      let next!: Promise<string | null>;
      act(() => {
        next = mobileEditorNotifier.prompt({ title: "下一次" });
      });
      act(() => controller.abort());
      expect(useEditorPromptStore.getState().pending?.title).toBe("下一次");
      act(() => useEditorPromptStore.getState().settle("完成"));
      await expect(next).resolves.toBe("完成");
    });

    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
      vi.stubGlobal("prompt", vi.fn());
      useEditorPromptStore.setState({ pending: null });
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => root.render(<EditorPromptHost />));
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = "";
      vi.unstubAllGlobals();
    });

    const button = (text: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent === text
      )!;
    const input = () => document.querySelector<HTMLInputElement>("input")!;
    const type = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setter.call(input(), value);
        input().dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    it("弹出底部面板，提交返回去掉首尾空白的值", async () => {
      let result!: Promise<string | null>;
      act(() => {
        result = mobileEditorNotifier.prompt({
          title: "插入网络图片",
          confirmText: "插入",
          inputMode: "url",
        });
      });
      expect(document.body.textContent).toContain("插入网络图片");
      expect(input().inputMode).toBe("url");
      expect(button("插入").disabled).toBe(true);
      type("  https://example.com/a.png ");
      act(() => button("插入").click());
      await expect(result).resolves.toBe("https://example.com/a.png");
      expect(window.prompt).not.toHaveBeenCalled();
    });

    it("校验不通过时保持打开并就地提示", () => {
      act(() => {
        void mobileEditorNotifier.prompt({
          title: "插入网络视频",
          confirmText: "插入",
          validate: () => "该地址属于特殊内容源",
        });
      });
      type("https://b23.tv/x");
      act(() => button("插入").click());
      expect(document.querySelector('[role="alert"]')?.textContent).toBe("该地址属于特殊内容源");
      expect(useEditorPromptStore.getState().pending).not.toBeNull();
    });

    it("点取消 resolve null", async () => {
      let result!: Promise<string | null>;
      act(() => {
        result = mobileEditorNotifier.prompt({ title: "输入地址" });
      });
      act(() => button("取消").click());
      await expect(result).resolves.toBeNull();
    });
  });
});
