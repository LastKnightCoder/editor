import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoMetaInfo } from "@/types";
import { useVideoNoteSource } from "../useVideoNoteSource";

const idle = { videoUrl: null, loading: false, error: null, streamProgress: null };
const { bilibili, youtube, remote } = vi.hoisted(() => ({
  bilibili: vi.fn(),
  youtube: vi.fn(),
  remote: vi.fn(),
}));
vi.mock("@/hooks/useBilibiliVideo", () => ({ useBilibiliVideo: bilibili }));
vi.mock("@/hooks/useYoutubeVideo", () => ({ useYoutubeVideo: youtube }));
vi.mock("@/hooks/useRemoteVideo", () => ({ useRemoteVideo: remote }));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (s: unknown) => unknown) =>
    select({ setting: { misc: { video: { autoCacheRemote: true } } } }),
}));
vi.mock("@/utils/video", () => ({ shouldUseLocalVideoCache: () => true }));
vi.mock("@/components/BilibiliVideoLoader", () => ({ default: () => null }));
vi.mock("@/components/YoutubeVideoLoader", () => ({ default: () => null }));
vi.mock("@/components/RemoteVideoLoader", () => ({ default: () => null }));

type Source = ReturnType<typeof useVideoNoteSource>;

function renderSource(metaInfo: VideoMetaInfo | null) {
  let result: Source | undefined;
  function Harness() {
    result = useVideoNoteSource(metaInfo);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  return { result: result!, unmount: () => act(() => root.unmount()) };
}

describe("useVideoNoteSource", () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    vi.clearAllMocks();
  });

  it("本地视频：直接用文件路径，走 LocalVideo", () => {
    bilibili.mockReturnValue(idle);
    youtube.mockReturnValue(idle);
    remote.mockReturnValue(idle);
    const r = renderSource({ type: "local", filePath: "/a.mp4" } as VideoMetaInfo);
    unmount = r.unmount;
    expect(r.result).toMatchObject({ src: "/a.mp4", useLocalVideo: true, ready: true });
    // 不适用的来源 hook 收到 undefined
    expect(bilibili).toHaveBeenCalledWith(undefined);
    expect(remote).toHaveBeenCalledWith(undefined);
  });

  it("B 站视频：地址与加载态取自 bilibili hook", () => {
    bilibili.mockReturnValue({ ...idle, videoUrl: "blob:bili" });
    youtube.mockReturnValue(idle);
    remote.mockReturnValue(idle);
    const meta = { type: "bilibili", bvid: "BV1", cid: "1" } as VideoMetaInfo;
    const r = renderSource(meta);
    unmount = r.unmount;
    expect(bilibili).toHaveBeenCalledWith(meta);
    expect(r.result).toMatchObject({ src: "blob:bili", useLocalVideo: false, ready: true });
  });

  it("远程视频下载中：未就绪", () => {
    bilibili.mockReturnValue(idle);
    youtube.mockReturnValue(idle);
    remote.mockReturnValue({ ...idle, loading: true });
    const r = renderSource({ type: "remote", url: "https://x/v.mp4" } as VideoMetaInfo);
    unmount = r.unmount;
    expect(remote).toHaveBeenCalledWith("https://x/v.mp4");
    expect(r.result).toMatchObject({ loading: true, ready: false });
  });

  it("元信息未到：视为加载中", () => {
    bilibili.mockReturnValue(idle);
    youtube.mockReturnValue(idle);
    remote.mockReturnValue(idle);
    const r = renderSource(null);
    unmount = r.unmount;
    expect(r.result).toMatchObject({ src: null, loading: true, ready: false });
  });
});
