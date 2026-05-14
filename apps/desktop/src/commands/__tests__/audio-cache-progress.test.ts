import { describe, expect, it, vi } from "vitest";

vi.mock("@/electron", () => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));

import { createScopedAudioProgressHandler } from "../bilibili-audio-cache";

describe("audio cache progress handlers", () => {
  it("仅转发当前 requestId 对应的进度事件", () => {
    const onProgress = vi.fn();
    const handler = createScopedAudioProgressHandler(2, onProgress);

    handler({} as any, {
      requestId: 1,
      stage: "downloading",
      progress: 20,
      message: "其他任务",
    });
    handler({} as any, {
      requestId: 2,
      stage: "downloading",
      progress: 50,
      message: "当前任务",
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 2, progress: 50 }),
    );
  });
});
