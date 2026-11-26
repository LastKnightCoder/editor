import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import type { OnlineVideoCacheProgress } from "../../../shared/video-renderer";
import { useOnlineVideo } from "../useOnlineVideo";
import { VideoSourceLoader } from "@/components/VideoSourceLoader";
const wire = vi.hoisted(() => ({ ensure: vi.fn(), convert: vi.fn(async (src: string) => src) }));
vi.mock("@/commands", () => ({ convertFileSrc: wire.convert }));
vi.mock("@/commands/online-video-cache", () => ({ ensureOnlineVideo: wire.ensure }));
vi.mock("@/hooks/useVideoProviders", () => ({
  useVideoProviders: () => ({ ready: true, providers: [{ id: "bilibili" }] }),
}));
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  desktopLocaleSource.setLocale("zh-CN");
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
