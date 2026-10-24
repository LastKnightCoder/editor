// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ root: "", run: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: () => state.root, getAppPath: () => state.root },
  shell: { openPath: vi.fn() },
}));
vi.mock("../asr-process", async importOriginal => ({
  ...(await importOriginal<typeof import("../asr-process")>()),
  runASRProcess: state.run,
}));
vi.mock("../../utils/FfmpegService", () => ({
  default: { ensureFluentFfmpegPath: async () => "ffmpeg-fixture" },
}));
import { TranscriptionService } from "../whisper-engine";
import { ASRProcessExitError } from "../asr-process";

const workingDirectories = new Set<string>();
beforeEach(async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), "tau-whisper-中文 空格-"));
  await mkdir(path.join(state.root, "build/bin/darwin"), { recursive: true });
  await writeFile(path.join(state.root, "build/bin/darwin/whisper-cli"), "fixture");
  await mkdir(path.join(state.root, "models/whisper-cpp-base"), { recursive: true });
  await writeFile(path.join(state.root, "models/whisper-cpp-base/ggml-base.bin"), "fixture");
  await mkdir(path.join(state.root, "bin"), { recursive: true });
  await writeFile(path.join(state.root, "bin/faster-whisper.exe"), "fixture");
  await mkdir(path.join(state.root, "models/faster-whisper-base"), { recursive: true });
  await writeFile(path.join(state.root, "models/faster-whisper-base/model.bin"), "fixture");
  state.run.mockReset();
  workingDirectories.clear();
  state.run.mockImplementation(async (binary: string, args: string[], signal: AbortSignal) => {
    signal.throwIfAborted();
    if (binary === "ffmpeg-fixture") {
      expect(args).toEqual(
        expect.arrayContaining(["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"])
      );
      const output = args.at(-1)!;
      workingDirectories.add(path.dirname(output));
      await writeFile(output, "normalized");
    } else {
      const output =
        process.platform === "darwin"
          ? args[args.indexOf("-of") + 1]
          : args.at(-1)!.replace(/\.wav$/, "");
      await writeFile(
        `${output}.srt`,
        "1\n00:00:00,000 --> 00:00:01,000\n1234\n\n2\n00:00:01,000 --> 00:00:02,000\n尾句\n"
      );
    }
    return { language: { language: "zh", probability: 0.98 } };
  });
});
afterEach(async () => {
  await rm(state.root, { recursive: true, force: true });
});

describe.skipIf(!["darwin", "win32"].includes(process.platform))("Whisper 文件边界", () => {
  it.skipIf(process.platform !== "win32").each([
    ["完成后退出故障", 0xc0000409, "complete", false, true],
    ["其他退出故障", 7, "complete", false, false],
    ["缺少完成标记", 0xc0000409, "written", false, false],
    ["错误输出目录", 0xc0000409, "wrong-directory", false, false],
    ["其他程序", 0xc0000409, "wrong-program", false, false],
    ["缺少字幕", 0xc0000409, "missing", false, false],
    ["残缺字幕", 0xc0000409, "truncated", false, false],
    ["空字幕", 0xc0000409, "empty", false, false],
    ["完成后取消", 0xc0000409, "complete", true, false],
  ])("%s 的恢复边界", async (_name, code, mode, cancel, succeeds) => {
    const directory = path.join(state.root, "bin/Faster-Whisper-XXL");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "faster-whisper-xxl.exe"), "fixture");
    if (mode === "wrong-program") await rm(directory, { recursive: true });
    const source = path.join(state.root, "中文 输入.wav");
    await writeFile(source, "original");
    const original = state.run.getMockImplementation()!;
    const controller = new AbortController();
    state.run.mockImplementation(async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (args[0] === "ffmpeg-fixture") return result;
      const output = args[1].at(-1).replace(/\.wav$/, ".srt");
      if (mode === "truncated") await writeFile(output, "1\n00:00:00,000 --> 00:00:01,000\n");
      if (mode === "empty") await writeFile(output, "");
      if (mode === "missing") await rm(output);
      args[4]?.(
        `Subtitles are written to '${mode === "wrong-directory" ? state.root : path.dirname(output)}' directory.`
      );
      if (mode !== "written") args[4]?.("Operation finished in:  0:00:04.464");
      if (cancel) controller.abort();
      throw new ASRProcessExitError(Number(code), result.language);
    });
    const pending = new TranscriptionService().transcribe(source, {}, undefined, controller.signal);
    if (succeeds)
      await expect(pending).resolves.toMatchObject({ text: "1234 尾句", language: "zh" });
    else
      await expect(pending).rejects.toMatchObject({
        code: cancel ? "cancelled" : mode === "missing" ? "ENOENT" : "internal",
      });
    for (const directory of workingDirectories)
      await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.skipIf(process.platform !== "win32")("GPU 程序存在时仍尊重显式 CPU 选择", async () => {
    const directory = path.join(state.root, "bin/Faster-Whisper-XXL");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "faster-whisper-xxl.exe"), "fixture");
    const source = path.join(state.root, "中文 输入.wav");
    await writeFile(source, "original");
    await new TranscriptionService().transcribe(source, { device: "cpu" });
    const call = state.run.mock.calls.find(([binary]) => binary.endsWith("faster-whisper-xxl.exe"));
    expect(call).toBeDefined();
    expect(call![1][call![1].indexOf("-d") + 1]).toBe("cpu");
  });
  it("同一来源的并发任务使用独立目录，保留数字字幕与尾句", async () => {
    const source = path.join(state.root, "source.mp3");
    await writeFile(source, "original");
    await writeFile(path.join(state.root, "source.srt"), "旧结果不能使用");
    const engine = new TranscriptionService();
    const results = await Promise.all([engine.transcribe(source), engine.transcribe(source)]);
    expect(results.map(result => result.text)).toEqual(["1234 尾句", "1234 尾句"]);
    expect(workingDirectories.size).toBe(2);
    for (const dir of workingDirectories)
      await expect(readdir(dir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(state.root, "source.srt"), "utf8")).toBe("旧结果不能使用");
  });
  it("识别进程失败即拒绝，不接受任务目录内已写出的字幕，并清理目录", async () => {
    const source = path.join(state.root, "source.wav");
    await writeFile(source, "original");
    const original = state.run.getMockImplementation()!;
    state.run.mockImplementation(async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (args[0] !== "ffmpeg-fixture") throw new Error("转录进程失败");
      return result;
    });
    await expect(new TranscriptionService().transcribe(source)).rejects.toThrow("转录进程失败");
    for (const dir of workingDirectories)
      await expect(readdir(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("已取消任务不启动处理程序，缺模型不触发自动下载", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new TranscriptionService().transcribe("missing", {}, undefined, controller.signal)
    ).rejects.toMatchObject({ code: "cancelled" });
    await rm(path.join(state.root, "models"), { recursive: true });
    const source = path.join(state.root, "source.wav");
    await writeFile(source, "original");
    await expect(new TranscriptionService().transcribe(source)).rejects.toMatchObject({
      code: "needs-assets",
    });
    expect(state.run).not.toHaveBeenCalled();
  });
});
