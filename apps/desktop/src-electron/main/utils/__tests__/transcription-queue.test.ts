// @vitest-environment node
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));
vi.mock("../MediaUtil", () => ({
  default: {
    extractAudioSegmentForTranscription: async (_source: string, output: string) => {
      await writeFile(output, "audio");
    },
  },
}));
import { TranscriptionQueueManager, type TranscriptionResult } from "../TranscriptionQueueManager";

const result = (text: string): TranscriptionResult => ({
  text,
  language: "zh",
  languageProbability: 1,
  duration: 1,
  processingTime: 0,
  segments: [{ text, start: 0, end: 1000 }],
});
describe("长音频任务队列", () => {
  it("等待全部分段并按音频顺序合并，两次同源任务不共享目录", async () => {
    const queue = new TranscriptionQueueManager({
      segmentDurationMinutes: 1 / 60,
      maxConcurrency: 2,
    });
    const first = await queue.createSegments("source", 4);
    const second = await queue.createSegments("source", 1);
    expect(path.dirname(first[0].audioPath)).not.toBe(path.dirname(second[0].audioPath));
    const merged = await queue.processQueue(
      "source",
      first,
      {},
      async file => {
        expect(await readFile(file, "utf8")).toBe("audio");
        const index = Number(/segment-(\d+)/.exec(file)![1]);
        await new Promise(resolve => setTimeout(resolve, index === 0 ? 20 : 1));
        return result(String(index));
      },
      () => {}
    );
    expect(merged.text).toBe("0 1 2 3");
    expect(merged.segments.map(s => s.start)).toEqual([0, 1000, 2000, 3000]);
    await expect(readdir(path.dirname(first[0].audioPath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await queue.cleanup(second);
  });
  it("一段失败会取消同任务在途段，等待退出后清理", async () => {
    const queue = new TranscriptionQueueManager({
      segmentDurationMinutes: 1 / 60,
      maxConcurrency: 2,
    });
    const segments = await queue.createSegments("source", 3);
    let started = 0;
    let cancelled = false;
    const pending = queue.processQueue(
      "source",
      segments,
      {},
      async (file, _options, signal) => {
        started++;
        if (file.endsWith("segment-0.mp3")) {
          await new Promise(resolve => setTimeout(resolve, 15));
          throw new Error("分段失败");
        }
        return new Promise<TranscriptionResult>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled = true;
              reject(signal.reason);
            },
            { once: true }
          );
        });
      },
      () => {}
    );
    await expect(pending).rejects.toThrow("分段失败");
    expect(started).toBe(2);
    expect(cancelled).toBe(true);
    await expect(readdir(path.dirname(segments[0].audioPath))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
