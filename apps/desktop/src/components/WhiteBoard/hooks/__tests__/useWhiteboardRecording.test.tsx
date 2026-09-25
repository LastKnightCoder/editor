import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

import type { ISetting } from "@/stores/useSettingStore";
import { useWhiteboardRecording, type CameraOverlayState } from "../useWhiteboardRecording";

const setting: ISetting["whiteboardRecording"] = {
  outputFormat: "webm",
  saveDirectory: "",
  autoStartRecording: false,
  microphoneEnabledByDefault: false,
  cameraEnabledByDefault: false,
};

const createMockStream = (videoTrackCount: number) => {
  const tracks = Array.from({ length: videoTrackCount }, () => ({
    kind: "video",
    readyState: "live",
    stop: vi.fn(),
  }));
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
    getAudioTracks: () => [],
  } as unknown as MediaStream;
};

const setMediaDevices = (stream: MediaStream) => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([
        {
          kind: "videoinput",
          deviceId: "camera-1",
          label: "Camera",
        },
      ]),
      getUserMedia: vi.fn().mockResolvedValue(stream),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
};

const renderRecordingHook = async (onError = vi.fn()) => {
  let api: ReturnType<typeof useWhiteboardRecording> | undefined;
  const container = document.createElement("div");
  const root = createRoot(container);

  const Harness = () => {
    api = useWhiteboardRecording({ setting, onError });
    return null;
  };

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    getApi: () => api!,
    root,
    onError,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  document.body.innerHTML = "";
});

describe("useWhiteboardRecording", () => {
  it("摄像头返回无视频轨道时不显示黑色预览并给出错误提示", async () => {
    setMediaDevices(createMockStream(0));
    const { getApi, root, onError } = await renderRecordingHook();

    await act(async () => {
      await getApi().setCameraEnabled(true);
    });

    expect(getApi().state.cameraEnabled).toBe(false);
    expect(getApi().cameraOverlay).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("摄像头没有返回视频画面"));

    await act(async () => {
      root.unmount();
    });
  });

  it("摄像头返回视频轨道时显示预览", async () => {
    const stream = createMockStream(1);
    setMediaDevices(stream);
    const { getApi, root } = await renderRecordingHook();

    await act(async () => {
      await getApi().setCameraEnabled(true);
    });

    expect(getApi().state.cameraEnabled).toBe(true);
    expect(getApi().cameraOverlay).toMatchObject<CameraOverlayState>({
      stream,
      enabled: true,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("释放媒体资源时应关闭摄像头轨道并移除预览", async () => {
    const stream = createMockStream(1);
    const [videoTrack] = stream.getVideoTracks();
    setMediaDevices(stream);
    const { getApi, root } = await renderRecordingHook();

    await act(async () => {
      await getApi().setCameraEnabled(true);
    });
    expect(getApi().cameraOverlay).toBeTruthy();

    await act(async () => {
      getApi().releaseMedia();
    });

    expect(videoTrack.stop).toHaveBeenCalled();
    expect(getApi().cameraOverlay).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
