import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import log from "electron-log";
import FfmpegService from "./FfmpegService";

type FfmpegCommand = ReturnType<typeof ffmpeg>;

type RecordingTranscodeContainer = "webm" | "mp4" | "mov" | "mkv";

export type RecordingTranscodeStrategyDescriptor =
  | {
      kind: "copy";
    }
  | {
      kind: "hardware";
      encoder: string;
      requiresVaapiDevice?: boolean;
    }
  | {
      kind: "software";
    };

export default class MediaUtil {
  private static readonly hardwareEncoderCandidatesByPlatform: Partial<
    Record<NodeJS.Platform, string[]>
  > = {
    win32: ["h264_nvenc", "h264_qsv", "h264_amf"],
    darwin: ["h264_videotoolbox"],
    linux: ["h264_vaapi", "h264_qsv", "h264_nvenc", "h264_amf"],
    aix: ["h264_qsv", "h264_nvenc", "h264_amf"],
    android: ["h264_qsv", "h264_nvenc", "h264_amf"],
    freebsd: ["h264_qsv", "h264_nvenc", "h264_amf"],
    haiku: ["h264_qsv", "h264_nvenc", "h264_amf"],
    netbsd: ["h264_qsv", "h264_nvenc", "h264_amf"],
    openbsd: ["h264_qsv", "h264_nvenc", "h264_amf"],
    sunos: ["h264_qsv", "h264_nvenc", "h264_amf"],
  };

  private static readonly recordingStrategyCache = new Map<
    RecordingTranscodeContainer,
    RecordingTranscodeStrategyDescriptor
  >();
  private static availableVideoEncodersCache: Set<string> | null = null;
  private static availableVideoEncodersInFlight: Promise<Set<string> | null> | null =
    null;
  private static vaapiDevicePathCache: string | null | undefined;

  /**
   * 获取媒体文件时长（使用 ffmpeg 而非 ffprobe）
   * @param mediaPath 媒体文件路径
   * @returns 时长（秒）
   */
  static async getMediaDuration(mediaPath: string): Promise<number> {
    const ffmpegBinaryPath = await FfmpegService.ensureFluentFfmpegPath();

    return new Promise((resolve, reject) => {
      // 使用 ffmpeg -i 获取时长，解析 stderr 输出
      const ffmpegProcess = spawn(ffmpegBinaryPath, ["-i", mediaPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      ffmpegProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("close", () => {
        // 解析 Duration: HH:MM:SS.ms 格式
        const durationMatch = stderr.match(
          /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/,
        );
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseInt(durationMatch[3], 10);
          const ms = parseInt(durationMatch[4], 10);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds + ms / 100;
          resolve(totalSeconds);
        } else {
          reject(new Error("Could not parse media duration"));
        }
      });

      ffmpegProcess.on("error", (err) => {
        reject(new Error(`Failed to get media duration: ${err.message}`));
      });
    });
  }

  /**
   * 为转录提取音频分段
   * - 16kHz 采样率 (Whisper 原生支持)
   * - 单声道
   * - 64k 比特率 (语音识别不需要高保真)
   * @param audioPath 源音频文件路径
   * @param outputPath 输出文件路径
   * @param startTime 开始时间（秒）
   * @param duration 持续时间（秒）
   * @param onProgress 进度回调
   */
  static async extractAudioSegmentForTranscription(
    audioPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .noVideo()
        .audioChannels(1) // 单声道
        .audioFrequency(16000) // 16kHz - Whisper 原生采样率
        .audioCodec("libmp3lame")
        .audioBitrate("64k") // 语音识别不需要高比特率
        .on("progress", (progress) => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }
  static async mergeVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    onProgress: (progress: number) => void,
  ) {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions(["-c:v copy", "-c:a copy", "-shortest"])
        .on("progress", (progress) => {
          onProgress(progress.percent || 0);
        })
        .on("end", () => {
          resolve(true);
        })
        .on("error", (err) => {
          console.error("merge error", err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  static clearRecordingTranscodeCache() {
    this.recordingStrategyCache.clear();
    this.availableVideoEncodersCache = null;
    this.availableVideoEncodersInFlight = null;
    this.vaapiDevicePathCache = undefined;
  }

  static getRecordingTranscodeStrategyCandidates(
    outputPath: string,
    platform: NodeJS.Platform = process.platform,
  ): RecordingTranscodeStrategyDescriptor[] {
    const container = this.getRecordingTranscodeContainer(outputPath);

    if (container === "webm") {
      return [{ kind: "software" }];
    }

    const hardwareCandidates = this.getHardwareEncoderCandidates(platform).map(
      (encoder) => ({
        kind: "hardware" as const,
        encoder,
        requiresVaapiDevice: encoder === "h264_vaapi",
      }),
    );

    if (container === "mkv") {
      return [{ kind: "copy" }, ...hardwareCandidates, { kind: "software" }];
    }

    return [...hardwareCandidates, { kind: "software" }];
  }

  static async getAvailableVideoEncoders(): Promise<Set<string> | null> {
    if (this.availableVideoEncodersCache) {
      return this.availableVideoEncodersCache;
    }
    if (this.availableVideoEncodersInFlight) {
      return this.availableVideoEncodersInFlight;
    }

    this.availableVideoEncodersInFlight = (async () => {
      try {
        const ffmpegBinaryPath = await FfmpegService.ensureFluentFfmpegPath();
        const encoderList = await new Promise<string>((resolve, reject) => {
          const child = spawn(ffmpegBinaryPath, ["-hide_banner", "-encoders"], {
            stdio: ["ignore", "pipe", "pipe"],
          });

          let output = "";
          child.stdout?.on("data", (data) => {
            output += data.toString();
          });
          child.stderr?.on("data", (data) => {
            output += data.toString();
          });
          child.on("error", reject);
          child.on("close", (code) => {
            if (code && code !== 0 && !output.trim()) {
              reject(new Error(`ffmpeg 编码器列表获取失败，退出码 ${code}`));
              return;
            }
            resolve(output);
          });
        });

        const encoders = this.parseEncoders(encoderList);
        this.availableVideoEncodersCache = encoders;
        return encoders;
      } catch (error) {
        log.warn(
          "[MediaUtil] 获取 ffmpeg 可用编码器失败，改为直接尝试转码",
          error,
        );
        return null;
      }
    })().finally(() => {
      this.availableVideoEncodersInFlight = null;
    });

    return this.availableVideoEncodersInFlight;
  }

  static async transcodeVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();

    const container = this.getRecordingTranscodeContainer(outputPath);
    const availableVideoEncoders = await this.getAvailableVideoEncoders();
    const strategyDescriptors = await this.resolveRecordingTranscodeStrategies(
      outputPath,
      availableVideoEncoders,
    );

    let lastError: unknown = null;

    for (const descriptor of strategyDescriptors) {
      try {
        await this.removeFileIfExists(outputPath);
        await this.runTranscodeStrategy(
          inputPath,
          outputPath,
          descriptor,
          onProgress,
        );

        if (
          descriptor.kind !== "software" &&
          (container !== "mkv" || descriptor.kind === "copy")
        ) {
          this.recordingStrategyCache.set(container, descriptor);
        }
        return;
      } catch (error) {
        lastError = error;
        log.warn("[MediaUtil] 视频转码策略失败，准备尝试下一种策略", {
          container,
          descriptor,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "视频转码失败"));
  }

  private static async resolveRecordingTranscodeStrategies(
    outputPath: string,
    availableVideoEncoders: Set<string> | null,
  ): Promise<RecordingTranscodeStrategyDescriptor[]> {
    const container = this.getRecordingTranscodeContainer(outputPath);
    const candidates = this.getRecordingTranscodeStrategyCandidates(outputPath);
    const cachedStrategy =
      container === "mkv"
        ? undefined
        : this.recordingStrategyCache.get(container);
    const orderedCandidates = cachedStrategy
      ? [
          cachedStrategy,
          ...candidates.filter((candidate) => {
            return !this.isSameRecordingTranscodeStrategy(
              candidate,
              cachedStrategy,
            );
          }),
        ]
      : candidates;

    const hardwareAvailability = availableVideoEncoders ?? null;
    const resolvedStrategies: RecordingTranscodeStrategyDescriptor[] = [];

    for (const candidate of orderedCandidates) {
      if (candidate.kind === "hardware") {
        if (
          hardwareAvailability &&
          !hardwareAvailability.has(candidate.encoder)
        ) {
          continue;
        }

        if (candidate.requiresVaapiDevice) {
          const vaapiDevicePath = await this.resolveVaapiDevicePath();
          if (!vaapiDevicePath) {
            continue;
          }
        }
      }

      resolvedStrategies.push(candidate);
    }

    return resolvedStrategies;
  }

  private static async runTranscodeStrategy(
    inputPath: string,
    outputPath: string,
    descriptor: RecordingTranscodeStrategyDescriptor,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    const container = this.getRecordingTranscodeContainer(outputPath);
    const command = ffmpeg(inputPath);
    this.applyRecordingTranscodeStrategy(command, descriptor, container);

    return new Promise((resolve, reject) => {
      command
        .on("progress", (progress) => {
          onProgress?.(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .save(outputPath);
    });
  }

  private static applyRecordingTranscodeStrategy(
    command: FfmpegCommand,
    descriptor: RecordingTranscodeStrategyDescriptor,
    container: RecordingTranscodeContainer,
  ) {
    if (descriptor.kind === "copy") {
      command.videoCodec("copy").audioCodec("copy");
      return;
    }

    if (descriptor.kind === "hardware") {
      command.videoCodec(descriptor.encoder).audioCodec("aac");
      command.audioBitrate("192k");
      command.outputOptions(["-pix_fmt yuv420p"]);

      if (descriptor.encoder === "h264_vaapi") {
        const vaapiDevicePath = this.vaapiDevicePathCache;
        if (vaapiDevicePath) {
          command.inputOptions(["-vaapi_device", vaapiDevicePath]);
        }
        command.outputOptions(["-vf format=nv12,hwupload"]);
      }
    } else {
      command
        .videoCodec("libx264")
        .audioCodec("aac")
        .audioBitrate("192k")
        .outputOptions(["-preset superfast", "-crf 23", "-pix_fmt yuv420p"]);
    }

    if (container === "mp4" || container === "mov") {
      command.outputOptions(["-movflags +faststart"]);
    }
  }

  private static getRecordingTranscodeContainer(
    outputPath: string,
  ): RecordingTranscodeContainer {
    const extension = path.extname(outputPath).toLowerCase();
    if (extension === ".mp4") {
      return "mp4";
    }
    if (extension === ".mov") {
      return "mov";
    }
    if (extension === ".mkv") {
      return "mkv";
    }
    return "webm";
  }

  private static getHardwareEncoderCandidates(platform: NodeJS.Platform) {
    return (
      this.hardwareEncoderCandidatesByPlatform[platform] || [
        "h264_qsv",
        "h264_nvenc",
        "h264_amf",
      ]
    );
  }

  private static parseEncoders(output: string): Set<string> {
    const encoders = new Set<string>();

    output.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*[A-Z\.]{6}\s+([a-z0-9_]+)/i);
      if (match?.[1]) {
        encoders.add(match[1]);
      }
    });

    return encoders;
  }

  private static isSameRecordingTranscodeStrategy(
    left: RecordingTranscodeStrategyDescriptor,
    right: RecordingTranscodeStrategyDescriptor,
  ) {
    if (left.kind !== right.kind) {
      return false;
    }

    if (left.kind === "hardware" && right.kind === "hardware") {
      return left.encoder === right.encoder;
    }

    return true;
  }

  private static async resolveVaapiDevicePath(): Promise<string | null> {
    if (this.vaapiDevicePathCache !== undefined) {
      return this.vaapiDevicePathCache;
    }

    const candidates = [
      "/dev/dri/renderD128",
      "/dev/dri/renderD129",
      "/dev/dri/card0",
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        this.vaapiDevicePathCache = candidate;
        return candidate;
      } catch {
        continue;
      }
    }

    this.vaapiDevicePathCache = null;
    return null;
  }

  private static async removeFileIfExists(filePath: string) {
    await fs.rm(filePath, { force: true }).catch(() => {});
  }

  static async replaceAudioSegment(
    originalAudioPath: string,
    newSegmentPath: string,
    outputPath: string,
    startTime: number,
    originalDuration: number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    const tempDir = path.dirname(outputPath);
    const beforePath = path.join(tempDir, `before-${Date.now()}.mp3`);
    const afterPath = path.join(tempDir, `after-${Date.now()}.mp3`);
    const newSegmentMp3Path = path.join(
      tempDir,
      `new-segment-${Date.now()}.mp3`,
    );
    const concatListPath = path.join(tempDir, `concat-${Date.now()}.txt`);

    const endTime = startTime + originalDuration;

    try {
      // 转换新片段为 mp3 格式
      await new Promise((resolve, reject) => {
        ffmpeg(newSegmentPath)
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .output(newSegmentMp3Path)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      if (startTime > 0) {
        await new Promise((resolve, reject) => {
          ffmpeg(originalAudioPath)
            .setStartTime(0)
            .setDuration(startTime)
            .audioCodec("libmp3lame")
            .audioBitrate("192k")
            .output(beforePath)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });
      }

      await new Promise((resolve, reject) => {
        ffmpeg(originalAudioPath)
          .setStartTime(endTime)
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .output(afterPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      const concatList = [];
      if (startTime > 0)
        concatList.push(`file '${beforePath.replace(/\\/g, "/")}'`);
      concatList.push(`file '${newSegmentMp3Path.replace(/\\/g, "/")}'`);
      concatList.push(`file '${afterPath.replace(/\\/g, "/")}'`);

      await fs.writeFile(concatListPath, concatList.join("\n"));

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .on("progress", (progress) => {
            if (onProgress) onProgress(progress.percent || 0);
          })
          .on("end", resolve)
          .on("error", reject)
          .save(outputPath);
      });

      if (startTime > 0) await fs.unlink(beforePath).catch(() => {});
      await fs.unlink(afterPath).catch(() => {});
      await fs.unlink(newSegmentMp3Path).catch(() => {});
      await fs.unlink(concatListPath).catch(() => {});
    } catch (error) {
      if (startTime > 0) await fs.unlink(beforePath).catch(() => {});
      await fs.unlink(afterPath).catch(() => {});
      await fs.unlink(newSegmentMp3Path).catch(() => {});
      await fs.unlink(concatListPath).catch(() => {});
      throw error;
    }
  }

  static async extractAudioSegment(
    audioPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
  }

  static async extractAudioFromVideo(
    videoPath: string,
    outputPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .on("progress", (progress) => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }

  /**
   * 为转录优化的音频提取
   * - 16kHz 采样率 (Whisper 原生支持)
   * - 单声道
   * - 低比特率 (语音识别不需要高保真)
   * 这比标准提取快 2-3 倍
   */
  static async extractAudioForTranscription(
    videoPath: string,
    outputPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioChannels(1) // 单声道
        .audioFrequency(16000) // 16kHz - Whisper 原生采样率
        .audioCodec("libmp3lame")
        .audioBitrate("64k") // 语音识别不需要高比特率
        .on("progress", (progress) => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }
}
