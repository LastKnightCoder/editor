import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const rmMock = vi.fn();
const statMock = vi.fn();

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

  it("fetchVideoInfo 应注入 js runtime 与 spawn env", async () => {
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

    await YtDlpService.fetchVideoInfo(url, proxy);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, options] = spawnMock.mock.calls[0];
    expect(bin).toBe("/tmp/yt-dlp");
    expect(args).toEqual([
      "-J",
      "--no-js-runtimes",
      "--js-runtimes",
      `node:${process.execPath}`,
      "--proxy",
      proxy,
      url,
    ]);
    expect(options.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("fetchSubtitleManifest 应返回手动和自动字幕轨", async () => {
    const url = "https://www.youtube.com/watch?v=DFyc0rFBptE";

    spawnPlans.push({
      code: 0,
      stdout: JSON.stringify({
        language: "ja",
        subtitles: {
          ja: [
            {
              ext: "json3",
              url: "https://example.com/manual-ja.json3",
              name: "Japanese",
            },
          ],
        },
        automatic_captions: {
          en: [
            {
              ext: "vtt",
              url: "https://example.com/auto-en.vtt",
              name: "English (auto)",
            },
          ],
        },
      }),
    });

    const manifest = await YtDlpService.fetchSubtitleManifest(url);

    expect(manifest.sourceLanguage).toBe("ja");
    expect(manifest.tracks).toEqual([
      {
        lang: "ja",
        ext: "json3",
        url: "https://example.com/manual-ja.json3",
        name: "Japanese",
        isAuto: false,
      },
      {
        lang: "en",
        ext: "vtt",
        url: "https://example.com/auto-en.vtt",
        name: "English (auto)",
        isAuto: true,
      },
    ]);
  });

  it("downloadVideo 在格式不可用时应自动回退到 best 格式", async () => {
    spawnPlans.push(
      {
        code: 1,
        stderr:
          "ERROR: [youtube] DFyc0rFBptE: Requested format is not available",
      },
      {
        code: 0,
      },
    );

    const result = await YtDlpService.downloadVideo({
      url: "https://www.youtube.com/watch?v=DFyc0rFBptE",
      videoFormatId: "96",
      audioFormatId: "140",
      outputDir: "/tmp",
      basename: "yt-cache",
      targetExt: "mp4",
    });

    expect(result.outputPath).toBe("/tmp/yt-cache.mp4");
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
      }),
    ).rejects.toThrow("network timeout");

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
