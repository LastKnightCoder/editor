// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhisperASR, localASRAudioFile } from "../asr-whisper";
import type { TranscriptionService } from "../whisper-engine";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const original = {
  text: "中文",
  language: "zh",
  languageProbability: 1,
  duration: 1,
  processingTime: 0,
  segments: [],
  wordSegments: [{ text: "中文", start: 20, end: 900 }],
};
function engine() {
  const mock = {
    hasPrecompiledProgram: vi.fn(async () => true),
    isModelDownloaded: vi.fn(async () => true),
    transcribe: vi.fn<TranscriptionService["transcribe"]>(async () => original),
  };
  return { mock, instance: mock as unknown as TranscriptionService };
}
describe("Whisper 文件提供方", () => {
  it("只声明文件最终结果，模型缺失明确报告，配置在任务前固定", async () => {
    const { mock, instance } = engine();
    const config = { modelSize: "base" as const, useLLMOptimization: true };
    const provider = createWhisperASR(instance, config);
    const signal = new AbortController().signal;
    await expect(
      provider.probe({ input: "stream", language: "zh-CN" }, signal)
    ).resolves.toMatchObject({ state: "unsupported", textUpdates: "final-only" });
    mock.isModelDownloaded.mockResolvedValue(false);
    await expect(
      provider.probe({ input: "file", language: "auto" }, signal)
    ).resolves.toMatchObject({ state: "needs-assets", timestamps: "word" });
    config.useLLMOptimization = false;
    const root = await mkdtemp(path.join(os.tmpdir(), "tau-asr-test-"));
    roots.push(root);
    const file = path.join(root, "中文.wav");
    await writeFile(file, "audio");
    const task = await provider.transcribeFile(
      { audio: await localASRAudioFile(file), language: "zh-CN" },
      { taskId: "one", signal, onEvent() {} }
    );
    const result = await task.result;
    expect(result.words).toEqual([{ text: "中文", startMs: 20, endMs: 900 }]);
    expect(result).not.toHaveProperty("languageConfidence");
    expect(mock.transcribe.mock.calls[0][1]).toMatchObject({
      useLLMOptimization: true,
      language: "zh-CN",
    });
  });
  it("外部读取句柄按流落临时文件，失败也清理且不使用来源文件名拼路径", async () => {
    const { mock, instance } = engine();
    let staged = "";
    mock.transcribe.mockImplementation(async (file: string) => {
      staged = file;
      expect(await readFile(file, "utf8")).toBe("sample");
      throw new Error("识别失败");
    });
    const provider = createWhisperASR(instance, {});
    const task = await provider.transcribeFile(
      {
        language: "auto",
        audio: {
          name: "../../escape.wav",
          mimeType: "audio/wav",
          sizeBytes: 6,
          async open() {
            return new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("sample"));
                controller.close();
              },
            });
          },
        },
      },
      { taskId: "two", signal: new AbortController().signal, onEvent() {} }
    );
    await expect(task.result).rejects.toThrow("识别失败");
    await expect(readFile(staged)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
