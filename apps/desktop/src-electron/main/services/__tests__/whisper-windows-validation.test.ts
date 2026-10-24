// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  directories: new Set<string>(),
  cancel: undefined as (() => void) | undefined,
}));
vi.mock("electron", () => ({
  app: { getPath: () => process.env.TAU_ASR_USER_DATA!, getAppPath: () => process.cwd() },
  shell: { openPath: vi.fn() },
}));
vi.mock("../../utils/FfmpegService", () => ({
  default: { ensureFluentFfmpegPath: async () => process.env.TAU_ASR_FFMPEG! },
}));
vi.mock("../asr-process", async importOriginal => {
  const original = await importOriginal<typeof import("../asr-process")>();
  return {
    ...original,
    runASRProcess: async (...args: Parameters<typeof original.runASRProcess>) => {
      const normalizing = args[0] === process.env.TAU_ASR_FFMPEG;
      const input = args[1].at(-1)!;
      state.directories.add(path.dirname(input));
      if (!normalizing) {
        const wav = await readFile(input);
        const format = wav.indexOf(Buffer.from("fmt ")) + 8;
        expect(wav.readUInt16LE(format)).toBe(1);
        expect(wav.readUInt16LE(format + 2)).toBe(1);
        expect(wav.readUInt32LE(format + 4)).toBe(16000);
        expect(wav.readUInt16LE(format + 14)).toBe(16);
      }
      const timer = !normalizing && state.cancel ? setTimeout(state.cancel, 500) : undefined;
      try {
        return await original.runASRProcess(...args);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
});
import { TranscriptionService } from "../whisper-engine";

describe.skipIf(process.platform !== "win32" || !process.env.TAU_ASR_FIXTURE)(
  "Windows Whisper 真实程序验证",
  () => {
    it.each([
      { device: "cpu" as const, useLLMOptimization: false },
      { device: "cuda" as const, useLLMOptimization: false },
      { device: "cuda" as const, useLLMOptimization: true },
    ])(
      "合成中文音频 $device 词级=$useLLMOptimization 识别与取消",
      async options => {
        state.directories.clear();
        const engine = new TranscriptionService();
        const started = performance.now();
        const result = await engine.transcribe(process.env.TAU_ASR_FIXTURE!, {
          language: "zh",
          ...options,
        });
        const normalizedText = result.text.replace(/[\s，。！？、,.!?]/g, "");
        const tailComplete = normalizedText.endsWith("春夏秋冬雨");
        console.log(
          JSON.stringify({
            case: "windows-whisper",
            ...options,
            elapsedMs: Math.round(performance.now() - started),
            characters: result.text.length,
            tailComplete,
            tailPresent: normalizedText.includes("春夏秋冬雨"),
          })
        );
        expect(result.text.length).toBeGreaterThan(0);
        expect(normalizedText.includes("春夏秋冬雨")).toBe(true);
        const controller = new AbortController();
        state.cancel = () => controller.abort();
        const cancelStarted = performance.now();
        await expect(
          engine.transcribe(
            process.env.TAU_ASR_FIXTURE!,
            { language: "zh", ...options },
            undefined,
            controller.signal
          )
        ).rejects.toMatchObject({ code: "cancelled" });
        state.cancel = undefined;
        for (const directory of state.directories)
          await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" });
        console.log(
          JSON.stringify({
            case: "windows-whisper-cancel",
            elapsedMs: Math.round(performance.now() - cancelStarted),
            temporaryDirectoriesRemoved: state.directories.size,
          })
        );
      },
      120000
    );
  }
);
