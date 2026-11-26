import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  useRemoteVideo,
  type RemoteVideoCacheProgress,
  type UseRemoteVideoDeps,
} from "../useRemoteVideo";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("缓存进度保留opaque语义与数值，普通重渲染不重新下载", async () => {
  vi.useFakeTimers();
  let report!: (value: RemoteVideoCacheProgress) => void;
  let finish!: (value: { localUrl: string; fileSize: number; cached: boolean }) => void;
  const cache = vi.fn<UseRemoteVideoDeps["cacheVideo"]>((_options, progress) => {
    if (!progress) throw new Error("missing progress callback");
    report = progress;
    return new Promise(resolve => {
      finish = resolve;
    });
  });
  const deps: UseRemoteVideoDeps = {
    cacheVideo: cache,
    getCacheStatus: async () => null,
    showError: () => undefined,
    isRemoteUrl: src => src.startsWith("https:"),
  };
  let source!: ReturnType<typeof useRemoteVideo>;
  function View() {
    source = useRemoteVideo("https://raw.example/video", deps);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<View />));
    const packet = {
      progress: 25,
      stage: "downloading",
      message: "原始消息",
      code: "video.remote.downloading",
      params: { percent: 25, boolean: true, null: null },
      fraction: 0.25,
      downloaded: 2,
      total: 8,
    };
    await act(async () => report(packet));
    expect(source.streamProgress).toMatchObject({
      stage: packet.stage,
      message: packet.message,
      code: packet.code,
      params: packet.params,
      fraction: packet.fraction,
      downloaded: packet.downloaded,
      total: packet.total,
      percent: packet.progress,
    });
    const current = source.streamProgress;
    await act(async () => root.render(<View />));
    expect(source.streamProgress).toBe(current);
    expect(cache).toHaveBeenCalledTimes(1);
    await act(async () =>
      report({ progress: 30, stage: "downloading", message: "提供方后续消息" })
    );
    expect(source.streamProgress?.code).toBeUndefined();
    expect(source.streamProgress?.params).toBeUndefined();
    await act(async () => finish({ localUrl: "raw-local", fileSize: 8, cached: false }));
    expect(source.videoUrl).toBe("raw-local");
    expect(source.streamProgress).toMatchObject({
      code: "video.remote.completed",
      params: { fileSize: 8 },
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
