// @vitest-environment node
import { expect, it, vi } from "vitest";
type Handler = (...args: unknown[]) => Promise<Record<string, string>>;
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  write: vi.fn(async () => {}),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, fn: Handler) => mocks.handlers.set(name, fn) },
}));
vi.mock("fs/promises", () => ({ mkdir: vi.fn(async () => {}), writeFile: mocks.write }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => "/isolated" } }));
vi.mock("../../utils/MediaUtil", () => ({
  default: { replaceAudioSegment: vi.fn(), extractAudioSegment: vi.fn() },
}));
import { init } from "../podcast-audio";
it("同一时刻的并发片段与替换文件不会互相覆盖", async () => {
  await init();
  vi.spyOn(Date, "now").mockReturnValue(1);
  try {
    for (const name of [
      "save_temp_segment",
      "replace_podcast_segment",
      "extract_podcast_segment",
    ]) {
      const payload = {
        buffer: new ArrayBuffer(1),
        originalAudioPath: "/a.mp3",
        newSegmentPath: "/b.wav",
        startTime: 0,
        originalDuration: 1,
        audioPath: "/a.mp3",
        duration: 1,
      };
      const values = await Promise.all([
        mocks.handlers.get(name)!({}, payload),
        mocks.handlers.get(name)!({}, payload),
      ]);
      expect(values[0].tempPath ?? values[0].outputPath).not.toBe(
        values[1].tempPath ?? values[1].outputPath
      );
    }
  } finally {
    vi.restoreAllMocks();
  }
});
