import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import log from "electron-log";
import type { YoutubeVideoInfo } from "@/types/youtube";
import PathUtil from "./PathUtil";
import type { StreamOption } from "@/types/youtube";
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

interface RawSubtitleEntry {
  ext?: string;
  name?: string;
  url?: string;
}

interface RawYtDlpInfo {
  formats?: RawFormat[];
  title?: string;
  fulltitle?: string;
  thumbnail?: string;
  duration?: number;
  language?: string;
  subtitles?: Record<string, RawSubtitleEntry[]>;
  automatic_captions?: Record<string, RawSubtitleEntry[]>;
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
  onProgress?: (progress: YtDlpDownloadProgress) => void;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface YoutubeSubtitleTrack {
  lang: string;
  ext: string;
  url: string;
  name?: string;
  isAuto: boolean;
}

export interface YoutubeSubtitleManifest {
  sourceLanguage?: string;
  tracks: YoutubeSubtitleTrack[];
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

  static async fetchVideoInfo(
    url: string,
    proxy?: string,
  ): Promise<YoutubeVideoInfo> {
    try {
      const info = await this.fetchRawInfo(url, proxy);
      const formats: RawFormat[] = info.formats || [];

      log.info(`[YtDlp] Video info: ${JSON.stringify(info)}`);

      const videoStreams: StreamOption[] = formats
        .filter((f) => f.vcodec !== "none" && f.acodec === "none")
        .map((f: any) => ({
          id: f.format_id,
          resolution: f.height ? `${f.height}p` : "Unknown",
          format: f.ext,
          fps: f.fps,
          codecs: f.vcodec,
          bitrate: f.tbr ? f.tbr * 1024 : 0,
          videoOnly: true,
          audioOnly: false,
        }));

      const audioStreams: StreamOption[] = formats
        .filter((f: any) => f.acodec !== "none" && f.vcodec === "none")
        .map((f: any) => ({
          id: f.format_id,
          resolution: "Audio",
          format: f.ext,
          bitrate: f.abr ? f.abr * 1024 : 0,
          codecs: f.acodec,
          videoOnly: false,
          audioOnly: true,
        }));

      if (videoStreams.length === 0) {
        formats
          .filter((f: any) => f.vcodec !== "none")
          .forEach((f: any) => {
            videoStreams.push({
              id: f.format_id,
              resolution: f.height ? `${f.height}p` : "Unknown",
              format: f.ext,
              fps: f.fps,
              codecs: f.vcodec,
              videoOnly: false,
              audioOnly: false,
            });
          });
      }

      log.info(`[YtDlp] Audio streams: ${JSON.stringify(audioStreams)}`);
      log.info(`[YtDlp] Video streams: ${JSON.stringify(videoStreams)}`);

      return {
        url,
        audioStreams,
        videoStreams,
        title: info.title || info.fulltitle || url,
        thumbnail: info.thumbnail,
        duration: info.duration,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(`[YtDlp] Failed to fetch YouTube info: ${error.message}`);
      throw error;
    }
  }

  static async fetchSubtitleManifest(
    url: string,
    proxy?: string,
  ): Promise<YoutubeSubtitleManifest> {
    const info = await this.fetchRawInfo(url, proxy);
    const manualTracks = this.buildSubtitleTracks(info.subtitles, false);
    const autoTracks = this.buildSubtitleTracks(info.automatic_captions, true);
    const tracks = [...manualTracks, ...autoTracks];
    const uniqueTracks = tracks.filter(
      (track, index, arr) =>
        arr.findIndex(
          (item) =>
            item.lang === track.lang &&
            item.ext === track.ext &&
            item.url === track.url &&
            item.isAuto === track.isAuto,
        ) === index,
    );

    const sourceLanguage =
      typeof info.language === "string" ? info.language : undefined;
    log.info(
      `[YtDlp] Subtitle manifest loaded: sourceLanguage=${sourceLanguage || "unknown"}, manual=${manualTracks.length}, auto=${autoTracks.length}, total=${uniqueTracks.length}`,
    );

    return {
      sourceLanguage,
      tracks: uniqueTracks,
    };
  }

  static async downloadSubtitleTrack(
    track: Pick<YoutubeSubtitleTrack, "url" | "ext" | "lang" | "isAuto">,
    proxy?: string,
  ): Promise<string> {
    const text = await this.fetchText(track.url, proxy);
    log.info(
      `[YtDlp] Downloaded subtitle track: lang=${track.lang}, ext=${track.ext}, isAuto=${track.isAuto}, size=${text.length}`,
    );
    return text;
  }

  static async downloadVideo(
    options: YtDlpDownloadOptions,
  ): Promise<{ outputPath: string; fileSize: number }> {
    const basename = options.basename;
    const targetExt = options.targetExt;
    const bin = await this.ensureBinary(options.proxy);
    const outputTemplate = path.join(options.outputDir, `${basename}.%(ext)s`);
    const finalOutput = path.join(
      options.outputDir,
      `${basename}.${targetExt}`,
    );
    const ffmpegPath = await FfmpegService.ensureBinary(options.proxy);

    await fs.rm(finalOutput, { force: true }).catch(() => {});

    const selectedFormat =
      options.videoFormatId && options.audioFormatId
        ? `${options.videoFormatId}+${options.audioFormatId}`
        : options.videoFormatId || YtDlpService.BEST_FALLBACK_FORMAT;
    const args = this.buildDownloadArgs(
      options,
      ffmpegPath,
      outputTemplate,
      selectedFormat,
    );

    log.info(`[YtDlp] Download command: ${args}`);

    try {
      await this.runDownloadCommand(bin, args, options);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const shouldFallback =
        selectedFormat !== YtDlpService.BEST_FALLBACK_FORMAT &&
        this.isFormatUnavailableError(error);

      if (!shouldFallback) {
        log.error(`[YtDlp] Download failed: ${error.message}`);
        throw error;
      }

      log.warn(
        `[YtDlp] Selected format unavailable, retrying with fallback format: ${YtDlpService.BEST_FALLBACK_FORMAT}`,
      );
      const fallbackArgs = this.buildDownloadArgs(
        options,
        ffmpegPath,
        outputTemplate,
        YtDlpService.BEST_FALLBACK_FORMAT,
      );
      await fs.rm(finalOutput, { force: true }).catch(() => {});
      log.info(`[YtDlp] Download fallback command: ${fallbackArgs}`);
      try {
        await this.runDownloadCommand(bin, fallbackArgs, options);
      } catch (fallbackErr) {
        const fallbackError =
          fallbackErr instanceof Error
            ? fallbackErr
            : new Error(String(fallbackErr));
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
    options: YtDlpDownloadOptions,
  ) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: this.getYtDlpSpawnEnv(),
      });

      let stderrBuf = "";
      let currentType: "video" | "audio" | undefined;

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
          if (
            text.includes("f" + options.videoFormatId) ||
            text.match(/\d{3,4}x\d{3,4}/)
          ) {
            currentType = "video";
          } else if (
            text.includes("f" + options.audioFormatId) ||
            text.includes("audio")
          ) {
            currentType = "audio";
          }
        }

        // 解析下载进度: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:45
        const downloadMatch = text.match(
          /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+[KMGT]i?B)/i,
        );
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
      child.stdout.on("data", (chunk) => {
        const text: string = chunk.toString();
        const lines = text.split("\n");
        lines.forEach((line: string) => {
          if (line.trim()) parseProgress(line);
        });
      });

      // 收集错误信息
      child.stderr.on("data", (chunk) => {
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
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `yt-dlp exited with code ${code}: ${stderrBuf || "unknown error"}`,
            ),
          );
        }
      });
    });
  }

  private static async exec(bin: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      log.info(`[YtDlp] Exec command: ${bin} ${args.join(" ")}`);
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: this.getYtDlpSpawnEnv(),
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        log.info(`[YtDlp] Exec stdout: ${text}`);
        stdout += text;
        log.info(`[YtDlp] Exec stdout: ${stdout}`);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        log.info(`[YtDlp] Exec stderr: ${stderr}`);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      });
    });
  }

  private static async fetchRawInfo(
    url: string,
    proxy?: string,
  ): Promise<RawYtDlpInfo> {
    const bin = await this.ensureBinary(proxy);
    const args = ["-J", ...this.buildJsRuntimeArgs()];
    if (proxy) args.push("--proxy", proxy);
    args.push(url);

    log.info(`[YtDlp] Fetch info command: ${args}`);
    const { stdout } = await this.exec(bin, args);
    return JSON.parse(stdout) as RawYtDlpInfo;
  }

  private static buildSubtitleTracks(
    source: Record<string, RawSubtitleEntry[]> | undefined,
    isAuto: boolean,
  ): YoutubeSubtitleTrack[] {
    if (!source) return [];

    const tracks: YoutubeSubtitleTrack[] = [];
    for (const [lang, items] of Object.entries(source)) {
      for (const item of items || []) {
        const url = item.url?.trim();
        const ext = item.ext?.trim().toLowerCase();
        if (!url || !ext) continue;
        tracks.push({
          lang,
          ext,
          url,
          name: item.name,
          isAuto,
        });
      }
    }

    return tracks;
  }

  private static async fetchText(
    url: string,
    proxy?: string,
    redirectCount = 0,
  ): Promise<string> {
    if (redirectCount > 5) {
      throw new Error("Too many redirects while downloading subtitle");
    }

    return await new Promise<string>((resolve, reject) => {
      const requestOptions: https.RequestOptions = {
        headers: { "User-Agent": "Tau-YtDlpSubtitleFetcher" },
        agent: this.createProxyAgent(proxy),
      };

      const transport = url.startsWith("https:") ? https : http;
      transport
        .get(url, requestOptions, (res) => {
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, url).toString();
            res.resume();
            this.fetchText(nextUrl, proxy, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status >= 400) {
            res.resume();
            reject(new Error(`Failed to download subtitle (${status})`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
          res.on("error", reject);
        })
        .on("error", reject);
    });
  }

  private static async downloadBinary(
    url: string,
    dest: string,
    redirectCount = 0,
    proxy?: string,
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
        .get(url, requestOptions, (res) => {
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
            reject(
              new Error(
                `Failed to download yt-dlp binary (${res.statusCode}) from ${url}`,
              ),
            );
            log.error(
              `Failed to download yt-dlp binary (${res.statusCode}) from ${url}`,
            );
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
        `[YtDlp] Failed to use proxy ${proxy}: ${err instanceof Error ? err.message : String(err)}`,
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
    formatSelector: string,
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
