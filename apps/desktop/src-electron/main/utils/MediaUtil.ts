import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import FfmpegService from "./FfmpegService";

export default class MediaUtil {
  /**
   * 获取媒体文件时长
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
      ffmpegProcess.stderr.on("data", data => {
        stderr += data.toString();
      });

      ffmpegProcess.on("close", () => {
        // 解析 Duration: HH:MM:SS.ms 格式
        const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
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

      ffmpegProcess.on("error", err => {
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
    onProgress?: (progress: number) => void
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
        .on("progress", progress => {
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
    onProgress: (progress: number) => void
  ) {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions(["-c:v copy", "-c:a copy", "-shortest"])
        .on("progress", progress => {
          onProgress(progress.percent || 0);
        })
        .on("end", () => {
          resolve(true);
        })
        .on("error", err => {
          console.error("merge error", err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  static async replaceAudioSegment(
    originalAudioPath: string,
    newSegmentPath: string,
    outputPath: string,
    startTime: number,
    originalDuration: number,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    const tempDir = path.dirname(outputPath);
    const beforePath = path.join(tempDir, `before-${Date.now()}.mp3`);
    const afterPath = path.join(tempDir, `after-${Date.now()}.mp3`);
    const newSegmentMp3Path = path.join(tempDir, `new-segment-${Date.now()}.mp3`);
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
      if (startTime > 0) concatList.push(`file '${beforePath.replace(/\\/g, "/")}'`);
      concatList.push(`file '${newSegmentMp3Path.replace(/\\/g, "/")}'`);
      concatList.push(`file '${afterPath.replace(/\\/g, "/")}'`);

      await fs.writeFile(concatListPath, concatList.join("\n"));

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .on("progress", progress => {
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
    duration: number
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
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .on("progress", progress => {
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
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await FfmpegService.ensureFluentFfmpegPath();
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioChannels(1) // 单声道
        .audioFrequency(16000) // 16kHz - Whisper 原生采样率
        .audioCodec("libmp3lame")
        .audioBitrate("64k") // 语音识别不需要高比特率
        .on("progress", progress => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }
}
