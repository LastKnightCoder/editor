import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import log from "electron-log";
import type { VideoCaptions, VideoFormat, VideoProbeResult } from "@tau/plugins";
import { parseJson3Captions, selectCaptionTrack, type SubtitleInfo } from "./video-captions";
import { waitForCompiler } from "../services/compiler-process";
import PathUtil from "./PathUtil";
import FfmpegService from "./FfmpegService";

interface RawFormat {
  format_id: string;
  format?: string;
  format_note?: string;
  ext?: string;
  container?: string;
  acodec?: string;
  vcodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  audio_channels?: number;
  asr?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
  quality?: string | number;
  quality_label?: string;
  audio_quality?: string;
  dynamic_range?: string;
  resolution?: string;
  audio_ext?: string;
  video_ext?: string;
  mime_type?: string;
  protocol?: string;
  vbr?: number;
  uploader?: string;
  url?: string;
}

interface RawYtDlpInfo extends SubtitleInfo {
  formats?: RawFormat[];
  title?: string;
  fulltitle?: string;
  thumbnail?: string;
  duration?: number;
}

export interface YtDlpDownloadProgress {
  stage: "downloading" | "merging";
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  type?: "video" | "audio";
  message?: string;
}

export interface YtDlpDownloadOptions {
  url: string;
  videoFormatId: string;
  audioFormatId: string;
  outputDir: string;
  basename: string;
  targetExt: string;
  proxy?: string;
  signal?: AbortSignal;
  onProgress?: (progress: YtDlpDownloadProgress) => void;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

const RUNTIME_ERROR_RE =
  /No supported JavaScript runtime|--js-runtimes|extraction without a JS runtime/i;
const FORMAT_ERROR_RE = /Requested format is not available/i;
const ABORT_ERROR_RE = /aborted|AbortError|The user aborted a request/i;

/** yt-dlp 原始错误转为面向用户的提示，原文只写日志。 */
export function normalizeDownloadErrorMessage(rawMessage: string): string {
  if (RUNTIME_ERROR_RE.test(rawMessage)) return "应用内运行环境异常，请重启应用后重试";
  if (FORMAT_ERROR_RE.test(rawMessage)) return "所选清晰度不可用，已自动回退最佳可用格式，请重试";
  if (ABORT_ERROR_RE.test(rawMessage)) return "网络超时，请检查代理或稍后再试";
  return "下载失败，请稍后重试或尝试其他视频链接";
}

export default class YtDlpService {
  private static binaryPath: string | null = null;
  private static readonly BEST_FALLBACK_FORMAT = "bestvideo+bestaudio/best";

  static async ensureBinary(proxy?: string): Promise<string> {
    if (this.binaryPath) return this.binaryPath;
    const fileName = this.getBinaryFileName();

    const dir = path.join(PathUtil.getAppDir(), "bin");
    const binPath = path.join(dir, fileName);
    try {
      await fs.access(binPath);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
      log.info(`[YtDlp] downloading binary from ${url}`);
      await this.downloadBinary(url, binPath, 0, proxy);
    }

    await this.markExecutable(binPath);
    this.binaryPath = binPath;
    return binPath;
  }

  private static async markExecutable(filePath: string) {
    if (process.platform === "win32") return;
    await fs.chmod(filePath, 0o755).catch(() => {});
  }

  /** 查询页面标题与全部可下载格式，不做平台相关的筛选。 */
  static async probe(url: string, proxy?: string): Promise<VideoProbeResult> {
    const info = await this.fetchRawInfo(url, proxy);
    const formats: VideoFormat[] = (info.formats || [])
      .filter(format => format.format_id && (format.vcodec !== "none" || format.acodec !== "none"))
      .map(format => ({
        id: format.format_id,
        videoOnly: format.vcodec !== "none" && format.acodec === "none",
        audioOnly: format.acodec !== "none" && format.vcodec === "none",
        ext: format.ext,
        width: format.width,
        height: format.height,
        fps: format.fps,
        bitrate: format.tbr ?? format.abr,
        size: format.filesize ?? format.filesize_approx,
        note: format.format_note,
      }));
    return {
      title: info.title || info.fulltitle || url,
      cover: info.thumbnail,
      duration: info.duration,
      formats,
    };
  }

  static async getCaptions(
    url: string,
    proxy: string | undefined,
    signal: AbortSignal
  ): Promise<VideoCaptions | null> {
    const info = await this.fetchRawInfo(url, proxy, signal);
    signal.throwIfAborted();
    const track = selectCaptionTrack(info);
    if (!track) return null;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tau-video-captions-"));
    try {
      const infoFile = path.join(directory, "info.json");
      await fs.writeFile(infoFile, JSON.stringify(info), { mode: 0o600 });
      const bin = await waitForCompiler(() => this.ensureBinary(proxy), signal);
      const args = [
        "--ignore-config",
        "--no-playlist",
        "--skip-download",
        track.automatic ? "--write-auto-subs" : "--write-subs",
        "--sub-langs",
        `^${track.language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "--sub-format",
        "json3",
        "--load-info-json",
        infoFile,
        "--output",
        path.join(directory, "captions.%(ext)s"),
        ...this.buildJsRuntimeArgs(),
      ];
      if (proxy) args.push("--proxy", proxy);
      await this.exec(bin, args, signal);
      signal.throwIfAborted();
      const files = (await fs.readdir(directory)).filter(file => file.endsWith(".json3"));
      if (!files.length) return null;
      const file = path.join(directory, files[0]);
      if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error("字幕文件过大");
      return parseJson3Captions(JSON.parse(await fs.readFile(file, "utf-8")), track.language);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  static async downloadVideo(
    options: YtDlpDownloadOptions
  ): Promise<{ outputPath: string; fileSize: number }> {
    const basename = options.basename;
    const targetExt = options.targetExt;
    const bin = await this.ensureBinary(options.proxy);
    const outputTemplate = path.join(options.outputDir, `${basename}.%(ext)s`);
    const finalOutput = path.join(options.outputDir, `${basename}.${targetExt}`);
    const ffmpegPath = await FfmpegService.ensureBinary(options.proxy);

    await fs.rm(finalOutput, { force: true }).catch(() => {});

    const selectedFormat =
      options.videoFormatId && options.audioFormatId
        ? `${options.videoFormatId}+${options.audioFormatId}`
        : options.videoFormatId || YtDlpService.BEST_FALLBACK_FORMAT;
    const args = this.buildDownloadArgs(options, ffmpegPath, outputTemplate, selectedFormat);

    log.info(`[YtDlp] Download command: ${args}`);

    try {
      await this.runDownloadCommand(bin, args, options);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const shouldFallback =
        selectedFormat !== YtDlpService.BEST_FALLBACK_FORMAT &&
        this.isFormatUnavailableError(error);

      if (!shouldFallback || options.signal?.aborted) {
        log.error(`[YtDlp] Download failed: ${error.message}`);
        throw error;
      }

      log.warn(
        `[YtDlp] Selected format unavailable, retrying with fallback format: ${YtDlpService.BEST_FALLBACK_FORMAT}`
      );
      const fallbackArgs = this.buildDownloadArgs(
        options,
        ffmpegPath,
        outputTemplate,
        YtDlpService.BEST_FALLBACK_FORMAT
      );
      await fs.rm(finalOutput, { force: true }).catch(() => {});
      log.info(`[YtDlp] Download fallback command: ${fallbackArgs}`);
      try {
        await this.runDownloadCommand(bin, fallbackArgs, options);
      } catch (fallbackErr) {
        const fallbackError =
          fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
        log.error(`[YtDlp] Download fallback failed: ${fallbackError.message}`);
        throw fallbackError;
      }
    }

    const stat = await fs.stat(finalOutput);
    return { outputPath: finalOutput, fileSize: stat.size };
  }

  private static async runDownloadCommand(
    bin: string,
    args: string[],
    options: YtDlpDownloadOptions
  ) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: this.getYtDlpSpawnEnv(),
      });

      let stderrBuf = "";
      let currentType: "video" | "audio" | undefined;
      const abort = () => child.kill();
      if (options.signal?.aborted) abort();
      options.signal?.addEventListener("abort", abort, { once: true });

      const parseSize = (sizeStr: string): number => {
        const match = sizeStr.match(/([\d.]+)([KMGT]i?B)/);
        if (!match) return 0;
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        const multipliers: Record<string, number> = {
          B: 1,
          KB: 1024,
          KIB: 1024,
          MB: 1024 * 1024,
          MIB: 1024 * 1024,
          GB: 1024 * 1024 * 1024,
          GIB: 1024 * 1024 * 1024,
          TB: 1024 * 1024 * 1024 * 1024,
          TIB: 1024 * 1024 * 1024 * 1024,
        };
        return Math.floor(value * (multipliers[unit] || 1));
      };

      const parseProgress = (text: string) => {
        log.info(`[YtDlp] Download output: ${text}`);

        // 检测下载类型
        if (text.includes("[download] Destination:")) {
          if (text.includes("f" + options.videoFormatId) || text.match(/\d{3,4}x\d{3,4}/)) {
            currentType = "video";
          } else if (text.includes("f" + options.audioFormatId) || text.includes("audio")) {
            currentType = "audio";
          }
        }

        // 解析下载进度: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:45
        const downloadMatch = text.match(/\[download\]\s+([\d.]+)%\s+of\s+([\d.]+[KMGT]i?B)/i);
        if (downloadMatch) {
          const percent = parseFloat(downloadMatch[1]);
          const totalSize = parseSize(downloadMatch[2]);
          const downloadedBytes = Math.floor((totalSize * percent) / 100);

          options.onProgress?.({
            stage: "downloading",
            percent,
            downloadedBytes,
            totalBytes: totalSize,
            type: currentType,
            message:
              currentType === "video"
                ? `正在下载视频 ${percent.toFixed(1)}%`
                : currentType === "audio"
                  ? `正在下载音频 ${percent.toFixed(1)}%`
                  : `正在下载 ${percent.toFixed(1)}%`,
          });
          return;
        }

        // 解析合并进度
        if (
          text.includes("[Merger]") ||
          text.includes("[ExtractAudio]") ||
          text.includes("Merging formats into")
        ) {
          options.onProgress?.({
            stage: "merging",
            percent: 95,
            message: "正在合并音视频...",
          });
          return;
        }

        // 解析完成进度: [download] 100% of 123.45MiB in 01:23
        if (text.includes("[download] 100%")) {
          const sizeMatch = text.match(/([\d.]+[KMGT]i?B)/i);
          if (sizeMatch) {
            const totalSize = parseSize(sizeMatch[1]);
            options.onProgress?.({
              stage: "downloading",
              percent: 100,
              downloadedBytes: totalSize,
              totalBytes: totalSize,
              type: currentType,
              message:
                currentType === "video"
                  ? "视频下载完成"
                  : currentType === "audio"
                    ? "音频下载完成"
                    : "下载完成",
            });
          }
        }
      };

      // yt-dlp 的进度信息输出到 stdout
      child.stdout.on("data", chunk => {
        const text: string = chunk.toString();
        const lines = text.split("\n");
        lines.forEach((line: string) => {
          if (line.trim()) parseProgress(line);
        });
      });

      // 收集错误信息
      child.stderr.on("data", chunk => {
        const text = chunk.toString();
        stderrBuf += text;
        log.info(`[YtDlp] Download stderr: ${text}`);
        // yt-dlp 有时也会在 stderr 输出进度信息
        const lines = text.split("\n");
        lines.forEach((line: string) => {
          if (line.trim()) parseProgress(line);
        });
      });

      child.once("error", reject);
      child.once("close", code => {
        options.signal?.removeEventListener("abort", abort);
        if (options.signal?.aborted) {
          reject(new DOMException("视频下载已取消", "AbortError"));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderrBuf || "unknown error"}`));
        }
      });
    });
  }

  private static async exec(
    bin: string,
    args: string[],
    signal?: AbortSignal
  ): Promise<ExecResult> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: this.getYtDlpSpawnEnv(),
      });
      let stdout = "";
      let stderr = "";
      let failure: Error | undefined;
      const cancel = () => child.kill("SIGKILL");
      signal?.addEventListener("abort", cancel, { once: true });
      child.stdout.on("data", chunk => {
        stdout += chunk.toString();
        if (stdout.length > 8 * 1024 * 1024) {
          failure = new Error("视频探测输出过大");
          cancel();
        }
      });
      child.stderr.on("data", chunk => {
        stderr = (stderr + chunk.toString()).slice(-65536);
      });
      child.once("error", error => {
        signal?.removeEventListener("abort", cancel);
        reject(error);
      });
      child.once("close", code => {
        signal?.removeEventListener("abort", cancel);
        if (signal?.aborted) reject(signal.reason);
        else if (failure) reject(failure);
        else if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      });
      if (signal?.aborted) cancel();
    });
  }

  private static async fetchRawInfo(
    url: string,
    proxy?: string,
    signal?: AbortSignal
  ): Promise<RawYtDlpInfo> {
    const bin = signal
      ? await waitForCompiler(() => this.ensureBinary(proxy), signal)
      : await this.ensureBinary(proxy);
    const args = ["--ignore-config", "--no-playlist", "-J", ...this.buildJsRuntimeArgs()];
    if (proxy) args.push("--proxy", proxy);
    args.push("--", url);
    const { stdout } = await this.exec(bin, args, signal);
    return JSON.parse(stdout) as RawYtDlpInfo;
  }

  private static async downloadBinary(
    url: string,
    dest: string,
    redirectCount = 0,
    proxy?: string
  ): Promise<void> {
    if (redirectCount > 5) {
      throw new Error("Too many redirects while downloading yt-dlp binary");
    }
    await new Promise<void>((resolve, reject) => {
      const requestOptions: https.RequestOptions = {
        headers: { "User-Agent": "Tau-YtDlpFetcher" },
        agent: this.createProxyAgent(proxy),
      };
      https
        .get(url, requestOptions, res => {
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, url).toString();
            this.downloadBinary(nextUrl, dest, redirectCount + 1, proxy)
              .then(resolve)
              .catch(reject);
            return;
          }
          if (status >= 400) {
            reject(new Error(`Failed to download yt-dlp binary (${res.statusCode}) from ${url}`));
            log.error(`Failed to download yt-dlp binary (${res.statusCode}) from ${url}`);
            res.resume();
            return;
          }
          const fileStream = createWriteStream(dest);
          pipeline(res, fileStream)
            .then(() => resolve())
            .catch(reject);
        })
        .on("error", reject);
    });
    await this.markExecutable(dest);
  }

  private static getBinaryFileName() {
    const platform = process.platform;
    const arch = os.arch();
    if (platform === "win32") return "yt-dlp.exe";
    if (platform === "darwin") {
      return "yt-dlp_macos";
    }
    if (platform === "linux") {
      if (arch === "arm64" || arch === "aarch64") return "yt-dlp_linux_aarch64";
      if (arch.startsWith("arm")) return "yt-dlp_linux_armv7l";
      return "yt-dlp";
    }
    return "yt-dlp";
  }

  private static createProxyAgent(proxy?: string) {
    if (!proxy) return undefined;
    try {
      return new HttpsProxyAgent(proxy);
    } catch (err) {
      log.warn(
        `[YtDlp] Failed to use proxy ${proxy}: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  }

  private static buildJsRuntimeArgs(): string[] {
    const runtimePath = process.execPath?.trim();
    if (!runtimePath) {
      return ["--no-js-runtimes", "--js-runtimes", "node"];
    }
    return ["--no-js-runtimes", "--js-runtimes", `node:${runtimePath}`];
  }

  private static getYtDlpSpawnEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    };
  }

  private static buildDownloadArgs(
    options: YtDlpDownloadOptions,
    ffmpegPath: string,
    outputTemplate: string,
    formatSelector: string
  ): string[] {
    const args: string[] = [
      ...this.buildJsRuntimeArgs(),
      "-f",
      formatSelector,
      "--merge-output-format",
      options.targetExt,
      "--ffmpeg-location",
      ffmpegPath,
      "-o",
      outputTemplate,
    ];
    if (options.proxy) {
      args.push("--proxy", options.proxy);
    }
    args.push(options.url);
    return args;
  }

  private static isFormatUnavailableError(error: Error): boolean {
    return /Requested format is not available/i.test(error.message);
  }
}
