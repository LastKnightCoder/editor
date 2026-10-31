import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const rmMock = vi.fn();
const statMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const readdirMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => spawnMock(...args),
  default: {
    spawn: (...args: any[]) => spawnMock(...args),
  },
}));

vi.mock("node:fs/promises", () => ({
  rm: (...args: any[]) => rmMock(...args),
  stat: (...args: any[]) => statMock(...args),
  access: vi.fn(),
  mkdir: vi.fn(),
  chmod: vi.fn(),
  mkdtemp: vi.fn(async () => "/tmp/tau-captions-test"),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  readdir: (...args: unknown[]) => readdirMock(...args),
}));

import FfmpegService from "../FfmpegService";
import YtDlpService from "../YtDlpService";

interface SpawnPlan {
  code: number;
  stdout?: string;
  stderr?: string;
}

function createMockChildProcess(plan: SpawnPlan) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  queueMicrotask(() => {
    if (plan.stdout) {
      child.stdout.emit("data", Buffer.from(plan.stdout));
    }
    if (plan.stderr) {
      child.stderr.emit("data", Buffer.from(plan.stderr));
    }
    child.emit("close", plan.code);
  });

  return child;
}

describe("YtDlpService", () => {
  let spawnPlans: SpawnPlan[] = [];

  beforeEach(() => {
    spawnPlans = [];
    spawnMock.mockImplementation(() => {
      const plan = spawnPlans.shift();
      if (!plan) {
        throw new Error("Missing spawn plan");
      }
      return createMockChildProcess(plan);
    });

    vi.spyOn(YtDlpService, "ensureBinary").mockResolvedValue("/tmp/yt-dlp");
    vi.spyOn(FfmpegService, "ensureBinary").mockResolvedValue("/tmp/ffmpeg");
    rmMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 2048 } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    rmMock.mockReset();
    statMock.mockReset();
  });

  it("probe 应注入 js runtime 与 spawn env，并归一格式列表", async () => {
    const url = "https://www.youtube.com/watch?v=DFyc0rFBptE";
    const proxy = "http://127.0.0.1:7890";

    spawnPlans.push({
      code: 0,
      stdout: JSON.stringify({
        title: "test",
        formats: [
          {
            format_id: "137",
            vcodec: "avc1.640028",
            acodec: "none",
            ext: "mp4",
            height: 1080,
            fps: 30,
          },
          {
            format_id: "140",
            vcodec: "none",
            acodec: "mp4a.40.2",
            ext: "m4a",
            abr: 128,
          },
        ],
      }),
    });

    const info = await YtDlpService.probe(url, proxy);
    expect(info.title).toBe("test");
    expect(info.formats).toMatchObject([
      { id: "137", videoOnly: true, audioOnly: false, height: 1080 },
      { id: "140", videoOnly: false, audioOnly: true, bitrate: 128 },
    ]);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, options] = spawnMock.mock.calls[0];
    expect(bin).toBe("/tmp/yt-dlp");
    expect(args).toEqual([
      "--ignore-config",
      "--no-playlist",
      "-J",
      "--no-js-runtimes",
      "--js-runtimes",
      `node:${process.execPath}`,
      "--proxy",
      proxy,
      "--",
      url,
    ]);
    expect(options.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("只下载选定字幕，复用探测信息与代理，完成后清理临时目录", async () => {
    spawnPlans.push(
      {
        code: 0,
        stdout: JSON.stringify({
          language: "en",
          subtitles: { en: [{ ext: "json3", url: "https://cdn.test/sub" }] },
        }),
      },
      { code: 0 }
    );
    readdirMock.mockResolvedValue(["info.json", "captions.en.json3"]);
    readFileMock.mockResolvedValue(
      JSON.stringify({ events: [{ tStartMs: 10, dDurationMs: 900, segs: [{ utf8: "hello" }] }] })
    );
    const result = await YtDlpService.getCaptions(
      "https://video.test/v",
      "http://proxy.test:7890",
      new AbortController().signal
    );
    expect(result).toEqual({ language: "en", segments: [{ text: "hello", start: 10, end: 910 }] });
    const args = spawnMock.mock.calls[1][1];
    expect(args).toEqual(
      expect.arrayContaining([
        "--skip-download",
        "--write-subs",
        "--sub-format",
        "json3",
        "--sub-langs",
        "^en$",
        "--load-info-json",
        "--proxy",
        "http://proxy.test:7890",
      ])
    );
    expect(args).not.toContain("--write-auto-subs");
    expect(writeFileMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      mode: 0o600,
    });
    expect(rmMock).toHaveBeenCalledWith("/tmp/tau-captions-test", { recursive: true, force: true });
  });

  it("无字幕时不启动下载，取消时不开始探测", async () => {
    spawnPlans.push({ code: 0, stdout: "{}" });
    await expect(
      YtDlpService.getCaptions("https://video.test/v", undefined, new AbortController().signal)
    ).resolves.toBeNull();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    await expect(
      YtDlpService.getCaptions("https://video.test/v", undefined, AbortSignal.abort())
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("downloadVideo 在格式不可用时应自动回退到 best 格式", async () => {
    spawnPlans.push(
      {
        code: 1,
        stderr: "ERROR: [youtube] DFyc0rFBptE: Requested format is not available",
      },
      {
        code: 0,
      }
    );

    const result = await YtDlpService.downloadVideo({
      url: "https://www.youtube.com/watch?v=DFyc0rFBptE",
      videoFormatId: "96",
      audioFormatId: "140",
      outputDir: "/tmp",
      basename: "yt-cache",
      targetExt: "mp4",
    });

    expect(result.outputPath).toBe(path.join("/tmp", "yt-cache.mp4"));
    expect(result.fileSize).toBe(2048);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const firstArgs = spawnMock.mock.calls[0][1] as string[];
    const secondArgs = spawnMock.mock.calls[1][1] as string[];

    expect(firstArgs).toContain("--no-js-runtimes");
    expect(firstArgs).toContain(`node:${process.execPath}`);
    expect(firstArgs).toContain("96+140");

    expect(secondArgs).toContain("--no-js-runtimes");
    expect(secondArgs).toContain(`node:${process.execPath}`);
    expect(secondArgs).toContain("bestvideo+bestaudio/best");

    const firstSpawnOptions = spawnMock.mock.calls[0][2];
    const secondSpawnOptions = spawnMock.mock.calls[1][2];
    expect(firstSpawnOptions.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(secondSpawnOptions.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("downloadVideo 非格式错误时不应触发回退", async () => {
    spawnPlans.push({
      code: 1,
      stderr: "ERROR: network timeout",
    });

    await expect(
      YtDlpService.downloadVideo({
        url: "https://www.youtube.com/watch?v=DFyc0rFBptE",
        videoFormatId: "96",
        audioFormatId: "140",
        outputDir: "/tmp",
        basename: "yt-cache",
        targetExt: "mp4",
      })
    ).rejects.toThrow("network timeout");

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeDownloadErrorMessage", () => {
  it("运行环境、格式不可用、超时与未知错误分别给出用户提示", async () => {
    const { normalizeDownloadErrorMessage } = await import("../YtDlpService");
    expect(normalizeDownloadErrorMessage("No supported JavaScript runtime could be found")).toBe(
      "应用内运行环境异常，请重启应用后重试"
    );
    expect(normalizeDownloadErrorMessage("ERROR: Requested format is not available")).toBe(
      "所选清晰度不可用，已自动回退最佳可用格式，请重试"
    );
    expect(normalizeDownloadErrorMessage("The user aborted a request")).toBe(
      "网络超时，请检查代理或稍后再试"
    );
    expect(normalizeDownloadErrorMessage("ERROR: something else")).toBe(
      "下载失败，请稍后重试或尝试其他视频链接"
    );
  });
});
