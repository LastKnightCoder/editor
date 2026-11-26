import { VideoCacheFailure } from "../../../shared/video-cache-failure";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import type { OnlineVideoCacheProgress } from "../../../shared/video-renderer";
import { useOnlineVideo } from "../useOnlineVideo";
import { VideoSourceLoader } from "@/components/VideoSourceLoader";
const wire = vi.hoisted(() => ({
  available: true,
  ensure: vi.fn(),
  convert: vi.fn(async (src: string) => src),
}));
vi.mock("@/commands", () => ({ convertFileSrc: wire.convert }));
vi.mock("@/commands/online-video-cache", () => ({ ensureOnlineVideo: wire.ensure }));
vi.mock("@/hooks/useVideoProviders", () => ({
  useVideoProviders: () => ({ ready: true, providers: wire.available ? [{ id: "bilibili" }] : [] }),
}));
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  desktopLocaleSource.setLocale("zh-CN");
  wire.available = true;
  vi.clearAllMocks();
});
it("原进度元数据透传并清除后续未知消息前的旧code，换语不重新取源", async () => {
  let report!: (value: OnlineVideoCacheProgress) => void;
  let finish!: (value: { localPath: string }) => void;
  let signal!: AbortSignal;
  wire.ensure.mockImplementation((_target, options) => {
    report = options.onProgress;
    signal = options.signal;
    return new Promise(resolve => {
      finish = resolve;
    });
  });
  const meta = { type: "bilibili", bvid: "raw-bvid", cid: "raw-cid", title: "用户来源名" };
  let source!: ReturnType<typeof useOnlineVideo>;
  function View() {
    source = useOnlineVideo(meta);
    return (
      <VideoSourceLoader
        loading={source.loading}
        error={source.error}
        streamProgress={source.streamProgress}
        tips={[]}
      />
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  const packet: OnlineVideoCacheProgress = {
    requestId: "raw-request",
    stage: "downloading",
    message: "原始主进程文本",
    percent: 50,
    code: "video.tracks.downloading",
    params: { retained: true },
    videoDownloaded: 5,
    videoTotal: 10,
    audioDownloaded: 2,
    audioTotal: 4,
  };
  await act(async () => report(packet));
  expect(source.streamProgress).toMatchObject(packet);
  const original = host.textContent;
  const bars = [...host.querySelectorAll('[role="progressbar"]')];
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(host.textContent).not.toBe(original);
  expect([...host.querySelectorAll('[role="progressbar"]')]).toEqual(bars);
  expect(wire.ensure).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
  const unknown = {
    requestId: "raw-request",
    stage: "downloading" as const,
    message: "提供方自定义进度",
    percent: 60,
  };
  await act(async () => report(unknown));
  expect(source.streamProgress?.code).toBeUndefined();
  expect(source.streamProgress?.params).toBeUndefined();
  expect(host.textContent).toContain(unknown.message);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(host.textContent).toContain(unknown.message);
  expect(wire.ensure).toHaveBeenCalledTimes(1);
  await act(async () => finish({ localPath: "/raw/video.mp4" }));
  expect(source.videoUrl).toBe("/raw/video.mp4");
  expect(wire.convert).toHaveBeenCalledTimes(1);
});

it("缺少提供方事实随语言投影，启用后的未知同文字服务错误保原诊断且不重试", async () => {
  wire.available = false;
  const meta = { type: "bilibili", bvid: "raw-id", cid: "raw-cid" };
  let state!: ReturnType<typeof useOnlineVideo>;
  function View() {
    state = useOnlineVideo(meta);
    return <span>{state.error}</span>;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  const initial = state.error;
  expect(state.loading).toBe(false);
  expect(wire.ensure).not.toHaveBeenCalled();
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(state.error).not.toBe(initial);
  expect(state.error).toContain("bilibili");
  expect(wire.ensure).not.toHaveBeenCalled();
  const unknown = new Error(initial ?? "provider diagnostic");
  wire.available = true;
  wire.ensure.mockRejectedValueOnce(unknown);
  await act(async () => root?.render(<View />));
  expect(state.error).toBe(unknown.message);
  expect(wire.ensure).toHaveBeenCalledTimes(1);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(state.error).toBe(unknown.message);
  expect(wire.ensure).toHaveBeenCalledTimes(1);
});

it("已知native下载失败换语仅投影现有错误，不重取源或改变原诊断", async () => {
  const failure = new VideoCacheFailure("http", { status: 503 });
  const original = failure.message;
  wire.ensure.mockRejectedValueOnce(failure);
  const meta = { type: "bilibili", bvid: "raw-native", cid: "raw-cid" };
  let state!: ReturnType<typeof useOnlineVideo>;
  function View() {
    state = useOnlineVideo(meta);
    return <span>{state.error}</span>;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(state.error).not.toBe(original);
  expect(state.error).toContain("503");
  const english = state.error;
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(state.error).not.toBe(english);
  expect(wire.ensure).toHaveBeenCalledTimes(1);
  expect(failure.message).toBe(original);
  expect(failure.params.status).toBe(503);
  expect(wire.convert).not.toHaveBeenCalled();
});
