import useSettingStore from "@/stores/useSettingStore";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useWebClip } from "../useWebClip";
import { useProjectWebI18n } from "@/features/projects/components/ProjectView/WebViewProjectItemView/i18n";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { startWebClip } from "@/services/web-clip";
import type { WebClipProgressData, WebClipCompleteData } from "@/services/web-clip";

const api = vi.hoisted(() => ({
  status: vi.fn(),
  progress: undefined as ((data: WebClipProgressData) => void) | undefined,
  complete: undefined as ((data: WebClipCompleteData) => void) | undefined,
}));
vi.mock("@/services/web-clip", () => ({
  startWebClip: vi.fn(async () => undefined),
  cancelWebClip: vi.fn(async () => undefined),
  getWebClipStatus: api.status,
  registerWebClipProgressHandler: (callback: typeof api.progress) => {
    api.progress = callback;
    return () => {
      api.progress = undefined;
    };
  },
  registerWebClipCompleteHandler: (callback: typeof api.complete) => {
    api.complete = callback;
    return () => {
      api.complete = undefined;
    };
  },
  registerWebClipErrorHandler: () => () => undefined,
}));

it("网页生成丢弃旧状态读取、完成前的节流尾帧及取消后的消息", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let status!: (value: unknown) => void;
  api.status.mockReturnValue(
    new Promise(resolve => {
      status = resolve;
    })
  );
  let current: ReturnType<typeof useWebClip> | undefined;
  const progress = vi.fn(),
    complete = vi.fn();
  function Harness() {
    useProjectWebI18n();
    current = useWebClip({ projectItemId: 1, onProgress: progress, onComplete: complete });
    return null;
  }
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => current?.startClip("html", "https://example.test", "标题"));
    const handlers = { progress: api.progress, complete: api.complete };
    const calls = vi.mocked(startWebClip).mock.calls.length;
    const reads = api.status.mock.calls.length;
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(current?.isClipping).toBe(true);
      expect(api.progress).toBe(handlers.progress);
      expect(api.complete).toBe(handlers.complete);
      expect(vi.mocked(startWebClip).mock.calls.length).toBe(calls);
      expect(api.status.mock.calls.length).toBe(reads);
    }
    expect(vi.mocked(startWebClip).mock.lastCall?.[0]).toMatchObject({
      projectItemId: 1,
      html: "html",
      url: "https://example.test",
      title: "标题",
      translateToChinese: false,
    });
    await act(async () => status({ status: "processing", markdown: "上次任务的旧状态" }));
    expect(current?.markdown).toBe("");
    await act(async () => {
      api.progress?.({
        databaseName: useSettingStore.getState().setting.database.active,
        projectItemId: 1,
        markdown: "第一帧",
      } as WebClipProgressData);
      api.progress?.({
        databaseName: useSettingStore.getState().setting.database.active,
        projectItemId: 1,
        markdown: "待节流帧",
      } as WebClipProgressData);
      api.complete?.({
        databaseName: useSettingStore.getState().setting.database.active,
        projectItemId: 1,
        markdown: "最终正文",
      } as WebClipCompleteData);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(JSON.stringify(current?.content)).toContain("最终正文");
    expect(progress).not.toHaveBeenCalledWith("待节流帧", expect.anything());
    expect(complete).toHaveBeenCalledTimes(1);
    await act(async () => current?.startClip("html", "https://example.test", "标题"));
    await act(async () => current?.cancelClip());
    await act(async () =>
      api.progress?.({
        databaseName: useSettingStore.getState().setting.database.active,
        projectItemId: 1,
        markdown: "取消后迟到",
      } as WebClipProgressData)
    );
    expect(current?.markdown).toBe("");
    expect(current?.isClipping).toBe(false);
  } finally {
    await act(async () => root.unmount());
    desktopLocaleSource.setLocale("zh-CN");
    host.remove();
    vi.useRealTimers();
  }
});
